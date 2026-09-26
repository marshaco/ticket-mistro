import express from "express";
import crypto from "crypto";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

const app = express();

// ---------------------------------------------------------------------------
// Shared config, per CLAUDE.md's .env. PROVIDER_ADDRESS is who gets paid
// (this API's own wallet) — NOT the vault.
// ---------------------------------------------------------------------------
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PAY_TO = process.env.PROVIDER_ADDRESS || "PLACEHOLDER_PROVIDER_ADDRESS_1111111111";
const TOKEN_MINT = process.env.TOKEN_MINT || "PLACEHOLDER_TOKEN_MINT_11111111111111111";

const connection = new Connection(RPC_URL, "confirmed");

// The real Solana Memo program — payAsAgent() writes memos through this exact
// program, as a separate instruction alongside the Squads spendingLimitUse call.
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

// ---------------------------------------------------------------------------
// "Catalog" of paid endpoints — 3 plausible demo endpoints.
// price is in token base units. TOKEN_MINT has 0 decimals (per setup.ts), so
// these numbers are whole tokens, no decimal conversion needed anywhere.
// ---------------------------------------------------------------------------
const ENDPOINTS = {
  "/weather": {
    price: 10,
    data: (req) => {
      const city = req.query.city || "Dublin";
      const conditions = ["Sunny", "Cloudy", "Rainy", "Windy", "Clear"];
      return {
        city,
        tempC: Math.round(8 + Math.random() * 12),
        condition: conditions[Math.floor(Math.random() * conditions.length)],
      };
    },
  },
  "/stock-quote": {
    price: 20,
    data: (req) => {
      const symbol = (req.query.symbol || "ACME").toUpperCase();
      return {
        symbol,
        price: +(50 + Math.random() * 150).toFixed(2),
        changePct: +((Math.random() - 0.5) * 5).toFixed(2),
      };
    },
  },
  "/trivia": {
    price: 5,
    data: () => {
      const facts = [
        "Solana's slot time targets roughly 400ms.",
        "Squads v4 supports both multisig accounts and spending-limit-controlled vaults.",
        "SPL tokens use a shared Token Program rather than per-token contracts.",
      ];
      return { fact: facts[Math.floor(Math.random() * facts.length)] };
    },
  },
};

// ---------------------------------------------------------------------------
// In-memory state — fine for a hackathon demo.
// requestId -> { path, price }, so real verification can check the on-chain
// memo's requestId against the price we actually quoted for that path.
// ---------------------------------------------------------------------------
const pendingRequests = new Map();
const usedSignatures = new Set(); // replay protection, applies in both modes

const STUB_MODE = process.env.STUB_VERIFICATION !== "false"; // default: stubbed

for (const [path, config] of Object.entries(ENDPOINTS)) {
  app.get(path, async (req, res) => {
    const signature = req.header("X-Payment-Signature");

    // --- No payment yet: issue the 402 challenge ---
    if (!signature) {
      const requestId = crypto.randomUUID();
      pendingRequests.set(requestId, { path, price: config.price });
      return res.status(402).json({
        price: config.price,
        payTo: PAY_TO,
        requestId,
        token: TOKEN_MINT,
      });
    }

    // --- Payment attached ---
    if (usedSignatures.has(signature)) {
      return res.status(400).json({ error: "signature already used" });
    }

    if (STUB_MODE) {
      // Stub verification: only require a non-empty signature. There's no
      // real transaction to check yet, so nothing to correlate to a price.
      if (signature.trim().length === 0) {
        return res.status(402).json({ error: "empty signature" });
      }
    } else {
      const result = await verifyPaymentOnChain({ signature, path });
      if (!result.ok) {
        return res.status(402).json({ error: result.reason });
      }
    }

    usedSignatures.add(signature);
    return res.json({ data: config.data(req) });
  });
}

app.get("/health", (req, res) => res.json({ ok: true, stubMode: STUB_MODE }));

// ---------------------------------------------------------------------------
// Real verification, matching how wallet-service/index.js (payAsAgent) builds
// its transaction: a plain SPL Memo instruction ("task:<taskId>|req:<requestId>")
// plus a Squads spendingLimitUse instruction that moves tokens as an internal
// CPI (not a top-level SPL Token instruction — so we check balance deltas,
// not instruction contents, to see what actually moved).
// ---------------------------------------------------------------------------
let destinationAtaPromise;
function getDestinationAta() {
  if (!destinationAtaPromise) {
    destinationAtaPromise = getAssociatedTokenAddress(new PublicKey(TOKEN_MINT), new PublicKey(PAY_TO));
  }
  return destinationAtaPromise;
}

async function verifyPaymentOnChain({ signature, path }) {
  let tx;
  try {
    tx = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  } catch (err) {
    return { ok: false, reason: `couldn't fetch transaction: ${err.message}` };
  }
  if (!tx) {
    return { ok: false, reason: "transaction not found (not confirmed yet, or wrong signature)" };
  }

  // skipPreflight means an over-limit payment still lands on-chain with a real
  // signature, but as a FAILED transaction. That must not count as payment.
  if (tx.meta?.err) {
    return { ok: false, reason: `transaction failed on-chain: ${JSON.stringify(tx.meta.err)}` };
  }

  // 1. Find the memo instruction and pull requestId out of "task:<t>|req:<r>"
  const instructions = tx.transaction.message.instructions;
  const memoIx = instructions.find((ix) => ix.programId?.toBase58?.() === MEMO_PROGRAM_ID);
  const memoText = memoIx?.parsed; // spl-memo instructions decode straight to a string
  const match = typeof memoText === "string" && memoText.match(/^task:(.+)\|req:(.+)$/);
  if (!match) {
    return { ok: false, reason: "no valid memo found on transaction" };
  }
  const [, , requestId] = match;

  // 2. That requestId must be one we actually issued, for this same path
  const pending = pendingRequests.get(requestId);
  if (!pending || pending.path !== path) {
    return { ok: false, reason: "memo requestId doesn't match a pending request for this endpoint" };
  }

  // 3. Confirm the right amount of the right token actually reached PAY_TO's
  //    associated token account. The transfer happens inside Squads' program
  //    via CPI, so we read it off the transaction's token balance deltas
  //    rather than looking for a top-level transfer instruction.
  const destinationAta = (await getDestinationAta()).toBase58();
  const accountKeys = tx.transaction.message.accountKeys.map((k) =>
    k.pubkey ? k.pubkey.toBase58() : k.toBase58()
  );
  const pre = tx.meta.preTokenBalances || [];
  const post = tx.meta.postTokenBalances || [];

  let paidAmount = 0n;
  for (const p of post) {
    if (p.mint !== TOKEN_MINT) continue;
    if (accountKeys[p.accountIndex] !== destinationAta) continue;
    const before = pre.find((b) => b.accountIndex === p.accountIndex);
    const beforeAmt = BigInt(before?.uiTokenAmount.amount || "0");
    const afterAmt = BigInt(p.uiTokenAmount.amount);
    paidAmount += afterAmt - beforeAmt;
  }

  if (paidAmount < BigInt(pending.price)) {
    return { ok: false, reason: `paid ${paidAmount}, needed ${pending.price}` };
  }

  // Consumed — a given requestId can't be used to unlock data twice, on top
  // of the signature-level replay check already done above.
  pendingRequests.delete(requestId);
  return { ok: true };
}

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`paid-api listening on http://localhost:${port} (stub verification: ${STUB_MODE})`);
  console.log(`endpoints: ${Object.keys(ENDPOINTS).join(", ")}`);
  console.log(`payTo: ${PAY_TO}`);
});
import express, { Request } from 'express';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { Connection, ParsedTransactionWithMeta } from '@solana/web3.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const { RPC_URL, PROVIDER_ADDRESS: payTo, TOKEN_MINT: tokenMint } = process.env;
if (!RPC_URL || !payTo || !tokenMint) {
  throw new Error('RPC_URL, PROVIDER_ADDRESS and TOKEN_MINT must be set in .env (see scripts/setup.ts)');
}

// Only for testing the agent without a wallet. Real on-chain verification is the default.
const STUB_MODE = process.env.STUB_VERIFICATION === 'true';

const connection = new Connection(RPC_URL, 'confirmed');

// Catalog of paid endpoints. Prices are in token base units; TOKEN_MINT has 0 decimals,
// so these are whole tokens.
const ENDPOINTS: Record<string, { price: number; data: (req: Request) => unknown }> = {
  '/weather': {
    price: 10,
    data: (req) => {
      const city = String(req.query.city || 'Dublin');
      const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Clear'];
      return {
        city,
        tempC: Math.round(8 + Math.random() * 12),
        condition: conditions[Math.floor(Math.random() * conditions.length)],
      };
    },
  },
  '/stock-quote': {
    price: 20,
    data: (req) => {
      const symbol = String(req.query.symbol || 'ACME').toUpperCase();
      return {
        symbol,
        price: +(50 + Math.random() * 150).toFixed(2),
        changePct: +((Math.random() - 0.5) * 5).toFixed(2),
      };
    },
  },
  '/trivia': {
    price: 5,
    data: () => {
      const facts = [
        "Solana's slot time targets roughly 400ms.",
        'Squads v4 supports both multisig accounts and spending-limit-controlled vaults.',
        'SPL tokens use a shared Token Program rather than per-token contracts.',
      ];
      return { fact: facts[Math.floor(Math.random() * facts.length)] };
    },
  },
};

// requestId -> the path and price we quoted in the 402, so a payment for a cheap
// endpoint can't unlock an expensive one.
const pendingRequests = new Map<string, { path: string; price: number }>();
const usedSignatures = new Set<string>();

// Token amount (base units) that `owner` received of `mint` in this tx. The transfer happens
// inside Squads via CPI, so read it from the token balance deltas, not the instructions.
function tokenReceived(tx: ParsedTransactionWithMeta, owner: string, mint: string): bigint {
  const find = (list: any[] | null | undefined) => (list ?? []).find((b) => b.owner === owner && b.mint === mint);
  const amount = (b: any) => BigInt(b?.uiTokenAmount?.amount ?? '0');
  return amount(find(tx.meta?.postTokenBalances)) - amount(find(tx.meta?.preTokenBalances));
}

function memos(tx: ParsedTransactionWithMeta): string[] {
  return tx.transaction.message.instructions
    .filter((ix: any) => ix.program === 'spl-memo')
    .map((ix: any) => String(ix.parsed));
}

// Checks: tx confirmed and succeeded (over-limit attempts land on-chain as FAILED txs),
// memo req:<requestId> matches a 402 we issued for this path, and >= the quoted price of
// the right mint reached payTo. Returns the requestId, or an error.
async function verifyPayment(signature: string, path: string): Promise<{ requestId: string } | { error: string }> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) return { error: 'Not a valid Solana transaction signature' };
  const tx = await connection.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx) return { error: 'Transaction not found or not confirmed' };
  if (tx.meta?.err) return { error: `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}` };

  const requestId = memos(tx)
    .map((m) => /req:([^|\s"]+)/.exec(m)?.[1])
    .find((id) => id && pendingRequests.get(id)?.path === path);
  if (!requestId) return { error: `Memo has no req:<requestId> matching a pending request for ${path}` };

  const { price } = pendingRequests.get(requestId)!;
  const received = tokenReceived(tx, payTo!, tokenMint!);
  if (received < BigInt(price)) return { error: `Paid ${received}, price is ${price}` };
  return { requestId };
}

for (const [path, config] of Object.entries(ENDPOINTS)) {
  app.get(path, async (req, res) => {
    const signature = req.header('X-Payment-Signature');

    // No payment yet: issue the 402 challenge
    if (!signature || signature.trim() === '') {
      const requestId = randomUUID();
      pendingRequests.set(requestId, { path, price: config.price });
      return res.status(402).json({ price: config.price, payTo, requestId, token: tokenMint });
    }

    if (usedSignatures.has(signature)) {
      return res.status(409).json({ error: 'Signature already used' });
    }

    if (!STUB_MODE) {
      try {
        const result = await verifyPayment(signature, path);
        if ('error' in result) return res.status(402).json({ error: result.error });
        pendingRequests.delete(result.requestId);
      } catch (e: any) {
        return res.status(502).json({ error: `Could not verify payment: ${e.message}` });
      }
    }

    usedSignatures.add(signature);
    return res.json({ data: config.data(req), paymentVerified: !STUB_MODE, signature });
  });
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'paid-api', stubMode: STUB_MODE }));

app.listen(PORT, () => {
  console.log(`Paid API running on http://localhost:${PORT} (stub verification: ${STUB_MODE})`);
  console.log(`Endpoints: ${Object.entries(ENDPOINTS).map(([p, c]) => `${p} (${c.price})`).join(', ')}`);
});

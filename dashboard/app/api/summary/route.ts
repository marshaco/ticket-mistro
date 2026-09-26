// Live AgentCard data from Solana devnet. Read-only: needs no keypairs.
// Env (repo-root .env): RPC_URL, VAULT_ADDRESS, TOKEN_MINT, SPENDING_LIMIT_ADDRESS.
import path from "path";
import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

export type LivePayment = {
  signature: string;
  blockTime: number; // unix seconds
  amount: number; // whole tokens (TOKEN_MINT has 0 decimals)
  agent: string;
  memo: string; // task:<taskId>|req:<requestId>
  status: "paid" | "blocked";
  errorCode: number | null; // Squads custom error, 6026 = spending limit exceeded
};

export type Summary = {
  mode: "live";
  vault: string;
  vaultBalance: number | null;
  limit: { amount: number; remaining: number; resetsAt: number } | { frozen: true };
  payments: LivePayment[];
  updatedAt: number;
};

// Load the shared repo-root .env (the dashboard has none of its own).
try {
  process.loadEnvFile(path.resolve(process.cwd(), "..", ".env"));
} catch {
  // no root .env: the page falls back to mock data
}

const SQUADS_PROGRAM_ID = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";
const CACHE_MS = 4000;
const DAY = 86400;

// Transactions never change once confirmed, so cache them forever by signature.
const txCache = new Map<string, { agent: string; amount: number } | null>();
let cached: { at: number; data: Summary } | null = null;

function parseAmount(data: Uint8Array): number {
  // spendingLimitUse data: 8-byte discriminator, then amount as u64 little-endian
  return Number(Buffer.from(data).readBigUInt64LE(8));
}

async function loadTx(connection: Connection, signature: string) {
  if (txCache.has(signature)) return txCache.get(signature)!;
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx) return null; // not visible yet; try again next poll
  const msg = tx.transaction.message;
  const keys = msg.staticAccountKeys;
  const ix = msg.compiledInstructions.find((i) => keys[i.programIdIndex]?.toBase58() === SQUADS_PROGRAM_ID);
  const info = ix && ix.data.length >= 16 ? { agent: keys[0].toBase58(), amount: parseAmount(ix.data) } : null;
  txCache.set(signature, info);
  return info;
}

async function build(): Promise<Summary> {
  const { RPC_URL, VAULT_ADDRESS, TOKEN_MINT, SPENDING_LIMIT_ADDRESS } = process.env;
  if (!RPC_URL || !VAULT_ADDRESS || !TOKEN_MINT || !SPENDING_LIMIT_ADDRESS) {
    throw new Error("RPC_URL, VAULT_ADDRESS, TOKEN_MINT and SPENDING_LIMIT_ADDRESS must be set in the repo-root .env");
  }
  const connection = new Connection(RPC_URL, "confirmed");
  const vault = new PublicKey(VAULT_ADDRESS);

  const [sigs, balance, limit] = await Promise.all([
    connection.getSignaturesForAddress(vault, { limit: 100 }),
    connection.getParsedTokenAccountsByOwner(vault, { mint: new PublicKey(TOKEN_MINT) }),
    multisig.accounts.SpendingLimit.fromAccountAddress(connection, new PublicKey(SPENDING_LIMIT_ADDRESS)).catch(() => null),
  ]);

  const payments: LivePayment[] = [];
  for (const s of sigs) {
    // RPC memo looks like "[55] task:abc|req:uuid"; strip the length prefix
    const memo = (s.memo ?? "").replace(/^\[\d+\]\s*/, "");
    if (!memo.startsWith("task:")) continue; // setup / admin txs
    const info = await loadTx(connection, s.signature);
    if (!info) continue;
    const errorCode = (s.err as { InstructionError?: [number, { Custom?: number }] } | null)?.InstructionError?.[1]?.Custom ?? null;
    payments.push({
      signature: s.signature,
      blockTime: s.blockTime ?? 0,
      amount: info.amount,
      agent: info.agent,
      memo,
      status: s.err ? "blocked" : "paid",
      errorCode,
    });
  }

  const now = Math.floor(Date.now() / 1000);
  let limitInfo: Summary["limit"] = { frozen: true };
  if (limit) {
    const amount = Number(limit.amount.toString());
    const lastReset = Number(limit.lastReset.toString());
    // Squads resets the period lazily on the next use, so an elapsed period means full budget
    const expired = now >= lastReset + DAY;
    limitInfo = {
      amount,
      remaining: expired ? amount : Number(limit.remainingAmount.toString()),
      resetsAt: expired ? now + DAY : lastReset + DAY,
    };
  }

  const ata = balance.value[0]?.account.data.parsed?.info?.tokenAmount?.amount;
  return {
    mode: "live",
    vault: VAULT_ADDRESS,
    vaultBalance: ata === undefined ? null : Number(ata),
    limit: limitInfo,
    payments,
    updatedAt: Date.now(),
  };
}

export async function GET() {
  try {
    if (!cached || Date.now() - cached.at > CACHE_MS) {
      cached = { at: Date.now(), data: await build() };
    }
    return Response.json(cached.data);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

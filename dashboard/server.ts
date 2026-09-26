import "dotenv/config";
import express from "express";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import bs58 from "bs58";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.DASHBOARD_PORT || 3002);
const refreshIntervalMs = 4_000;
const transactionCache = new Map<string, { agent: string; amount: number }>();
const publicDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

type Payment = {
  signature: string;
  time: number | null;
  agent: string;
  taskId: string;
  requestId: string;
  amount: number;
  status: "Paid" | "Blocked";
};

type Summary = {
  vault: string;
  vaultBalance: number;
  limit: { amount: number; remaining: number; period: "day" };
  spentToday: number;
  paidCount: number;
  blockedCount: number;
  byTask: Array<{ taskId: string; total: number; count: number }>;
  payments: Payment[];
};

type CompiledInstruction = { programIdIndex: number; data: string | Uint8Array };
type TransactionMessage = {
  staticAccountKeys?: PublicKey[];
  accountKeys?: PublicKey[];
  compiledInstructions?: CompiledInstruction[];
  instructions?: CompiledInstruction[];
};

const squadsProgramId = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";

function getDashboardConfig() {
  const names = ["RPC_URL", "VAULT_ADDRESS", "TOKEN_MINT", "SPENDING_LIMIT_ADDRESS"] as const;
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);

  const rpcUrl = process.env.RPC_URL!;
  const parsedUrl = new URL(rpcUrl);
  const isDevnet = parsedUrl.hostname === "api.devnet.solana.com"
    || parsedUrl.hostname.includes("devnet")
    || parsedUrl.pathname.toLowerCase().includes("devnet");
  if (parsedUrl.protocol !== "https:" || !isDevnet) {
    throw new Error("RPC_URL must be an HTTPS Solana devnet endpoint.");
  }

  return {
    rpcUrl,
    vault: new PublicKey(process.env.VAULT_ADDRESS!),
    mint: new PublicKey(process.env.TOKEN_MINT!),
    spendingLimitAddress: new PublicKey(process.env.SPENDING_LIMIT_ADDRESS!),
  };
}

function readInstructionAmount(data: string | Uint8Array): number | null {
  const bytes = typeof data === "string" ? Buffer.from(bs58.decode(data)) : Buffer.from(data);
  if (bytes.length < 16) return null;
  return Number(bytes.readBigUInt64LE(8));
}

async function getTransactionDetails(
  connection: Connection,
  signature: string,
): Promise<{ agent: string; amount: number }> {
  const cached = transactionCache.get(signature);
  if (cached) return cached;

  const transaction = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!transaction) throw new Error("A confirmed transaction was not available.");

  const message = transaction.transaction.message as unknown as TransactionMessage;
  const accountKeys = message.staticAccountKeys ?? message.accountKeys ?? [];
  const instructions = message.compiledInstructions ?? message.instructions ?? [];
  const agent = accountKeys[0]?.toBase58() ?? "Unknown";
  let amount = 0;

  for (const instruction of instructions) {
    if (accountKeys[instruction.programIdIndex]?.toBase58() !== squadsProgramId) continue;
    const decodedAmount = readInstructionAmount(instruction.data);
    if (decodedAmount !== null) {
      amount = decodedAmount;
      break;
    }
  }

  const details = { agent, amount };
  transactionCache.set(signature, details);
  return details;
}

async function loadSummary(): Promise<Summary> {
  const config = getDashboardConfig();
  const connection = new Connection(config.rpcUrl, "confirmed");
  const [signatures, spendingLimit] = await Promise.all([
    connection.getSignaturesForAddress(config.vault, { limit: 100 }),
    multisig.accounts.SpendingLimit.fromAccountAddress(connection, config.spendingLimitAddress),
  ]);

  const memoEntries = signatures.flatMap((entry) => {
    const memo = (entry.memo ?? "").replace(/^\[\d+\]\s*/, "").trim();
    if (!memo.includes("task:")) return [];
    const parsed = /^task:([^|]+)\|req:([^|]+)$/.exec(memo);
    return [{
      signature: entry.signature,
      time: entry.blockTime,
      memo,
      taskId: parsed?.[1] ?? memo,
      requestId: parsed?.[2] ?? "",
      status: entry.err === null ? "Paid" as const : "Blocked" as const,
    }];
  });

  const newEntries = memoEntries.filter((entry) => !transactionCache.has(entry.signature));
  let nextEntry = 0;
  const workerCount = Math.min(6, newEntries.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextEntry < newEntries.length) {
      const entry = newEntries[nextEntry++];
      await getTransactionDetails(connection, entry.signature);
    }
  }));

  const payments: Payment[] = memoEntries.map((entry) => ({
    signature: entry.signature,
    time: entry.time ?? null,
    agent: transactionCache.get(entry.signature)?.agent ?? "Unknown",
    taskId: entry.taskId,
    requestId: entry.requestId,
    amount: transactionCache.get(entry.signature)?.amount ?? 0,
    status: entry.status,
  }));

  const nowSeconds = Math.floor(Date.now() / 1_000);
  const dayStart = nowSeconds - 86_400;
  const paymentsToday = payments.filter((payment) => payment.time !== null && payment.time >= dayStart);
  const paidToday = paymentsToday.filter((payment) => payment.status === "Paid");
  const taskTotals = new Map<string, { total: number; count: number }>();
  for (const payment of paidToday) {
    const current = taskTotals.get(payment.taskId) ?? { total: 0, count: 0 };
    current.total += payment.amount;
    current.count += 1;
    taskTotals.set(payment.taskId, current);
  }

  const limitAmount = Number(spendingLimit.amount.toString());
  const lastReset = Number(spendingLimit.lastReset.toString());
  const resetIsDue = nowSeconds > lastReset + 86_400;
  const remaining = resetIsDue
    ? limitAmount
    : Number(spendingLimit.remainingAmount.toString());
  const tokenAccount = getAssociatedTokenAddressSync(config.mint, config.vault, true);
  const tokenAccountInfo = await connection.getAccountInfo(tokenAccount, "confirmed");
  const vaultBalance = tokenAccountInfo
    ? Number((await connection.getTokenAccountBalance(tokenAccount, "confirmed")).value.amount)
    : 0;

  return {
    vault: config.vault.toBase58(),
    vaultBalance,
    limit: { amount: limitAmount, remaining, period: "day" },
    // Match the on-chain budget: what has been used since the last Squads period reset
    spentToday: limitAmount - remaining,
    paidCount: paidToday.length,
    blockedCount: paymentsToday.filter((payment) => payment.status === "Blocked").length,
    byTask: [...taskTotals.entries()]
      .map(([taskId, values]) => ({ taskId, ...values }))
      .sort((a, b) => b.total - a.total),
    payments,
  };
}

let cachedSummary: Summary | null = null;
let lastRefreshStartedAt = 0;
let refreshInProgress: Promise<Summary> | null = null;

async function getSummary(): Promise<Summary> {
  if (refreshInProgress) return refreshInProgress;
  if (Date.now() - lastRefreshStartedAt < refreshIntervalMs) {
    if (cachedSummary) return cachedSummary;
    throw new Error("Dashboard refresh is rate limited.");
  }

  lastRefreshStartedAt = Date.now();
  refreshInProgress = loadSummary();
  try {
    cachedSummary = await refreshInProgress;
    return cachedSummary;
  } finally {
    refreshInProgress = null;
  }
}

app.get("/api/summary", async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  try {
    response.json(await getSummary());
  } catch {
    response.status(503).json({ error: "Live devnet data is unavailable. Check dashboard configuration and devnet RPC." });
  }
});

app.use(express.static(publicDirectory));
app.get("/", (_request, response) => response.sendFile(path.join(publicDirectory, "index.html")));

app.listen(port, () => {
  console.log(`AgentCard dashboard running at http://localhost:${port}`);
});
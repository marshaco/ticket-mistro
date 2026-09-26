// AI credit tracking: logs every Claude call's real token usage and cost, and enforces the credit hard cap.
// The log (data/llm-usage.json) is read by the dashboard. This is off-chain: the provider's usage isn't on Solana.
import fs from "fs";
import path from "path";
import { Keypair } from "@solana/web3.js";

export const USAGE_LOG = path.resolve(process.env.LLM_USAGE_LOG || "./data/llm-usage.json");

// USD per million tokens (input, output). Update if the agent's model changes.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export type UsageEntry = {
  time: number; // unix ms
  taskId: string;
  provider: string; // "Anthropic" | "OpenAI" | "Google Gemini" | ...
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  simulated?: boolean;
};

const CONFIG_PATH = path.resolve("./credits.config.json");
// The agent's name comes from Settings → Agents (matched by its public key), so its AI usage and its
// on-chain purchases show under the same name on the dashboard.
function agentName(): string {
  try {
    const kp = JSON.parse(fs.readFileSync(path.resolve(process.env.AGENT_KEYPAIR_PATH || "./keys/agent.json"), "utf8")) as number[];
    const publicKey = Keypair.fromSecretKey(Uint8Array.from(kp)).publicKey.toBase58();
    const saved = JSON.parse(fs.readFileSync(path.resolve("./data/tracking-settings.json"), "utf8")).agents ?? [];
    const match = saved.find((a: { publicKey: string }) => a.publicKey === publicKey);
    if (match) return match.name;
  } catch {
    // no keypair or settings: fall back below
  }
  return process.env.AGENT_NAME || "research-agent";
}
export const AGENT_NAME = agentName();
const PROVIDER = "Anthropic";

const SETTINGS_PATH = path.resolve("./data/tracking-settings.json");

// The user picks per provider on the dashboard: "limit" (hard cap, agent stops) or "target" (tracking only).
function hardCapUsd(provider: string): number {
  try {
    const st = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")).providers?.[provider];
    if (st) return st.mode === "limit" ? Number(st.limit) : Infinity;
  } catch {
    // no saved settings yet: fall back to the config defaults
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")).providers[provider]?.hardCapUsd ?? Infinity;
  } catch {
    return Infinity;
  }
}

export const creditConfig = {
  get hardCapUsd() {
    return hardCapUsd(PROVIDER);
  },
};

export function readUsage(): UsageEntry[] {
  try {
    return JSON.parse(fs.readFileSync(USAGE_LOG, "utf8"));
  } catch {
    return [];
  }
}

export function totalUsd(provider = PROVIDER): number {
  return readUsage().filter((e) => e.provider === provider).reduce((sum, e) => sum + e.usd, 0);
}

// Hard limit: throws before a model call once the credit cap has been reached.
export function assertUnderCap() {
  const used = totalUsd();
  if (used >= creditConfig.hardCapUsd) {
    throw new Error(`AI_CREDIT_CAP_REACHED: $${used.toFixed(4)} used of the $${creditConfig.hardCapUsd} hard cap`);
  }
}

export function recordUsage(taskId: string, model: string, usage: { input_tokens: number; output_tokens: number }): UsageEntry {
  const price = PRICES[model] ?? PRICES["claude-sonnet-4-6"];
  const entry: UsageEntry = {
    time: Date.now(),
    taskId,
    provider: PROVIDER,
    agent: AGENT_NAME,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    usd: (usage.input_tokens * price.input + usage.output_tokens * price.output) / 1_000_000,
  };
  const log = readUsage();
  log.push(entry);
  fs.mkdirSync(path.dirname(USAGE_LOG), { recursive: true });
  fs.writeFileSync(USAGE_LOG, JSON.stringify(log, null, 2));
  return entry;
}

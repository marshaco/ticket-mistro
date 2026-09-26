// Shared AI-usage store for the dashboard: reads the usage log written by agents and
// the per-provider credit config. Both live at the repo root.
import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "..");
export const USAGE_LOG = path.resolve(ROOT, process.env.LLM_USAGE_LOG || "data/llm-usage.json");
const CONFIG = path.resolve(ROOT, "credits.config.json");

export type UsageEntry = {
  time: number;
  taskId: string;
  provider: string;
  agent: string;
  agentPublicKey?: string; // the agent's Solana public key (matched to Settings → Agents)
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  simulated?: boolean;
};

export type ProviderConfig = { grantUsd: number; hardCapUsd: number; minTargetUsd: number; expires: string };

export function readUsage(): UsageEntry[] {
  try {
    return JSON.parse(fs.readFileSync(USAGE_LOG, "utf8"));
  } catch {
    return [];
  }
}

export function appendUsage(entry: UsageEntry) {
  const log = readUsage();
  log.push(entry);
  fs.mkdirSync(path.dirname(USAGE_LOG), { recursive: true });
  fs.writeFileSync(USAGE_LOG, JSON.stringify(log, null, 2));
}

export function readProviders(): Record<string, ProviderConfig> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8")).providers ?? {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Tracking settings: per tracked thing, the user picks a mode and an amount.
//   "limit"  = hard limit: spending past it is blocked (purchases: on-chain by Squads; AI: agent stops)
//   "target" = spend target: tracking only, how much should be spent (before a date)
// Stored in data/tracking-settings.json, read by the dashboard and by the agent (agent/credits.ts).
// ---------------------------------------------------------------------------
export type Mode = "limit" | "target";
export type TrackSetting = { mode: Mode; limit: number; target: number; expires?: string };
// The customer's connected Squads wallet (discovered on-chain from the multisig address).
export type Wallet = { multisig: string; vault: string; spendingLimit: string; mint: string; agents: string[]; limits: number };
// The customer's agents: a name + the Solana public key the agent pays from.
export type AgentEntry = { name: string; publicKey: string; provider: string }; // provider: the AI the agent runs on
export type Settings = { purchases: TrackSetting; providers: Record<string, TrackSetting>; wallet?: Wallet; agents?: AgentEntry[] };

const SETTINGS = path.resolve(ROOT, "data/tracking-settings.json");

export function readSettings(onChainLimit?: number): Settings {
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  } catch {
    saved = {};
  }
  const providers: Record<string, TrackSetting> = {};
  for (const [name, cfg] of Object.entries(readProviders())) {
    providers[name] = saved.providers?.[name] ?? { mode: "limit", limit: cfg.hardCapUsd, target: cfg.minTargetUsd, expires: cfg.expires };
  }
  for (const [name, s] of Object.entries(saved.providers ?? {})) providers[name] ??= s;
  return {
    purchases: saved.purchases ?? { mode: "limit", limit: onChainLimit ?? 100, target: 60 },
    providers,
    wallet: saved.wallet,
    agents: saved.agents,
  };
}

export function writeSettings(s: Settings) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
}

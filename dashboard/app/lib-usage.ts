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

// AI credit tracking for every agent (Claude, OpenAI, Gemini): logs each model call's real token usage
// and cost, and enforces the provider's hard limit from Settings. The log (data/llm-usage.json) is read
// by the dashboard. This is off-chain: provider usage isn't on Solana.
import fs from "fs";
import path from "path";
import { Keypair } from "@solana/web3.js";

export const USAGE_LOG = path.resolve(process.env.LLM_USAGE_LOG || "./data/llm-usage.json");
const CONFIG_PATH = path.resolve("./credits.config.json");
const SETTINGS_PATH = path.resolve("./data/tracking-settings.json");

export type Provider = "Anthropic" | "OpenAI" | "Google Gemini";

// USD per million tokens (input, output), list prices. Unknown models fall back to the provider default.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
};
const PROVIDER_DEFAULT_PRICE: Record<Provider, string> = {
  Anthropic: "claude-sonnet-4-6",
  OpenAI: "gpt-4.1-mini",
  "Google Gemini": "gemini-2.5-flash",
};

export type UsageEntry = {
  time: number; // unix ms
  taskId: string;
  provider: string;
  agent: string;
  agentPublicKey?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  simulated?: boolean;
};

function readJson(p: string): any {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return undefined;
  }
}

// One running agent: which AI it uses and which Solana keypair it pays from.
export class AgentIdentity {
  readonly publicKey: string | undefined;
  readonly name: string;

  constructor(readonly provider: Provider, readonly keypairPath: string, fallbackName: string) {
    let pk: string | undefined;
    try {
      const secret = JSON.parse(fs.readFileSync(path.resolve(keypairPath), "utf8")) as number[];
      pk = Keypair.fromSecretKey(Uint8Array.from(secret)).publicKey.toBase58();
    } catch {
      pk = undefined;
    }
    this.publicKey = pk;
    // Name from Settings → Agents (matched by public key), so purchases and AI usage share one name
    const saved = (readJson(SETTINGS_PATH)?.agents ?? []) as { publicKey: string; name: string }[];
    this.name = saved.find((a) => a.publicKey === pk)?.name ?? fallbackName;
  }

  // Hard limit from Settings ("limit" mode); "target" mode never blocks. Falls back to credits.config.json.
  hardCapUsd(): number {
    const st = readJson(SETTINGS_PATH)?.providers?.[this.provider];
    if (st) return st.mode === "limit" ? Number(st.limit) : Infinity;
    return readJson(CONFIG_PATH)?.providers?.[this.provider]?.hardCapUsd ?? Infinity;
  }

  usedUsd(): number {
    return readUsage().filter((e) => e.provider === this.provider).reduce((sum, e) => sum + e.usd, 0);
  }

  // Throws before a model call once the provider's hard limit has been reached.
  assertUnderCap() {
    const used = this.usedUsd();
    const cap = this.hardCapUsd();
    if (used >= cap) throw new Error(`AI_CREDIT_CAP_REACHED: $${used.toFixed(4)} of ${this.provider} credits used, hard limit $${cap}`);
  }

  record(taskId: string, model: string, inputTokens: number, outputTokens: number): UsageEntry {
    const price = PRICES[model] ?? PRICES[PROVIDER_DEFAULT_PRICE[this.provider]];
    const entry: UsageEntry = {
      time: Date.now(),
      taskId,
      provider: this.provider,
      agent: this.name,
      agentPublicKey: this.publicKey,
      model,
      inputTokens,
      outputTokens,
      usd: (inputTokens * price.input + outputTokens * price.output) / 1_000_000,
    };
    const log = readUsage();
    log.push(entry);
    fs.mkdirSync(path.dirname(USAGE_LOG), { recursive: true });
    fs.writeFileSync(USAGE_LOG, JSON.stringify(log, null, 2));
    return entry;
  }
}

export function readUsage(): UsageEntry[] {
  return readJson(USAGE_LOG) ?? [];
}

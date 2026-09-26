// Demo data for the multi-provider view: model usage from an OpenAI agent and a Gemini agent,
// reported the same way any real agent would (POST /api/usage after each model call).
// Entries are flagged `simulated` in the data file. The presenters should say these numbers are demo data.
// Each demo agent has a real Solana keypair (created once in keys/demo-agents.json); paste the
// printed public keys into Settings → Agents to name them.
// Run: npx tsx scripts/simulate-other-agents.ts   (dashboard must be running)
import fs from "fs";
import { Keypair } from "@solana/web3.js";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3000";
const KEYS_PATH = "./keys/demo-agents.json";

type DemoAgent = { name: string; provider: string; secretKey: number[] };
function demoAgents(): DemoAgent[] {
  if (fs.existsSync(KEYS_PATH)) return JSON.parse(fs.readFileSync(KEYS_PATH, "utf8"));
  const agents = [
    { name: "Support agent", provider: "OpenAI" },
    { name: "Docs agent", provider: "Google Gemini" },
  ].map((a) => ({ ...a, secretKey: Array.from(Keypair.generate().secretKey) }));
  fs.mkdirSync("./keys", { recursive: true });
  fs.writeFileSync(KEYS_PATH, JSON.stringify(agents));
  return agents;
}

const agents = demoAgents().map((a) => ({ ...a, publicKey: Keypair.fromSecretKey(Uint8Array.from(a.secretKey)).publicKey.toBase58() }));
const [openai, gemini] = agents;

const calls = [
  { agent: openai, model: "gpt-4.1-mini", taskId: "support-ticket-triage", usd: 1.84 },
  { agent: openai, model: "gpt-4.1-mini", taskId: "support-ticket-triage", usd: 2.31 },
  { agent: openai, model: "gpt-4.1", taskId: "lead-research", usd: 3.12 },
  { agent: gemini, model: "gemini-2.5-flash", taskId: "contract-summary", usd: 0.96 },
  { agent: gemini, model: "gemini-2.5-flash", taskId: "contract-summary", usd: 1.41 },
];

for (const c of calls) {
  const res = await fetch(`${DASHBOARD_URL}/api/usage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: c.agent.provider,
      agent: c.agent.name,
      agentPublicKey: c.agent.publicKey,
      model: c.model,
      taskId: c.taskId,
      usd: c.usd,
      inputTokens: 0,
      outputTokens: 0,
      simulated: true,
    }),
  });
  const s = await res.json();
  console.log(`${c.agent.provider} / ${c.agent.name}: $${c.usd} → $${s.usedUsd.toFixed(2)} used`);
}

console.log("\nAgent public keys to paste into Settings → Agents:");
for (const a of agents) console.log(`  ${a.name.padEnd(14)} ${a.provider.padEnd(14)} ${a.publicKey}`);

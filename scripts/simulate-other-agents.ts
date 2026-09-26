// DEMO ONLY: reports model usage from other agents (OpenAI, Gemini) to the dashboard so the
// multi-provider view has data. Every entry is flagged simulated and the dashboard labels it.
// Real agents report the same way: POST /api/usage after each model call.
// Run: npx tsx scripts/simulate-other-agents.ts   (dashboard must be running)
const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3000";

const calls = [
  { provider: "OpenAI", agent: "support-agent", model: "gpt-4.1-mini", taskId: "support-ticket-triage", usd: 1.84 },
  { provider: "OpenAI", agent: "support-agent", model: "gpt-4.1-mini", taskId: "support-ticket-triage", usd: 2.31 },
  { provider: "OpenAI", agent: "sales-agent", model: "gpt-4.1", taskId: "lead-research", usd: 3.12 },
  { provider: "Google Gemini", agent: "docs-agent", model: "gemini-2.5-flash", taskId: "contract-summary", usd: 0.96 },
  { provider: "Google Gemini", agent: "docs-agent", model: "gemini-2.5-flash", taskId: "contract-summary", usd: 1.41 },
];

for (const c of calls) {
  const res = await fetch(`${DASHBOARD_URL}/api/usage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...c, inputTokens: 0, outputTokens: 0, simulated: true }),
  });
  const s = await res.json();
  console.log(`${c.provider} / ${c.agent}: $${c.usd} → $${s.usedUsd.toFixed(2)} used of $${s.hardCapUsd} cap${s.capReached ? " (CAP REACHED)" : ""}`);
}

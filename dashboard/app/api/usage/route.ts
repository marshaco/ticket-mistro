// Any agent, any provider, any language: report a model call here after it happens.
// POST /api/usage  { provider, agentPublicKey, agent?, model, inputTokens, outputTokens, usd, taskId? }
// Response tells the agent whether that provider's hard cap is reached, so it can stop before the next call.
import { appendUsage, readProviders, readUsage } from "../../lib-usage";

export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  if (!b || typeof b.provider !== "string" || typeof b.usd !== "number") {
    return Response.json({ error: "provider (string) and usd (number) are required" }, { status: 400 });
  }
  appendUsage({
    time: Date.now(),
    taskId: String(b.taskId ?? "untagged"),
    provider: b.provider,
    agent: String(b.agent ?? "unknown-agent"),
    agentPublicKey: b.agentPublicKey ? String(b.agentPublicKey) : undefined,
    model: String(b.model ?? "unknown"),
    inputTokens: Number(b.inputTokens ?? 0),
    outputTokens: Number(b.outputTokens ?? 0),
    usd: b.usd,
    simulated: Boolean(b.simulated),
  });
  return Response.json(status(b.provider));
}

// GET /api/usage?provider=OpenAI  → check before calling the model
export async function GET(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider");
  if (!provider) return Response.json({ error: "provider query param required" }, { status: 400 });
  return Response.json(status(provider));
}

function status(provider: string) {
  const cfg = readProviders()[provider];
  const usedUsd = readUsage().filter((e) => e.provider === provider).reduce((s, e) => s + e.usd, 0);
  const hardCapUsd = cfg?.hardCapUsd ?? null;
  return { provider, usedUsd, hardCapUsd, capReached: hardCapUsd !== null && usedUsd >= hardCapUsd };
}

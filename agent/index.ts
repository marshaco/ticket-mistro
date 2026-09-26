import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { buyData } from "./buy-data-tool";
import { AgentIdentity, type Provider } from "./credits";

// Usage:
//   npm run agent -- "What's AAPL trading at?"                    (Claude)
//   npm run agent -- --provider openai "What's AAPL trading at?"  (OpenAI)
//   npm run agent -- --provider gemini "Weather in Dublin?"       (Gemini)
// Every provider runs the same flow: buy_data tool → 402 → pay on Solana from its own key → data.
const PAID_API_URL = process.env.PAID_API_URL || "http://localhost:3001";

const args = process.argv.slice(2);
const pIdx = args.indexOf("--provider");
const providerArg = (pIdx >= 0 ? args.splice(pIdx, 2)[1] : "claude").toLowerCase();
const question = args.join(" ") || "What's the current weather in Dublin?";

const SETUP: Record<string, { provider: Provider; keypair: string; name: string; model: string }> = {
  claude: { provider: "Anthropic", keypair: process.env.AGENT_KEYPAIR_PATH || "./keys/agent.json", name: "Research agent", model: "claude-sonnet-4-6" },
  openai: { provider: "OpenAI", keypair: process.env.OPENAI_AGENT_KEYPAIR_PATH || "./keys/agent-openai.json", name: "OpenAI agent", model: process.env.OPENAI_MODEL || "gpt-4.1-mini" },
  gemini: { provider: "Google Gemini", keypair: process.env.GEMINI_AGENT_KEYPAIR_PATH || "./keys/agent-gemini.json", name: "Gemini agent", model: process.env.GEMINI_MODEL || "gemini-3.8-flash" },
};
const setup = SETUP[providerArg];
if (!setup) throw new Error(`Unknown --provider "${providerArg}" (use claude, openai or gemini)`);

const TOOL = {
  name: "buy_data",
  description:
    "Fetch paid data from the API. Handles payment automatically if the API requires it. Endpoints: /weather?city=<city> (10 tokens), /stock-quote?symbol=<ticker> (20 tokens), /trivia (5 tokens), /company-financials?ticker=<ticker> (150 tokens). Pass the full URL.",
  parameters: {
    type: "object" as const,
    properties: { endpoint: { type: "string", description: "The data endpoint URL to call" } },
    required: ["endpoint"],
  },
};

const agent = new AgentIdentity(setup.provider, setup.keypair, setup.name);
const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const prompt = `${question}\n\nThe paid data API is at ${PAID_API_URL}; use buy_data to get the data.`;

// Runs the tool, logs the purchase, returns the result for the model
async function runTool(endpoint: string) {
  const result = await buyData(endpoint, taskId, setup.keypair);
  console.log(`[purchase] ${endpoint} -> ${"error" in result ? `BLOCKED/ERROR: ${result.error}` : "paid and verified on-chain"}`);
  return result;
}

// Every model call: check the provider's hard limit first, then log the real cost
function logUsage(inputTokens: number, outputTokens: number) {
  const e = agent.record(taskId, setup.model, inputTokens, outputTokens);
  console.log(`[AI credits] ${setup.provider}: ${e.inputTokens} in / ${e.outputTokens} out tokens = $${e.usd.toFixed(4)}`);
}

async function runClaude(): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env");
  const anthropic = new Anthropic({ apiKey });
  const tools = [{ name: TOOL.name, description: TOOL.description, input_schema: TOOL.parameters }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  for (;;) {
    agent.assertUnderCap();
    const r = await anthropic.messages.create({ model: setup.model, max_tokens: 1000, tools, messages });
    logUsage(r.usage.input_tokens, r.usage.output_tokens);
    const toolUse = r.content.find((c) => c.type === "tool_use");
    if (r.stop_reason !== "tool_use" || !toolUse || toolUse.type !== "tool_use") {
      const text = r.content.find((c) => c.type === "text");
      return text?.type === "text" ? text.text : JSON.stringify(r.content);
    }
    const result = await runTool((toolUse.input as { endpoint: string }).endpoint);
    messages.push({ role: "assistant", content: r.content });
    messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) }] });
  }
}

async function runOpenAI(): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env");
  const messages: any[] = [{ role: "user", content: prompt }];
  for (;;) {
    agent.assertUnderCap();
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: setup.model, messages, tools: [{ type: "function", function: TOOL }] }),
    });
    const r = await res.json();
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${r.error?.message ?? JSON.stringify(r)}`);
    logUsage(r.usage?.prompt_tokens ?? 0, r.usage?.completion_tokens ?? 0);
    const msg = r.choices[0].message;
    if (!msg.tool_calls?.length) return msg.content ?? "";
    messages.push(msg);
    for (const call of msg.tool_calls) {
      const result = await runTool(JSON.parse(call.function.arguments).endpoint);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
}

async function runGemini(): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env");
  const contents: any[] = [{ role: "user", parts: [{ text: prompt }] }];
  for (;;) {
    agent.assertUnderCap();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${setup.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents, tools: [{ functionDeclarations: [TOOL] }] }),
    });
    const r = await res.json();
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${r.error?.message ?? JSON.stringify(r)}`);
    logUsage(r.usageMetadata?.promptTokenCount ?? 0, r.usageMetadata?.candidatesTokenCount ?? 0);
    const content = r.candidates?.[0]?.content;
    const calls = (content?.parts ?? []).filter((p: any) => p.functionCall);
    if (!calls.length) return (content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    contents.push(content);
    const responses = [];
    for (const p of calls) {
      const result = await runTool(p.functionCall.args.endpoint);
      responses.push({ functionResponse: { name: p.functionCall.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
}

async function run() {
  console.log(`Task ${taskId} · ${agent.name} (${setup.provider}, ${agent.publicKey ?? "no key"}): ${question}`);
  const answer = setup.provider === "Anthropic" ? await runClaude() : setup.provider === "OpenAI" ? await runOpenAI() : await runGemini();
  console.log(`${agent.name} says:`, answer);
  console.log(`[AI credits] ${setup.provider} total used: $${agent.usedUsd().toFixed(4)} (hard limit $${agent.hardCapUsd()})`);
}

run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

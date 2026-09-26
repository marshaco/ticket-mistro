import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { buyData } from "./buy-data-tool";
import { assertUnderCap, recordUsage, totalUsd, creditConfig } from "./credits";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error("ANTHROPIC_API_KEY is not set. Add it to your .env file before running the agent.");
}

const anthropic = new Anthropic({ apiKey });
const PAID_API_URL = process.env.PAID_API_URL || "http://localhost:3001";
const MODEL = "claude-sonnet-4-6";

// Usage: npm run agent -- "What's AAPL trading at?"
const question = process.argv.slice(2).join(" ") || "What's the current weather in Dublin?";

const tools = [{
  name: "buy_data",
  description: "Fetch paid data from the API. Handles payment automatically if the API requires it. Endpoints: /weather?city=<city> (10 tokens), /stock-quote?symbol=<ticker> (20 tokens), /trivia (5 tokens), /company-financials?ticker=<ticker> (150 tokens). Pass the full URL.",
  input_schema: {
    type: "object" as const,
    properties: {
      endpoint: { type: "string", description: "The data endpoint URL to call" }
    },
    required: ["endpoint"]
  }
}];

async function run() {
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `${question}\n\nThe paid data API is at ${PAID_API_URL}; use buy_data to get the data.` }
  ];

  // Every model call goes through the credit hard cap and is logged with its real cost
  const callClaude = async () => {
    assertUnderCap();
    const r = await anthropic.messages.create({ model: MODEL, max_tokens: 1000, tools, messages });
    const e = recordUsage(taskId, MODEL, r.usage);
    console.log(`[AI credits] ${e.inputTokens} in / ${e.outputTokens} out tokens = $${e.usd.toFixed(4)}`);
    return r;
  };

  console.log(`Task ${taskId}: ${question}`);
  let response = await callClaude();

  // Handle tool use
  while (response.stop_reason === "tool_use") {
    const toolUse = response.content.find(c => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") break;

    const { endpoint } = toolUse.input as { endpoint: string };
    const result = await buyData(endpoint, taskId);
    console.log(`[purchase] ${endpoint} -> ${"error" in result ? `BLOCKED/ERROR: ${result.error}` : "paid and verified on-chain"}`);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) }]
    });

    response = await callClaude();
  }

  const finalText = response.content.find(c => c.type === "text");
  console.log("Claude says:", finalText?.type === "text" ? finalText.text : response.content);
  console.log(`[AI credits] total used: $${totalUsd().toFixed(4)} (hard cap $${creditConfig.hardCapUsd})`);
}

run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
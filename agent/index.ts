import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { buyData } from "./buy-data-tool";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error("ANTHROPIC_API_KEY is not set. Add it to your .env file before running the agent.");
}

const anthropic = new Anthropic({ apiKey });
const PAID_API_URL = process.env.PAID_API_URL || "http://localhost:3001";

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
    { role: "user", content: `What's the current weather in Dublin? The paid data API is at ${PAID_API_URL}; use buy_data to get it.` }
  ];

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    tools,
    messages
  });

  // Handle tool use
  while (response.stop_reason === "tool_use") {
    const toolUse = response.content.find(c => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") break;

    const { endpoint } = toolUse.input as { endpoint: string };
    const result = await buyData(endpoint, taskId);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) }]
    });

    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      tools,
      messages
    });
  }

  const finalText = response.content.find(c => c.type === "text");
  console.log("Claude says:", finalText?.type === "text" ? finalText.text : response.content);
}

run();
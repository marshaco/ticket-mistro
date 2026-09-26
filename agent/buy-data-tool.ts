import { payAsAgent } from "../wallet-service/index.js";

export async function buyData(endpoint: string, taskId: string, agentKeypairPath = process.env.AGENT_KEYPAIR_PATH || "./keys/agent.json") {
  // 1. First call, no payment
  let res = await fetch(endpoint);

  if (res.status === 402) {
    const { price, payTo, requestId } = await res.json();

    // 2. Pay from the Squads vault via the agent's on-chain spending limit
    const payment = await payAsAgent({
      agentKeypairPath,
      to: payTo,
      amount: price,
      taskId,
      requestId
    });

    if (!payment.ok) {
      return { error: payment.reason, detail: payment.detail };
    }

    // 3. Retry with signature and the original request id.
    const retryUrl = new URL(endpoint);
    retryUrl.searchParams.set("requestId", requestId);

    res = await fetch(retryUrl.toString(), {
      headers: {
        "X-Payment-Signature": payment.signature,
        "X-Request-Id": requestId,
      }
    });
  }

  return res.json();
}
// TEMPORARY — Person 1 will eventually replace calls to this
// with the real wallet-service function. Same shape, so nothing
// else needs to change when that happens.

export async function payAsAgent(params: {
  agentKeypairPath: string;
  to: string;
  amount: number;
  taskId: string;
  requestId: string;
}): Promise<{ ok: true; signature: string } | { ok: false; reason: "LIMIT_EXCEEDED" | "ERROR"; detail?: string }> {
  console.log("[FAKE PAY]", params);
  return { ok: true, signature: "FAKE_SIG_" + params.requestId };
}
// Pays 20 tokens repeatedly until Squads rejects on-chain (limit is 100/day by default).
// Run: npx tsx scripts/test-payments.ts
import dotenv from 'dotenv';
dotenv.config();
import { randomUUID } from 'crypto';
import { payAsAgent } from '../wallet-service/index.js';

async function run() {
  const agentKeypairPath = process.env.AGENT_KEYPAIR_PATH || './keys/agent.json';
  const to = process.env.PROVIDER_ADDRESS;
  if (!to) throw new Error('PROVIDER_ADDRESS not set (run scripts/setup.ts)');

  for (let i = 1; i <= 6; i++) {
    const r = await payAsAgent({ agentKeypairPath, to, amount: 20, taskId: 'test-task', requestId: randomUUID() });
    if (r.ok) {
      console.log(`#${i} paid 20 -> https://explorer.solana.com/tx/${r.signature}?cluster=devnet`);
    } else {
      console.log(`#${i} ${r.reason}`, r.reason === 'ERROR' ? r.detail : '');
      if (r.reason === 'LIMIT_EXCEEDED') break;
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

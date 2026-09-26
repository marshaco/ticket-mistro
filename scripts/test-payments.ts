import dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import { payAsAgent } from '../wallet-service/index.js';

async function run() {
  const agentKey = process.env.AGENT_KEYPAIR_PATH || './keys/agent.json';
  const recipient = process.env.PROVIDER_ADDRESS || 'ReplaceWithRecipientPubkey';

  console.log('Running payment tests (scaffold)');

  const okAmount = 10; // base units (interpretation depends on TOKEN_MINT decimals)
  const largeAmount = 10_000_000;

  console.log('Test 1: within-limit payment (expect success)');
  const r1 = await payAsAgent({
    agentKeypairPath: agentKey,
    to: recipient,
    amount: okAmount,
    taskId: 'test-task-1',
    requestId: 'req-1',
  });
  console.log('Result 1:', r1);

  console.log('Test 2: over-limit payment (expect LIMIT_EXCEEDED)');
  const r2 = await payAsAgent({
    agentKeypairPath: agentKey,
    to: recipient,
    amount: largeAmount,
    taskId: 'test-task-2',
    requestId: 'req-2',
  });
  console.log('Result 2:', r2);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

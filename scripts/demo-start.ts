import 'dotenv/config';
// Right before the demo: refill the agents' on-chain limit and start from an empty dashboard
// (no wallet connected, no agents registered, old activity hidden; it all stays on-chain).
// Run: npm run demo:start          (npm run demo:start -- --all  shows all history again)
import fs from 'fs';
import { execSync } from 'child_process';

const SETTINGS = 'data/tracking-settings.json';
fs.mkdirSync('data', { recursive: true });
if (process.argv.includes('--all')) {
  fs.rmSync('data/demo-since', { force: true });
  console.log('Dashboard shows all history.');
} else {
  execSync('npx tsx scripts/reset-limit.ts', { stdio: 'inherit' });
  fs.writeFileSync('data/demo-since', String(Math.floor(Date.now() / 1000)));
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    delete s.wallet;
    delete s.agents;
    fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
  } catch {
    // no settings yet: already empty
  }
  console.log('\nEmpty dashboard ready. In Settings: connect the wallet, then add the agents:');
  console.log(`  Squads multisig   ${process.env.MULTISIG_ADDRESS ?? '(see MULTISIG_ADDRESS in .env)'}`);
  execSync(`npx tsx -e "
    const { Keypair } = require('@solana/web3.js'); const fs = require('fs');
    for (const [n, p, f] of [['Research agent','Claude','keys/agent.json'],['OpenAI agent','OpenAI','keys/agent-openai.json'],['Gemini agent','Gemini','keys/agent-gemini.json']]) {
      try { console.log('  ' + n.padEnd(16) + p.padEnd(8) + Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(f,'utf8')))).publicKey.toBase58()); } catch {}
    }"`, { stdio: 'inherit' });
}

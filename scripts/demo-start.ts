// Before the demo: refill the agent's on-chain limit and start a clean dashboard view.
// Run: npm run demo:start          (npm run demo:start -- --all  shows all history again)
import fs from 'fs';
import { execSync } from 'child_process';

fs.mkdirSync('data', { recursive: true });
if (process.argv.includes('--all')) {
  fs.rmSync('data/demo-since', { force: true });
  console.log('Dashboard shows all history.');
} else {
  execSync('npx tsx scripts/reset-limit.ts', { stdio: 'inherit' });
  fs.writeFileSync('data/demo-since', String(Math.floor(Date.now() / 1000)));
  console.log('Dashboard now shows only activity from now on. Run the simulator again if you want the OpenAI/Gemini cards filled.');
}

import fs from 'fs';
import path from 'path';
import { Keypair } from '@solana/web3.js';

function writeKeypair(filePath: string, kp: Keypair) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
}

function main() {
  const owner = Keypair.generate();
  const agent = Keypair.generate();

  const ownerPath = path.resolve('./keys/owner.json');
  const agentPath = path.resolve('./keys/agent.json');

  writeKeypair(ownerPath, owner);
  writeKeypair(agentPath, agent);

  console.log('Wrote owner keypair to', ownerPath);
  console.log('Wrote agent keypair to', agentPath);
}

main();

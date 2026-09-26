import fs from 'fs';
import path from 'path';
import { Connection, Keypair } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

function loadKeypairFromFile(p) {
  const raw = fs.readFileSync(path.resolve(p), 'utf8');
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function main() {
  const rpc = process.env.RPC_URL || 'https://api.devnet.solana.com';
  const ownerPath = process.env.OWNER_KEYPAIR_PATH || './keys/owner.json';
  if (!fs.existsSync(ownerPath)) {
    console.error('Owner keypair not found at', ownerPath);
    process.exit(1);
  }

  const owner = loadKeypairFromFile(ownerPath);
  const connection = new Connection(rpc, 'confirmed');
  const balance = await connection.getBalance(owner.publicKey, 'confirmed');

  console.log('Owner public key:', owner.publicKey.toBase58());
  console.log('Balance (lamports):', balance);
  console.log('Balance (SOL):', balance / 1e9);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

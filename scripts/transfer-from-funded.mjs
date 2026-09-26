import fs from 'fs';
import path from 'path';
import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

function loadKeypair(p) {
  const raw = fs.readFileSync(path.resolve(p), 'utf8');
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function main() {
  const rpc = process.env.RPC_URL || 'https://api.devnet.solana.com';
  const fundedPath = process.env.FUNDED_KEYPAIR_PATH || process.argv[2];
  if (!fundedPath) {
    console.error('Provide FUNDED_KEYPAIR_PATH in .env or as first arg');
    process.exit(1);
  }

  const ownerPath = process.env.OWNER_KEYPAIR_PATH || './keys/owner.json';
  if (!fs.existsSync(ownerPath)) {
    console.error('Owner keypair not found at', ownerPath);
    process.exit(1);
  }

  const funded = loadKeypair(fundedPath);
  const owner = loadKeypair(ownerPath);

  const connection = new Connection(rpc, 'confirmed');
  const lamports = parseInt(process.env.AMOUNT_LAMPORTS || String(2e9), 10);

  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: funded.publicKey, toPubkey: owner.publicKey, lamports })
  );

  console.log('Sending', lamports / 1e9, 'SOL from funded key to owner:', owner.publicKey.toBase58());
  const sig = await sendAndConfirmTransaction(connection, tx, [funded], { commitment: 'confirmed' });
  console.log('Transfer submitted. Signature:', sig);
}

main().catch((e) => {
  console.error('Transfer failed:', e?.message || e);
  process.exit(1);
});

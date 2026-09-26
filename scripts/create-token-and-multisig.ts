import dotenv from 'dotenv';
dotenv.config();

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint
} from '@solana/spl-token';

function loadKeypairFromFile(p: string): Keypair {
  const raw = fs.readFileSync(path.resolve(p), 'utf8');
  const arr = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function main() {
  console.log('Starting create-token-and-multisig: creating SPL token mint and minting to owner');
  console.log('Ensure you ran `npm install` and updated .env from .env.example');

  const rpc = process.env.RPC_URL;
  if (!rpc) {
    console.error('RPC_URL not set in .env');
    process.exit(1);
  }

  const connection = new Connection(rpc, 'confirmed');

  const ownerPath = process.env.OWNER_KEYPAIR_PATH || './keys/owner.json';
  if (!fs.existsSync(ownerPath)) {
    console.error('Owner keypair not found at', ownerPath);
    console.error('Run scripts/gen-keys.mjs or provide your own keys under ./keys');
    process.exit(1);
  }

  const owner = loadKeypairFromFile(ownerPath);

  // Create new mint with 6 decimals (like USDC on devnet place-holder)
  const decimals = 6;
  const mint = await createMint(connection, owner, owner.publicKey, null, decimals);
  console.log('Created token mint:', mint.toBase58());

  // Create associated token account for owner
  const ata = await getOrCreateAssociatedTokenAccount(connection, owner, mint, owner.publicKey);
  console.log('Owner ATA:', ata.address.toBase58());

  // Mint some tokens to owner ATA
  const amount = 1_000_000_000; // 1,000 tokens with 6 decimals
  const sig = await mintTo(connection, owner, mint, ata.address, owner, amount);
  console.log('Minted', amount, 'units to owner ATA — signature:', sig);

  const mintInfo = await getMint(connection, mint);

  console.log('Mint decimals:', mintInfo.decimals);

  console.log('\nUpdate your .env with:');
  console.log(`TOKEN_MINT=${mint.toBase58()}`);
  console.log('MULTISIG_ADDRESS=');
  console.log('VAULT_ADDRESS=');
  console.log('\n(Next: create Squads multisig and vault via Squads CLI or SDK — TODO)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

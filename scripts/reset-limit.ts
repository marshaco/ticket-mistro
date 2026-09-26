// Resets (or changes) the agent's on-chain spending limit so the demo can be re-run.
// Removes the limit and re-adds it with the same createKey, so SPENDING_LIMIT_ADDRESS stays the same.
// Run: npx tsx scripts/reset-limit.ts [amount]    (amount in base units, default: current limit)
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'))));
}

async function main() {
  const { RPC_URL, MULTISIG_ADDRESS, SPENDING_LIMIT_ADDRESS } = process.env;
  if (!RPC_URL || !MULTISIG_ADDRESS || !SPENDING_LIMIT_ADDRESS) throw new Error('Run scripts/setup.ts first');
  if (RPC_URL.includes('mainnet')) throw new Error('Refusing to run against mainnet');

  const connection = new Connection(RPC_URL, 'confirmed');
  const owner = loadKeypair(process.env.OWNER_KEYPAIR_PATH || './keys/owner.json');
  const multisigPda = new PublicKey(MULTISIG_ADDRESS);
  const spendingLimit = new PublicKey(SPENDING_LIMIT_ADDRESS);

  const current = await multisig.accounts.SpendingLimit.fromAccountAddress(connection, spendingLimit);
  const amount = process.argv[2] ? BigInt(process.argv[2]) : BigInt(current.amount.toString());
  console.log(`Current limit ${current.amount} (remaining ${current.remainingAmount}) -> resetting to ${amount}`);

  const removeSig = await multisig.rpc.multisigRemoveSpendingLimit({
    connection,
    feePayer: owner,
    multisigPda,
    configAuthority: owner.publicKey,
    spendingLimit,
    rentCollector: owner.publicKey,
  });
  await connection.confirmTransaction(removeSig, 'confirmed');

  const addSig = await multisig.rpc.multisigAddSpendingLimit({
    connection,
    feePayer: owner,
    multisigPda,
    configAuthority: owner.publicKey,
    spendingLimit,
    rentPayer: owner,
    createKey: current.createKey,
    vaultIndex: current.vaultIndex,
    mint: current.mint,
    amount,
    period: current.period,
    members: current.members,
    destinations: current.destinations,
  });
  await connection.confirmTransaction(addSig, 'confirmed');

  const fresh = await multisig.accounts.SpendingLimit.fromAccountAddress(connection, spendingLimit);
  console.log(`Done. ${SPENDING_LIMIT_ADDRESS} now has ${fresh.remainingAmount}/${fresh.amount} remaining`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

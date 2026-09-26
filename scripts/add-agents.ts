// Sets up the OpenAI and Gemini agents like the Claude one: each gets its own Solana keypair, a little
// SOL for fees, and is added as a member of the on-chain Squads spending limit (so it pays from the vault,
// under the same daily limit). Safe to re-run. Note: updating the limit restarts today's allowance.
// Run: npx tsx scripts/add-agents.ts
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

const AGENTS = [
  { name: 'OpenAI agent', keypair: process.env.OPENAI_AGENT_KEYPAIR_PATH || './keys/agent-openai.json' },
  { name: 'Gemini agent', keypair: process.env.GEMINI_AGENT_KEYPAIR_PATH || './keys/agent-gemini.json' },
];

function loadOrCreate(p: string): Keypair {
  if (fs.existsSync(p)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, 'utf8'))));
  const kp = Keypair.generate();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

async function main() {
  const { RPC_URL, MULTISIG_ADDRESS, SPENDING_LIMIT_ADDRESS } = process.env;
  if (!RPC_URL || !MULTISIG_ADDRESS || !SPENDING_LIMIT_ADDRESS) throw new Error('Run scripts/setup.ts first');
  if (RPC_URL.includes('mainnet')) throw new Error('Refusing to run against mainnet');
  const connection = new Connection(RPC_URL, 'confirmed');
  const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.OWNER_KEYPAIR_PATH || './keys/owner.json', 'utf8'))));
  const multisigPda = new PublicKey(MULTISIG_ADDRESS);
  const spendingLimit = new PublicKey(SPENDING_LIMIT_ADDRESS);

  const keys = AGENTS.map((a) => ({ ...a, kp: loadOrCreate(a.keypair) }));

  // SOL for transaction fees
  for (const a of keys) {
    if ((await connection.getBalance(a.kp.publicKey)) < 0.005 * LAMPORTS_PER_SOL) {
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: a.kp.publicKey, lamports: 0.01 * LAMPORTS_PER_SOL })),
        [owner],
      );
      console.log(`Funded ${a.name} with 0.01 SOL`);
    }
  }

  // Add them as members of the spending limit (remove + re-add with the same createKey keeps the address)
  const current = await multisig.accounts.SpendingLimit.fromAccountAddress(connection, spendingLimit);
  const members = current.members.map((m) => m.toBase58());
  const missing = keys.filter((a) => !members.includes(a.kp.publicKey.toBase58()));
  if (missing.length) {
    const removeSig = await multisig.rpc.multisigRemoveSpendingLimit({
      connection, feePayer: owner, multisigPda, configAuthority: owner.publicKey, spendingLimit, rentCollector: owner.publicKey,
    });
    await connection.confirmTransaction(removeSig, 'confirmed');
    const addSig = await multisig.rpc.multisigAddSpendingLimit({
      connection, feePayer: owner, multisigPda, configAuthority: owner.publicKey, spendingLimit, rentPayer: owner,
      createKey: current.createKey, vaultIndex: current.vaultIndex, mint: current.mint, amount: BigInt(current.amount.toString()),
      period: current.period, members: [...current.members, ...missing.map((a) => a.kp.publicKey)], destinations: current.destinations,
    });
    await connection.confirmTransaction(addSig, 'confirmed');
    console.log(`Added ${missing.map((a) => a.name).join(' and ')} to the on-chain spending limit`);
  }

  console.log('\nAgent public keys (paste into Settings → Agents):');
  for (const a of keys) console.log(`  ${a.name.padEnd(14)} ${a.kp.publicKey.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

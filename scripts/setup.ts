// One-shot devnet setup. Safe to re-run: each step is skipped if its .env value already exists.
// Run: npx tsx scripts/setup.ts
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import * as multisig from '@sqds/multisig';

const { Permissions, Period } = multisig.types;

const ENV_PATH = path.resolve('.env');
const DECIMALS = 0; // 1 base unit = 1 token, so "price: 20" in the 402 means 20 tokens
const VAULT_FUNDING = 1_000n;
const LIMIT_AMOUNT = BigInt(process.env.SPENDING_LIMIT_AMOUNT || '100'); // per day, base units
const AGENT_SOL = 0.02 * LAMPORTS_PER_SOL;

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'))));
}

function loadOrCreateKeypair(p: string): Keypair {
  if (fs.existsSync(p)) return loadKeypair(p);
  const kp = Keypair.generate();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

function setEnv(key: string, value: string) {
  if (!fs.existsSync(ENV_PATH)) fs.copyFileSync(path.resolve('.env.example'), ENV_PATH);
  let text = fs.readFileSync(ENV_PATH, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
  fs.writeFileSync(ENV_PATH, text);
  process.env[key] = value;
  console.log(`  .env ${key}=${value}`);
}

async function main() {
  const rpc = process.env.RPC_URL || 'https://api.devnet.solana.com';
  if (rpc.includes('mainnet')) throw new Error('Refusing to run against mainnet');
  const connection = new Connection(rpc, 'confirmed');
  if (!process.env.RPC_URL) setEnv('RPC_URL', rpc);

  const owner = loadKeypair(process.env.OWNER_KEYPAIR_PATH || './keys/owner.json');
  const agent = loadKeypair(process.env.AGENT_KEYPAIR_PATH || './keys/agent.json');
  const provider = loadOrCreateKeypair('./keys/provider.json');

  const balance = await connection.getBalance(owner.publicKey);
  console.log(`Owner ${owner.publicKey.toBase58()} has ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    console.error('Owner needs at least 0.05 devnet SOL. Fund it, then re-run.');
    process.exit(1);
  }

  // 1. Test token
  if (!process.env.TOKEN_MINT) {
    console.log('Creating test token mint...');
    const mint = await createMint(connection, owner, owner.publicKey, null, DECIMALS);
    setEnv('TOKEN_MINT', mint.toBase58());
  }
  const mint = new PublicKey(process.env.TOKEN_MINT!);

  // 2. Multisig: owner is the only member (threshold 1) and the config authority,
  //    so the owner can add spending limits directly without a proposal.
  //    The agent is NOT a multisig member; it can only use its spending limit.
  if (!process.env.MULTISIG_ADDRESS) {
    console.log('Creating Squads multisig...');
    const createKey = Keypair.generate();
    const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
    const [programConfigPda] = multisig.getProgramConfigPda({});
    const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda);
    const sig = await multisig.rpc.multisigCreateV2({
      connection,
      treasury: programConfig.treasury,
      createKey,
      creator: owner,
      multisigPda,
      configAuthority: owner.publicKey,
      threshold: 1,
      members: [{ key: owner.publicKey, permissions: Permissions.all() }],
      timeLock: 0,
      rentCollector: null,
    });
    await connection.confirmTransaction(sig, 'confirmed');
    setEnv('MULTISIG_ADDRESS', multisigPda.toBase58());
  }
  const multisigPda = new PublicKey(process.env.MULTISIG_ADDRESS!);

  // 3. Vault PDA (index 0): this is where funds go, never the multisig account itself
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  if (process.env.VAULT_ADDRESS !== vaultPda.toBase58()) setEnv('VAULT_ADDRESS', vaultPda.toBase58());
  if (!process.env.VAULT_INDEX) setEnv('VAULT_INDEX', '0');

  // 4. Fund the vault with test tokens
  const vaultAta = await getOrCreateAssociatedTokenAccount(connection, owner, mint, vaultPda, true);
  if (vaultAta.amount === 0n) {
    console.log(`Minting ${VAULT_FUNDING} tokens to vault...`);
    await mintTo(connection, owner, mint, vaultAta.address, owner, VAULT_FUNDING);
  }
  console.log(`  vault token account ${vaultAta.address.toBase58()}`);

  // 5. Provider token account (spendingLimitUse needs the destination ATA to exist)
  if (!process.env.PROVIDER_ADDRESS) setEnv('PROVIDER_ADDRESS', provider.publicKey.toBase58());
  await getOrCreateAssociatedTokenAccount(connection, owner, mint, new PublicKey(process.env.PROVIDER_ADDRESS!));

  // 6. On-chain spending limit for the agent
  if (!process.env.SPENDING_LIMIT_ADDRESS) {
    console.log(`Adding spending limit: ${LIMIT_AMOUNT} tokens/day for agent...`);
    const createKey = Keypair.generate().publicKey;
    const [spendingLimit] = multisig.getSpendingLimitPda({ multisigPda, createKey });
    const sig = await multisig.rpc.multisigAddSpendingLimit({
      connection,
      feePayer: owner,
      multisigPda,
      configAuthority: owner.publicKey,
      spendingLimit,
      rentPayer: owner,
      createKey,
      vaultIndex: 0,
      mint,
      amount: LIMIT_AMOUNT,
      period: Period.Day,
      members: [agent.publicKey],
      destinations: [], // empty = any destination
    });
    await connection.confirmTransaction(sig, 'confirmed');
    setEnv('SPENDING_LIMIT_ADDRESS', spendingLimit.toBase58());
  }

  // 7. Agent needs a little SOL to pay tx fees
  const agentBal = await connection.getBalance(agent.publicKey);
  if (agentBal < AGENT_SOL / 2) {
    console.log('Sending 0.02 SOL to agent for fees...');
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: agent.publicKey, lamports: AGENT_SOL })
      ),
      [owner]
    );
  }

  console.log('\nSetup complete. Agent:', agent.publicKey.toBase58());
  console.log('Next: npx tsx scripts/test-payments.ts');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import * as multisig from '@sqds/multisig';
dotenv.config();

export type PayParams = {
  agentKeypairPath: string;
  to: string;
  amount: number; // base units
  taskId: string;
  requestId: string;
};

export type PayResult =
  | { ok: true; signature: string }
  | { ok: false; reason: 'LIMIT_EXCEEDED' | 'ERROR'; detail?: string };

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const SPENDING_LIMIT_EXCEEDED_CODE = 6026; // Squads v4 SpendingLimitExceeded (0x178a)

function loadKeypairFromFile(p: string): Keypair {
  const raw = fs.readFileSync(path.resolve(p), 'utf8');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

let cachedDecimals: number | undefined;

// Pays `amount` of TOKEN_MINT from the Squads vault to `to` via the agent's on-chain
// spending limit. Squads rejects the transfer on-chain if it would exceed the limit.
export async function payAsAgent(params: PayParams): Promise<PayResult> {
  const { RPC_URL, MULTISIG_ADDRESS, SPENDING_LIMIT_ADDRESS, TOKEN_MINT } = process.env;
  if (!RPC_URL || !MULTISIG_ADDRESS || !SPENDING_LIMIT_ADDRESS || !TOKEN_MINT) {
    return { ok: false, reason: 'ERROR', detail: 'RPC_URL, MULTISIG_ADDRESS, SPENDING_LIMIT_ADDRESS, TOKEN_MINT must be set (run scripts/setup.ts)' };
  }
  const vaultIndex = parseInt(process.env.VAULT_INDEX || '0', 10);
  const connection = new Connection(RPC_URL, 'confirmed');

  let agent: Keypair;
  try {
    agent = loadKeypairFromFile(params.agentKeypairPath);
  } catch (err: any) {
    return { ok: false, reason: 'ERROR', detail: `Failed to load agent keypair: ${err.message}` };
  }

  try {
    const mint = new PublicKey(TOKEN_MINT);
    if (cachedDecimals === undefined) cachedDecimals = (await getMint(connection, mint)).decimals;
    const memo = `task:${params.taskId}|req:${params.requestId}`;

    const tx = new Transaction().add(
      // SPL Memo so the tag shows up in getSignaturesForAddress / explorers (also on failed txs)
      new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(memo, 'utf8') }),
      multisig.instructions.spendingLimitUse({
        multisigPda: new PublicKey(MULTISIG_ADDRESS),
        member: agent.publicKey,
        spendingLimit: new PublicKey(SPENDING_LIMIT_ADDRESS),
        mint,
        vaultIndex,
        amount: params.amount,
        decimals: cachedDecimals,
        destination: new PublicKey(params.to),
        memo,
      })
    );

    // skipPreflight so over-limit attempts land on-chain as failed txs: Squads rejects them
    // on-chain and the dashboard can show them as blocked events.
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = agent.publicKey;
    tx.sign(agent);
    const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    const { value } = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    if (!value.err) return { ok: true, signature };

    const custom = (value.err as any)?.InstructionError?.[1]?.Custom;
    const detail = `tx ${signature} failed: ${JSON.stringify(value.err)}`;
    return { ok: false, reason: custom === SPENDING_LIMIT_EXCEEDED_CODE ? 'LIMIT_EXCEEDED' : 'ERROR', detail };
  } catch (err: any) {
    const detail = [err?.message, ...(err?.logs ?? [])].join('\n');
    const limitHit =
      detail.includes('SpendingLimitExceeded') ||
      detail.includes(`0x${SPENDING_LIMIT_EXCEEDED_CODE.toString(16)}`);
    return { ok: false, reason: limitHit ? 'LIMIT_EXCEEDED' : 'ERROR', detail };
  }
}

export default payAsAgent;

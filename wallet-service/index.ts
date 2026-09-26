import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
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

function loadKeypairFromFile(p: string): Keypair {
  const raw = fs.readFileSync(path.resolve(p), 'utf8');
  const arr = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export async function payAsAgent(params: PayParams): Promise<PayResult> {
  const rpc = process.env.RPC_URL;
  if (!rpc) return { ok: false, reason: 'ERROR', detail: 'RPC_URL not set' };

  const connection = new Connection(rpc, 'confirmed');

  // load agent keypair
  let agent: Keypair;
  try {
    agent = loadKeypairFromFile(params.agentKeypairPath);
  } catch (err: any) {
    return { ok: false, reason: 'ERROR', detail: `Failed to load agent keypair: ${err.message}` };
  }

  // NOTE: Per CLAUDE.md we MUST use Squads on-chain spendingLimitUse.
  // The @sqds/multisig SDK exposes `rpc.spendingLimitUse` which we can call
  // to perform an on-chain spending-limit transfer from the vault PDA. We'll
  // dynamically import the SDK and call that function. Required env vars:
  // - MULTISIG_ADDRESS (multisig PDA)
  // - SPENDING_LIMIT_ADDRESS (the spending limit account public key)
  // - VAULT_INDEX (typically 0)

  const multisigAddr = process.env.MULTISIG_ADDRESS;
  const spendingLimitAddr = process.env.SPENDING_LIMIT_ADDRESS;
  const vaultIndex = parseInt(process.env.VAULT_INDEX || '0', 10);

  if (!multisigAddr || !spendingLimitAddr) {
    return { ok: false, reason: 'ERROR', detail: 'MULTISIG_ADDRESS or SPENDING_LIMIT_ADDRESS not set in .env' };
  }

  try {
    const sq = await import('@sqds/multisig');
    const { rpc } = sq;

    const multisigPda = new PublicKey(multisigAddr);
    const spendingLimit = new PublicKey(spendingLimitAddr);
    const destination = new PublicKey(params.to);

    // If a token mint is set, fetch decimals; otherwise for SOL set decimals = 9
    let decimals = 9;
    const tokenMint = process.env.TOKEN_MINT;
    if (tokenMint) {
      const mintPub = new PublicKey(tokenMint);
      const { getMint } = await import('@solana/spl-token');
      const mintInfo = await getMint(new Connection(process.env.RPC_URL!, 'confirmed'), mintPub);
      decimals = mintInfo.decimals;
    }

    // Use agent as feePayer and member signer (agent must be a multisig member)
    const feePayer = agent;
    const member = agent;

    try {
      const signature = await rpc.spendingLimitUse({
        connection,
        feePayer,
        member,
        multisigPda,
        spendingLimit,
        mint: tokenMint ? new PublicKey(tokenMint) : undefined,
        vaultIndex,
        amount: params.amount,
        decimals,
        destination,
        memo: `task:${params.taskId}|req:${params.requestId}`,
      });

      return { ok: true, signature };
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.toLowerCase().includes('limit')) {
        return { ok: false, reason: 'LIMIT_EXCEEDED', detail: msg };
      }
      return { ok: false, reason: 'ERROR', detail: msg };
    }
  } catch (e: any) {
    return { ok: false, reason: 'ERROR', detail: `Failed to import @sqds/multisig: ${e.message}` };
  }
}

export default payAsAgent;

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
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
  // The @sqds/multisig SDK must be consulted for the exact method/signature.
  // Since dependencies may not yet be installed in this workspace, we won't
  // attempt to call the SDK here blindly. Instead, provide a clear error
  // directing the developer to install deps and verify the API.

  try {
    // Try dynamic import so that a missing package yields a clear error.
    // The real implementation should call the Squads SDK spending-limit use
    // helper which constructs and signs a transaction from the vault PDA.
    // Example (pseudocode):
    // const { spendingLimitUse } = await import('@sqds/multisig');
    // const tx = await spendingLimitUse({ multisig: MULTISIG_ADDRESS, vaultIndex: 0, ... });
    // const signature = await sendAndConfirmTransaction(connection, tx, [agent]);

    await import('@sqds/multisig');
    return { ok: false, reason: 'ERROR', detail: 'Squads SDK present but payAsAgent not implemented. Implement spendingLimitUse call here.' };
  } catch (e: any) {
    return { ok: false, reason: 'ERROR', detail: 'Missing or unverified @sqds/multisig SDK. Run `npm install` and verify the SDK API before implementing payAsAgent.' };
  }
}

export default payAsAgent;

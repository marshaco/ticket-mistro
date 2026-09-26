// Connect a customer's Squads wallet from just its multisig address: everything else is found on-chain.
import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import type { Wallet } from "./lib-usage";

export async function discoverWallet(multisigAddress: string): Promise<Wallet> {
  const { RPC_URL } = process.env;
  if (!RPC_URL) throw new Error("RPC_URL not set");
  let ms: PublicKey;
  try {
    ms = new PublicKey(multisigAddress.trim());
  } catch {
    throw new Error("That isn't a valid Solana address");
  }
  const connection = new Connection(RPC_URL, "confirmed");
  try {
    await multisig.accounts.Multisig.fromAccountAddress(connection, ms);
  } catch {
    throw new Error("No Squads multisig found at that address on devnet");
  }
  // Squads accounts store their multisig right after the 8-byte discriminator
  const accounts = await connection.getProgramAccounts(multisig.PROGRAM_ID, {
    filters: [{ memcmp: { offset: 8, bytes: ms.toBase58() } }],
  });
  const limits = accounts.flatMap((a) => {
    try {
      return [{ address: a.pubkey, data: multisig.accounts.SpendingLimit.fromAccountInfo(a.account)[0] }];
    } catch {
      return [];
    }
  });
  if (limits.length === 0) throw new Error("This multisig has no spending limits yet: add one for your agent in Squads first");
  const first = limits[0];
  const [vault] = multisig.getVaultPda({ multisigPda: ms, index: first.data.vaultIndex });
  return {
    multisig: ms.toBase58(),
    vault: vault.toBase58(),
    spendingLimit: first.address.toBase58(),
    mint: first.data.mint.toBase58(),
    agents: first.data.members.map((m) => m.toBase58()),
    limits: limits.length,
  };
}

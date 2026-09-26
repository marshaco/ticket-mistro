// Owner-side: change the agent's daily spending limit ON-CHAIN (Squads v4).
// Removes and re-adds the limit with the same createKey, so SPENDING_LIMIT_ADDRESS never changes.
// Needs the owner keypair (OWNER_KEYPAIR_PATH), so this only runs on the finance/owner machine.
import fs from "fs";
import path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const ROOT = path.resolve(process.cwd(), "..");

export async function setOnChainDailyLimit(amount: number) {
  const { RPC_URL, MULTISIG_ADDRESS, SPENDING_LIMIT_ADDRESS } = process.env;
  if (!RPC_URL || !MULTISIG_ADDRESS || !SPENDING_LIMIT_ADDRESS) throw new Error("RPC_URL, MULTISIG_ADDRESS, SPENDING_LIMIT_ADDRESS must be set");
  if (RPC_URL.includes("mainnet")) throw new Error("Refusing to run against mainnet");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Limit must be a whole number above 0");

  const ownerPath = path.resolve(ROOT, process.env.OWNER_KEYPAIR_PATH || "./keys/owner.json");
  const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(ownerPath, "utf8"))));
  const connection = new Connection(RPC_URL, "confirmed");
  const multisigPda = new PublicKey(MULTISIG_ADDRESS);
  const spendingLimit = new PublicKey(SPENDING_LIMIT_ADDRESS);

  const current = await multisig.accounts.SpendingLimit.fromAccountAddress(connection, spendingLimit);
  const removeSig = await multisig.rpc.multisigRemoveSpendingLimit({
    connection,
    feePayer: owner,
    multisigPda,
    configAuthority: owner.publicKey,
    spendingLimit,
    rentCollector: owner.publicKey,
  });
  await connection.confirmTransaction(removeSig, "confirmed");
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
    amount: BigInt(amount),
    period: current.period,
    members: current.members,
    destinations: current.destinations,
  });
  await connection.confirmTransaction(addSig, "confirmed");
  return addSig;
}

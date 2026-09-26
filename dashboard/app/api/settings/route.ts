// GET  /api/settings → current tracking settings
// PUT  /api/settings { key: "purchases" | "<provider name>", mode, limit?, target?, expires? }
// Saving a purchases hard limit changes the Squads spending limit on-chain.
import path from "path";
import { PublicKey } from "@solana/web3.js";
import { readSettings, writeSettings, type AgentEntry, type TrackSetting } from "../../lib-usage";
import { setOnChainDailyLimit } from "../../lib-limit";
import { discoverWallet } from "../../lib-wallet";

try {
  process.loadEnvFile(path.resolve(process.cwd(), "..", ".env"));
} catch {
  // no root .env
}

export async function GET() {
  return Response.json(readSettings());
}

export async function PUT(request: Request) {
  const b = await request.json().catch(() => null);

  // The customer's agents: name + public key
  if (b?.key === "agents") {
    if (!Array.isArray(b.agents)) return Response.json({ error: "agents must be a list" }, { status: 400 });
    const agents: AgentEntry[] = [];
    for (const a of b.agents) {
      const name = String(a?.name ?? "").trim();
      const key = String(a?.publicKey ?? "").trim();
      if (!name || !key) continue;
      try {
        agents.push({ name, publicKey: new PublicKey(key).toBase58() });
      } catch {
        return Response.json({ error: `"${key}" isn't a valid Solana public key` }, { status: 400 });
      }
    }
    const settings = readSettings();
    settings.agents = agents;
    writeSettings(settings);
    return Response.json({ ok: true, settings });
  }

  // Connect / disconnect the customer's Squads wallet
  if (b?.key === "wallet") {
    const settings = readSettings();
    if (!b.multisig) {
      delete settings.wallet;
      writeSettings(settings);
      return Response.json({ ok: true, settings });
    }
    try {
      settings.wallet = await discoverWallet(String(b.multisig));
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
    writeSettings(settings);
    return Response.json({ ok: true, settings });
  }

  if (!b || typeof b.key !== "string" || (b.mode !== "limit" && b.mode !== "target")) {
    return Response.json({ error: "key and mode ('limit' | 'target') are required" }, { status: 400 });
  }
  const settings = readSettings();
  const prev: TrackSetting | undefined = b.key === "purchases" ? settings.purchases : settings.providers[b.key];
  if (!prev) return Response.json({ error: `unknown key ${b.key}` }, { status: 404 });

  const next: TrackSetting = {
    mode: b.mode,
    limit: b.limit !== undefined ? Number(b.limit) : prev.limit,
    target: b.target !== undefined ? Number(b.target) : prev.target,
    expires: b.expires ?? prev.expires,
  };
  if (!(next.limit > 0) || !(next.target >= 0)) return Response.json({ error: "amounts must be positive numbers" }, { status: 400 });

  let signature: string | undefined;
  try {
    if (b.key === "purchases" && next.mode === "limit" && next.limit !== prev.limit) {
      // We can only sign for the demo wallet whose owner key we hold
      if (settings.wallet && settings.wallet.multisig !== process.env.MULTISIG_ADDRESS) {
        return Response.json({ error: "This wallet's limit is controlled in Squads by its owners; change it there and it will show up here." }, { status: 403 });
      }
      signature = await setOnChainDailyLimit(Math.round(next.limit));
    }
  } catch (e) {
    return Response.json({ error: `on-chain update failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }

  if (b.key === "purchases") settings.purchases = next;
  else settings.providers[b.key] = next;
  writeSettings(settings);
  return Response.json({ ok: true, settings, signature });
}

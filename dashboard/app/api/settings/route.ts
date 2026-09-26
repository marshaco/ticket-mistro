// GET  /api/settings → current tracking settings
// PUT  /api/settings { key: "purchases" | "<provider name>", mode, limit?, target?, expires? }
// Saving a purchases hard limit changes the Squads spending limit on-chain.
import path from "path";
import { readSettings, writeSettings, type TrackSetting } from "../../lib-usage";
import { setOnChainDailyLimit } from "../../lib-limit";

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

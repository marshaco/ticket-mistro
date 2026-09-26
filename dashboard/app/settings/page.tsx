"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Summary } from "../api/summary/route";

type Mode = "limit" | "target";
type Item = { key: string; mode: Mode; limit: number; target: number; expires?: string };

// Settings: the customer chooses, per tracked thing, whether they want a hard limit (blocks spend)
// or a spend target (tracking only). The dashboard just reflects what is saved here.
export default function SettingsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/summary", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setSummary(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    let stop = false;
    fetch("/api/summary", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (stop) return;
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        setSummary(body);
      })
      .catch((e) => !stop && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      stop = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="CrediTally overview">
          <span className="brand-mark">C</span>
          <span className="brand-name">creditally<span>.</span></span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <Link className="nav-item" href="/">
            <span className="nav-glyph grid-glyph" aria-hidden="true" />
            Overview
          </Link>
          <Link className="nav-item" href="/#payments">
            <span className="nav-glyph list-glyph" aria-hidden="true" />
            Payments
          </Link>
          <Link className="nav-item active" href="/settings">
            <span className="nav-glyph grid-glyph" aria-hidden="true" />
            Settings
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="vault-label">ACTIVE VAULT</div>
          <div className="vault-address"><span className="status-dot" />{summary ? `${summary.vault.slice(0, 4)}...${summary.vault.slice(-4)}` : "—"}</div>
          <div className="sidebar-network">Solana Devnet</div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span>Settings</div>
          <div className="topbar-right">
            <span className="network-pill"><span className="network-mark">S</span> DEVNET</span>
            <span className="avatar" aria-label="CrediTally workspace">CT</span>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> SPEND SETTINGS</div>
              <h1>What do you want <span>to track?</span></h1>
              <p className="page-subtitle">For each item, choose a hard limit that blocks spending, or a spend target that tracks how much you still want to use.</p>
            </div>
          </div>

          {error && <div className="settings-error">Couldn&apos;t load settings: {error}</div>}
          {!summary && !error && <div className="settings-loading">Loading…</div>}

          {summary && (
            <div className="settings-list">
              <WalletRow key={summary.wallet.multisig ?? "none"} summary={summary} onSaved={load} />
              <AgentsRow key={JSON.stringify(summary.agents) + summary.wallet.agents.join()} summary={summary} onSaved={load} />
              <SettingsRow
                key={`purchases-${summary.purchases.mode}-${summary.purchases.limit}-${summary.purchases.target}`}
                item={summary.purchases}
                title="Agent purchases"
                subtitle="What your agents pay for data and services, per day, from the company vault on Solana."
                limitHelp="Enforced on-chain by Squads. Saving sends a transaction that changes the agent's spending limit on Solana (and restarts today's allowance)."
                targetHelp="Tracking only. An on-chain safety limit stays in place in the background."
                step={1}
                showDate={false}
                onSaved={load}
              />
              {summary.credits.map((c) => (
                <SettingsRow
                  key={`${c.provider}-${c.mode}-${c.limit}-${c.target}-${c.expires}`}
                  item={c}
                  title={`AI credits · ${c.provider}`}
                  subtitle={`Model usage across your agents on ${c.provider}. Credit grant: $${c.grantUsd}.`}
                  limitHelp="Agents check this before every model call and stop when it's reached."
                  targetHelp="Tracking only: how much of your credits you still want to use before they expire."
                  step={0.5}
                  showDate
                  onSaved={load}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function SettingsRow(props: {
  item: Item;
  title: string;
  subtitle: string;
  limitHelp: string;
  targetHelp: string;
  step: number;
  showDate: boolean;
  onSaved: () => void;
}) {
  const { item, title, subtitle, limitHelp, targetHelp, step, showDate, onSaved } = props;
  const [mode, setMode] = useState<Mode>(item.mode);
  const [limit, setLimit] = useState(String(item.limit));
  const [target, setTarget] = useState(String(item.target));
  const [expires, setExpires] = useState(item.expires ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const dirty =
    mode !== item.mode ||
    Number(limit) !== item.limit ||
    Number(target) !== item.target ||
    (showDate && expires !== (item.expires ?? ""));

  const save = async () => {
    setSaving(true);
    const onChain = item.key === "purchases" && mode === "limit" && Number(limit) !== item.limit;
    setMsg(onChain ? "Updating the spending limit on Solana…" : null);
    try {
      const body: Record<string, unknown> = { key: item.key, mode, limit: Number(limit), target: Number(target) };
      if (showDate && expires) body.expires = expires;
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? res.statusText);
      setMsg(out.signature ? `Saved · limit updated on-chain (tx ${out.signature.slice(0, 8)}…)` : "Saved");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="budget-panel settings-row">
      <div className="settings-head">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      <div className="settings-options" role="radiogroup" aria-label={`${title}: what to track`}>
        <label className={`settings-option ${mode === "limit" ? "selected" : ""}`}>
          <input type="radio" name={`mode-${item.key}`} checked={mode === "limit"} onChange={() => setMode("limit")} />
          <div>
            <b>Hard limit</b>
            <span>Block spending above an amount. {limitHelp}</span>
            {mode === "limit" && (
              <div className="settings-fields">
                <label>{item.key === "purchases" ? "Daily limit" : "Limit"} $ <input type="number" min="0" step={step} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
              </div>
            )}
          </div>
        </label>

        <label className={`settings-option ${mode === "target" ? "selected" : ""}`}>
          <input type="radio" name={`mode-${item.key}`} checked={mode === "target"} onChange={() => setMode("target")} />
          <div>
            <b>Spend target</b>
            <span>Track how much you want to spend. {targetHelp}</span>
            {mode === "target" && (
              <div className="settings-fields">
                <label>{item.key === "purchases" ? "Daily target" : "Target"} $ <input type="number" min="0" step={step} value={target} onChange={(e) => setTarget(e.target.value)} /></label>
                {showDate && <label>by <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>}
              </div>
            )}
          </div>
        </label>
      </div>

      <div className="settings-actions">
        <button type="button" className="save-btn" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        {msg && <span className="limit-msg">{msg}</span>}
      </div>
    </section>
  );
}

// Connect the customer's Squads wallet: paste the multisig address, everything else is found on-chain.
function WalletRow({ summary, onSaved }: { summary: Summary; onSaved: () => void }) {
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const short = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;

  const submit = async (multisig: string | null) => {
    setSaving(true);
    setMsg(multisig ? "Looking up the wallet on Solana…" : null);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "wallet", multisig }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? res.statusText);
      const w = out.settings.wallet;
      setMsg(w ? `Connected · vault ${short(w.vault)} · ${w.agents.length} agent key${w.agents.length === 1 ? "" : "s"} · ${w.limits} spending limit${w.limits === 1 ? "" : "s"}` : "Disconnected · tracking the demo wallet");
      setAddress("");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="budget-panel settings-row">
      <div className="settings-head">
        <h2>Connected wallet</h2>
        <p>Paste your Squads multisig address. We find your vault, your agents&apos; spending limit and the token on Solana, and track them from there.</p>
      </div>
      <div className="wallet-current">
        <span className="status-dot" />
        {summary.wallet.connected ? (
          <>
            Connected · multisig <b>{summary.wallet.multisig ? short(summary.wallet.multisig) : "—"}</b> · vault <b>{short(summary.vault)}</b>
          </>
        ) : (
          "Not connected"
        )}
      </div>
      <div className="settings-fields">
        <input className="wallet-input" placeholder="Squads multisig address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <button type="button" className="save-btn" disabled={!address.trim() || saving} onClick={() => submit(address)}>{saving ? "Connecting…" : "Connect"}</button>
        {summary.wallet.connected && <button type="button" className="save-btn" disabled={saving} onClick={() => submit(null)}>Disconnect</button>}
      </div>
      {msg && <span className="limit-msg">{msg}</span>}
    </section>
  );
}

// The customer's agents: a name + the public key each agent pays from. The dashboard tracks only these.
function AgentsRow({ summary, onSaved }: { summary: Summary; onSaved: () => void }) {
  // Agents are always entered by the customer (no prefill from the wallet)
  const [rows, setRows] = useState(summary.agents.length ? summary.agents : [{ name: "", publicKey: "", provider: "Anthropic" }]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const update = (i: number, field: "name" | "publicKey" | "provider", value: string) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [field]: value } : row)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "agents", agents: rows }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? res.statusText);
      setMsg(out.settings.agents.length ? `Saved · tracking ${out.settings.agents.length} agent${out.settings.agents.length === 1 ? "" : "s"}` : "Saved · tracking every agent on the wallet");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="budget-panel settings-row">
      <div className="settings-head">
        <h2>Agents</h2>
        <p>For each AI agent (Claude, OpenAI or Gemini), paste the public key it pays from and give it a name. The dashboard tracks these agents&apos; purchases and AI usage under that name. Leave empty to track every agent on the wallet.</p>
      </div>
      <div className="agent-rows">
        {rows.map((row, i) => (
          <div className="settings-fields agent-row" key={i}>
            <input className="agent-name" placeholder="Name, e.g. Research agent" value={row.name} onChange={(e) => update(i, "name", e.target.value)} />
            <select className="agent-provider" value={row.provider} onChange={(e) => update(i, "provider", e.target.value)} aria-label="AI the agent runs on">
              <option value="Anthropic">Claude</option>
              <option value="OpenAI">OpenAI</option>
              <option value="Google Gemini">Gemini</option>
            </select>
            <input className="wallet-input" placeholder="Agent public key" value={row.publicKey} onChange={(e) => update(i, "publicKey", e.target.value)} />
            <button type="button" className="save-btn" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
      </div>
      <div className="settings-actions">
        <button type="button" className="save-btn" onClick={() => setRows((r) => [...r, { name: "", publicKey: "", provider: "Anthropic" }])}>+ Add agent</button>
        <button type="button" className="save-btn" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save agents"}</button>
        {msg && <span className="limit-msg">{msg}</span>}
      </div>
    </section>
  );
}

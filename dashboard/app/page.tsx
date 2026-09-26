"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Summary } from "./api/summary/route";

type Payment = {
  time: string;
  sortKey: number;
  amount: number;
  agent: string;
  memo: string;
  signature: string;
  status?: "paid" | "blocked";
};

const dailyLimit = 150;

const mockPayments: Payment[] = [
  {
    time: "14:32:18",
    sortKey: 872,
    amount: 12.5,
    agent: "7xKXtg2CW87d97TXJSDpbD5jBkheT7r6SKhP4s8f9fQe",
    memo: "task:competitor-pricing|req:rq_8d42f1",
    signature: "5rA1C6nF4xP8kT2wM7dH9qE3uVbY5rA1C6nF4xP8kT2wM7dH9qE3uVbY5rA1C6nF4xP8kT2wM7dH9qE3uVbY",
  },
  {
    time: "14:18:42",
    sortKey: 858,
    amount: 8,
    agent: "9WzDXwBbmKGxg2VxqvK7Zp1AY5rM3N8sJk4fQ2e6tHc",
    memo: "task:market-snapshot|req:rq_b39a07",
    signature: "4gB2D7mG5yQ9sU3xN8eJ1rF4vWcZ6gB2D7mG5yQ9sU3xN8eJ1rF4vWcZ6gB2D7mG5yQ9sU3xN8eJ1rF4vWcZ",
  },
  {
    time: "13:56:09",
    sortKey: 836,
    amount: 22,
    agent: "7xKXtg2CW87d97TXJSDpbD5jBkheT7r6SKhP4s8f9fQe",
    memo: "task:venue-availability|req:rq_40c12e",
    signature: "3fC8E1nH6zR2tV5yP9gK4sW7xYdA3fC8E1nH6zR2tV5yP9gK4sW7xYdA3fC8E1nH6zR2tV5yP9gK4sW7xYdA",
  },
  {
    time: "13:41:55",
    sortKey: 821,
    amount: 16.75,
    agent: "9WzDXwBbmKGxg2VxqvK7Zp1AY5rM3N8sJk4fQ2e6tHc",
    memo: "task:ticket-demand|req:rq_62e83b",
    signature: "2dD9F2pJ7aS3uW6zQ1hL5tX8yZeB4dD9F2pJ7aS3uW6zQ1hL5tX8yZeB4dD9F2pJ7aS3uW6zQ1hL5tX8yZeB",
  },
  {
    time: "13:24:31",
    sortKey: 804,
    amount: 14,
    agent: "4vNQqX7mKp9dT2sW8yBf3hJ6cL1zR5eUoA7gDkYxM",
    memo: "task:price-history|req:rq_1c95d4",
    signature: "6eE3G4qK8bT5vX9zR2iM7uY1aWcD6eE3G4qK8bT5vX9zR2iM7uY1aWcD6eE3G4qK8bT5vX9zR2iM7uY1aWcD",
  },
  {
    time: "12:52:07",
    sortKey: 772,
    amount: 9.25,
    agent: "7xKXtg2CW87d97TXJSDpbD5jBkheT7r6SKhP4s8f9fQe",
    memo: "task:artist-lineup|req:rq_763a1f",
    signature: "8hF4J5rL9cU6wY2aS3nQ1vX7zBeD8hF4J5rL9cU6wY2aS3nQ1vX7zBeD8hF4J5rL9cU6wY2aS3nQ1vX7zBeD",
  },
  {
    time: "12:35:44",
    sortKey: 755,
    amount: 18,
    agent: "9WzDXwBbmKGxg2VxqvK7Zp1AY5rM3N8sJk4fQ2e6tHc",
    memo: "task:resale-volume|req:rq_e00a63",
    signature: "9jG5K6sM1dV7xZ3bT4pR8qW2cYfE9jG5K6sM1dV7xZ3bT4pR8qW2cYfE9jG5K6sM1dV7xZ3bT4pR8qW2cYfE",
  },
  {
    time: "12:08:16",
    sortKey: 728,
    amount: 15.9,
    agent: "4vNQqX7mKp9dT2sW8yBf3hJ6cL1zR5eUoA7gDkYxM",
    memo: "task:regional-demand|req:rq_324ef9",
    signature: "7iH6L7tN2eW8yA4cU5qS9rX3dZfG7iH6L7tN2eW8yA4cU5qS9rX3dZfG7iH6L7tN2eW8yA4cU5qS9rX3dZfG",
  },
  {
    time: "11:46:03",
    sortKey: 706,
    amount: 11,
    agent: "7xKXtg2CW87d97TXJSDpbD5jBkheT7r6SKhP4s8f9fQe",
    memo: "task:inventory-check|req:rq_f825ad",
    signature: "5kJ7M8uP3fX9zB4dV6wT1yQ2rS8cA5kJ7M8uP3fX9zB4dV6wT1yQ2rS8cA5kJ7M8uP3fX9zB4dV6wT1yQ2rS",
  },
];

function parseTask(memo: string) {
  const match = /^task:([^|]+)\|req:([^|]+)$/.exec(memo);
  return match ? match[1] : memo;
}

function formatAmount(amount: number) {
  return amount.toFixed(2);
}

function shortAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatClock(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleTimeString("en-GB", { hour12: false });
}

function formatCountdown(seconds: number) {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

type TrackedView = { key: string; mode: "limit" | "target"; limit: number; target: number; expires?: string; used: number };

function money(n: number) {
  return `$${n.toFixed(n !== 0 && Math.abs(n) < 1 ? 4 : 2)}`;
}

// One tracked thing, read-only: shows whatever the customer configured on the Settings page.
function TrackCard(props: { item: TrackedView; kicker: string; limitNote: string; footnote: string; now: number }) {
  const { item, kicker, limitNote, footnote, now } = props;
  const isLimit = item.mode === "limit";
  const goal = isLimit ? item.limit : item.target;
  const pct = goal > 0 ? Math.min((item.used / goal) * 100, 100) : 100;
  const state = isLimit ? (pct >= 100 ? "over" : pct >= 80 ? "warning" : "healthy") : "target-fill";
  const days = item.expires ? Math.max(0, Math.ceil((Date.parse(item.expires) - now) / 86_400_000)) : null;
  const status = isLimit
    ? pct >= 100 ? "LIMIT REACHED" : `${money(Math.max(0, goal - item.used))} left of ${money(goal)}`
    : item.used >= goal ? "TARGET MET" : `${money(goal - item.used)} still to spend of ${money(goal)}`;

  return (
    <article className="budget-panel limit-card">
      <div className="limit-card-top">
        <div className="section-label">{kicker}</div>
        <span className={`mode-chip ${isLimit ? "chip-limit" : "chip-target"}`}>{isLimit ? "HARD LIMIT" : "SPEND TARGET"}</span>
      </div>
      <div className="big-amount limit-used">{money(item.used)}<span> <small>{item.key === "purchases" ? "spent today" : "used"}</small></span></div>
      <div className="limit-row">
        <div className="limit-row-head">
          <span>{isLimit ? limitNote : `Tracking only, never blocks${days !== null && item.key !== "purchases" ? ` · ${days} days left` : ""}`}</span>
          <b className={isLimit ? "" : item.used >= goal ? "target-met" : "target-open"}>{status}</b>
        </div>
        <div className={`budget-meter ${isLimit ? "" : "target-meter"}`}>
          <div className={`budget-meter-fill ${state}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="limit-foot">{footnote} · <Link href="/settings" className="edit-link">Edit in Settings →</Link></div>
    </article>
  );
}

const POLL_MS = 5000;

export default function Home() {
  const [live, setLive] = useState<Summary | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/summary", { cache: "no-store" });
        const body = await res.json();
        if (stop) return;
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        setLive(body);
        setLiveError(null);
      } catch (e) {
        if (!stop) setLiveError(e instanceof Error ? e.message : String(e));
      }
      if (!stop) setNow(Date.now());
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const isLive = live !== null;
  const frozen = isLive && "frozen" in live.limit;
  const payments: Payment[] = isLive
    ? live.payments.map((p) => ({
        time: formatClock(p.blockTime),
        sortKey: p.blockTime,
        amount: p.amount,
        agent: p.agent,
        memo: p.memo,
        signature: p.signature,
        status: p.status,
      }))
    : [...mockPayments].sort((a, b) => b.sortKey - a.sortKey);
  const limitAmount = isLive && !("frozen" in live.limit) ? live.limit.amount : isLive ? 0 : dailyLimit;
  const remaining = isLive
    ? "frozen" in live.limit ? 0 : live.limit.remaining
    : dailyLimit - payments.reduce((total, payment) => total + payment.amount, 0);
  const spentToday = limitAmount - remaining;
  const resetsIn = isLive && !("frozen" in live.limit) ? formatCountdown(live.limit.resetsAt - Math.floor(now / 1000)) : "09h 24m";
  const progress = limitAmount > 0 ? Math.min((spentToday / limitAmount) * 100, 100) : 100;
  const progressState = progress >= 100 ? "over" : progress >= 80 ? "warning" : "healthy";
  const paidCount = payments.filter((p) => p.status !== "blocked").length;
  const blockedCount = payments.filter((p) => p.status === "blocked").length;
  const latestBlocked = payments.find((p) => p.status === "blocked");
  const vaultShort = isLive ? shortAddress(live.vault) : "8rT2...vA7k";
  const credits = isLive ? live.credits : null;
  const updatedAgo = isLive ? Math.max(0, Math.round((now - live.updatedAt) / 1000)) : null;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="AgentCard overview">
          <span className="brand-mark">A</span>
          <span className="brand-name">agentcard<span>.</span></span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <a className="nav-item active" href="#overview">
            <span className="nav-glyph grid-glyph" aria-hidden="true" />
            Overview
          </a>
          <a className="nav-item" href="#payments">
            <span className="nav-glyph list-glyph" aria-hidden="true" />
            Payments
            <span className="nav-count">{String(payments.length).padStart(2, "0")}</span>
          </a>
          <Link className="nav-item" href="/settings">
            <span className="nav-glyph grid-glyph" aria-hidden="true" />
            Settings
          </Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="vault-label">ACTIVE VAULT</div>
          <div className="vault-address"><span className="status-dot" />{vaultShort}</div>
          <div className="sidebar-network">Solana Devnet</div>
        </div>
      </aside>

      <section className="main-panel" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span>Overview</div>
          <div className="topbar-right">
            <span className="mode-pill"><span className="mode-dot" /> {isLive ? "LIVE DATA" : "MOCK DATA"}</span>
            <span className="network-pill"><span className="network-mark">S</span> DEVNET</span>
            <span className="avatar" aria-label="AgentCard workspace">AC</span>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> TREASURY OVERVIEW</div>
              <h1>Agent spend, <span>under control.</span></h1>
              <p className="page-subtitle">Every call accounted for. Every limit enforced on-chain.</p>
            </div>
            <div className="date-stamp"><span className="date-icon" aria-hidden="true">▦</span><span>TODAY <b>·</b> DEVNET</span></div>
          </div>

          <section className="overview-grid" aria-label="Today's budget and blocked event">
            <article className="budget-panel">
              <div className="panel-topline">
                <div className="section-label"><span className="label-mark budget-mark" /> DAILY SPENDING LIMIT</div>
                <span className="budget-period">{frozen ? <b>CARD FROZEN</b> : <>Resets in <b>{resetsIn}</b></>}</span>
              </div>
              <div className="budget-numbers">
                <div>
                  <div className="big-amount">${formatAmount(spentToday)}<span> <small>/ ${formatAmount(limitAmount)}</small></span></div>
                  <div className="spent-caption">SPENT TODAY {isLive ? <span className="spent-change">{paidCount} paid · {blockedCount} blocked</span> : <span className="spent-change">+12.5% vs yesterday</span>}</div>
                </div>
                <div className="remaining-block">
                  <div className="remaining-amount">${formatAmount(remaining)}</div>
                  <div className="remaining-caption">REMAINING</div>
                </div>
              </div>
              <div className="budget-meter" role="progressbar" aria-label="Daily budget used" aria-valuemin={0} aria-valuemax={limitAmount} aria-valuenow={spentToday}>
                <div className={`budget-meter-fill ${progressState}`} style={{ width: `${progress}%` }} />
                <span className="meter-marker" style={{ left: "80%" }} />
              </div>
              <div className="meter-foot"><span>$0</span><span className="meter-warning-label">80% · limit approaching</span><span>${formatAmount(limitAmount)}</span></div>
            </article>

            <article className="blocked-panel" aria-labelledby="blocked-title">
              <div className="blocked-topline">
                <span className="blocked-symbol" aria-hidden="true">!</span>
                <span className="blocked-kicker">SQUADS POLICY EVENT</span>
                <span className="blocked-time">{isLive ? latestBlocked?.time ?? "—" : "14:41:06"}</span>
              </div>
              <div className="blocked-content">
                <div>
                  <h2 id="blocked-title">{isLive && !latestBlocked ? "No blocked payments" : "Blocked at the limit"}</h2>
                  <p>Spending limit enforced by Squads on-chain</p>
                </div>
                <div className="blocked-amount">{isLive ? (latestBlocked ? `−$${formatAmount(latestBlocked.amount)}` : "—") : "−$35.00"}</div>
              </div>
              <div className="blocked-footer">
                <span className="blocked-status"><span /> {isLive && !latestBlocked ? "ALL PAYMENTS WITHIN LIMIT" : "REJECTED ON-CHAIN · EXCEEDS DAILY LIMIT"}</span>
                <span className="blocked-over">{isLive ? (latestBlocked ? `${parseTask(latestBlocked.memo)} · ${blockedCount} blocked total` : "") : "$12.40 over"}</span>
              </div>
            </article>
          </section>

          {isLive && credits && (
            <section className="limits-section" aria-labelledby="limits-title">
              <div className="section-label"><span className="label-mark budget-mark" /> LIMITS &amp; TARGETS</div>
              <h2 id="limits-title" className="limits-title">What you&apos;re tracking, as set in <Link href="/settings" className="edit-link">Settings</Link>: hard limits block spend, spend targets track how much is still to spend.</h2>
              <div className="limits-grid">
                <TrackCard
                  key={`purchases-${live.purchases.mode}-${live.purchases.limit}-${live.purchases.target}`}
                  item={live.purchases}
                  kicker="AGENT PURCHASES · TODAY"
                  limitNote="Hard limit · enforced on-chain by Squads"
                  footnote={`${blockedCount} payment${blockedCount === 1 ? "" : "s"} rejected on-chain · on-chain safety limit $${live.purchases.limit}/day always applies`}
                  now={now}
                />
                {credits.map((c) => (
                  <TrackCard
                    key={`${c.provider}-${c.mode}-${c.limit}-${c.target}-${c.expires}`}
                    item={c}
                    kicker={`AI CREDITS · ${c.provider.toUpperCase()}${c.simulated ? " · SIMULATED" : ""}`}
                    limitNote={`Hard limit · agents stop calling the model (grant $${c.grantUsd})`}
                    footnote={`${c.calls} model calls · ${c.agents.length ? c.agents.join(", ") : "no agents yet"}`}
                    now={now}
                    />
                ))}
              </div>

              <div className="table-frame task-frame">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">TASK</th>
                        <th scope="col">AGENT · AI PROVIDER</th>
                        <th scope="col">PURCHASES (ON-CHAIN)</th>
                        <th scope="col">BLOCKED</th>
                        <th scope="col">AI COST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.tasks.map((t) => (
                        <tr key={t.taskId}>
                          <td><span className="task-label">{t.taskId}</span></td>
                          <td><span className="time-sub">{t.agents.length ? t.agents.join(", ") : "—"}</span></td>
                          <td><span className="amount-main">${formatAmount(t.purchases)}</span></td>
                          <td>{t.blocked > 0 ? <span className="blocked-tag">{t.blocked} BLOCKED</span> : <span className="time-sub">—</span>}</td>
                          <td><span className="amount-main">{t.aiUsd > 0 ? `$${t.aiUsd.toFixed(4)}` : "—"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          <section className="payments-section" id="payments" aria-labelledby="payments-title">
            <div className="payments-heading">
              <div>
                <div className="section-label"><span className="label-mark payments-mark" /> TRANSACTION LEDGER</div>
                <h2 id="payments-title">Recent payments <span className="payment-count">{String(payments.length).padStart(2, "0")}</span></h2>
              </div>
              <div className="ledger-meta"><span className="ledger-live-dot" /> {updatedAgo === null ? "MOCK DATA" : updatedAgo < 2 ? "UPDATED JUST NOW" : `UPDATED ${updatedAgo}S AGO`}{liveError && isLive ? " · RECONNECTING" : ""} <span className="ledger-divider" /> <span>DEVNET</span></div>
            </div>

            <div className="table-frame">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">TIMESTAMP</th>
                      <th scope="col">AMOUNT</th>
                      <th scope="col">AGENT</th>
                      <th scope="col">TASK</th>
                      <th scope="col" className="explorer-heading">EXPLORER</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.signature} className={payment.status === "blocked" ? "row-blocked" : undefined}>
                        <td><span className="time-main">Today</span><span className="time-sub">{payment.time}</span></td>
                        <td><span className="amount-main">${formatAmount(payment.amount)}</span><span className="token-name">TESTUSD</span>{payment.status === "blocked" && <span className="blocked-tag">BLOCKED</span>}</td>
                        <td><span className="agent-chip"><span className="agent-dot" />{shortAddress(payment.agent)}</span></td>
                        <td><span className="task-label">{parseTask(payment.memo)}</span></td>
                        <td className="explorer-cell"><a className="explorer-link" href={`https://explorer.solana.com/tx/${payment.signature}?cluster=devnet`} target="_blank" rel="noreferrer" aria-label={`Open ${payment.signature} in Solana Explorer`}>VIEW <span aria-hidden="true">↗</span></a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer"><span><span className="footer-check">✓</span> {isLive ? `${paidCount} confirmed on-chain · ${blockedCount} rejected by Squads` : "All successful payments confirmed"}</span><span>SHOWING {payments.length} OF {payments.length}</span></div>
            </div>
          </section>

          <footer className="page-footer"><span>AGENTCARD TREASURY</span><span>READ-ONLY · SOLANA DEVNET</span></footer>
        </div>
      </section>
    </main>
  );
}

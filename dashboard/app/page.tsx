type Payment = {
  time: string;
  sortKey: number;
  amount: number;
  agent: string;
  memo: string;
  signature: string;
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

export default function Home() {
  const payments = [...mockPayments].sort((a, b) => b.sortKey - a.sortKey);
  const spentToday = payments.reduce((total, payment) => total + payment.amount, 0);
  const remaining = dailyLimit - spentToday;
  const progress = Math.min((spentToday / dailyLimit) * 100, 100);
  const progressState = progress >= 100 ? "over" : progress >= 80 ? "warning" : "healthy";

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
            <span className="nav-count">09</span>
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="vault-label">ACTIVE VAULT</div>
          <div className="vault-address"><span className="status-dot" />8rT2...vA7k</div>
          <div className="sidebar-network">Solana Devnet</div>
        </div>
      </aside>

      <section className="main-panel" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span>Overview</div>
          <div className="topbar-right">
            <span className="mode-pill"><span className="mode-dot" /> MOCK DATA</span>
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
                <span className="budget-period">Resets in <b>09h 24m</b></span>
              </div>
              <div className="budget-numbers">
                <div>
                  <div className="big-amount">${formatAmount(spentToday)}<span> <small>/ ${formatAmount(dailyLimit)}</small></span></div>
                  <div className="spent-caption">SPENT TODAY <span className="spent-change">+12.5% vs yesterday</span></div>
                </div>
                <div className="remaining-block">
                  <div className="remaining-amount">${formatAmount(remaining)}</div>
                  <div className="remaining-caption">REMAINING</div>
                </div>
              </div>
              <div className="budget-meter" role="progressbar" aria-label="Daily budget used" aria-valuemin={0} aria-valuemax={dailyLimit} aria-valuenow={spentToday}>
                <div className={`budget-meter-fill ${progressState}`} style={{ width: `${progress}%` }} />
                <span className="meter-marker" style={{ left: "80%" }} />
              </div>
              <div className="meter-foot"><span>$0</span><span className="meter-warning-label">80% · limit approaching</span><span>${formatAmount(dailyLimit)}</span></div>
            </article>

            <article className="blocked-panel" aria-labelledby="blocked-title">
              <div className="blocked-topline">
                <span className="blocked-symbol" aria-hidden="true">!</span>
                <span className="blocked-kicker">SQUADS POLICY EVENT</span>
                <span className="blocked-time">14:41:06</span>
              </div>
              <div className="blocked-content">
                <div>
                  <h2 id="blocked-title">Blocked at the limit</h2>
                  <p>Spending limit enforced by Squads on-chain</p>
                </div>
                <div className="blocked-amount">−$35.00</div>
              </div>
              <div className="blocked-footer">
                <span className="blocked-status"><span /> REJECTED · EXCEEDS DAILY LIMIT</span>
                <span className="blocked-over">$12.40 over</span>
              </div>
            </article>
          </section>

          <section className="payments-section" id="payments" aria-labelledby="payments-title">
            <div className="payments-heading">
              <div>
                <div className="section-label"><span className="label-mark payments-mark" /> TRANSACTION LEDGER</div>
                <h2 id="payments-title">Recent payments <span className="payment-count">09</span></h2>
              </div>
              <div className="ledger-meta"><span className="ledger-live-dot" /> UPDATED JUST NOW <span className="ledger-divider" /> <span>DEVNET</span></div>
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
                      <tr key={payment.signature}>
                        <td><span className="time-main">Today</span><span className="time-sub">{payment.time}</span></td>
                        <td><span className="amount-main">${formatAmount(payment.amount)}</span><span className="token-name">TESTUSD</span></td>
                        <td><span className="agent-chip"><span className="agent-dot" />{shortAddress(payment.agent)}</span></td>
                        <td><span className="task-label">{parseTask(payment.memo)}</span></td>
                        <td className="explorer-cell"><a className="explorer-link" href={`https://explorer.solana.com/tx/${payment.signature}?cluster=devnet`} target="_blank" rel="noreferrer" aria-label={`Open ${payment.signature} in Solana Explorer`}>VIEW <span aria-hidden="true">↗</span></a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer"><span><span className="footer-check">✓</span> All successful payments confirmed</span><span>SHOWING 9 OF 9</span></div>
            </div>
          </section>

          <footer className="page-footer"><span>AGENTCARD TREASURY</span><span>READ-ONLY · SOLANA DEVNET</span></footer>
        </div>
      </section>
    </main>
  );
}

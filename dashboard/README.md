# AgentCard Dashboard

Read-only, desktop-first treasury dashboard for the AgentCard Solana devnet demo. The current Phase 1 page uses mock transactions, a mock daily budget, and a clearly labeled simulated blocked-payment event.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

From the repository root in PowerShell:

```powershell
cd dashboard
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard runs without a root `.env` file, RPC access, wallet keys, or signing. It is designed for desktop-width screens (minimum canvas width: 1100px).

## Verify and run a production build

From the `dashboard` directory:

```powershell
npm run lint
npm run build
npm run start
```

`npm run start` serves the most recent production build at [http://localhost:3000](http://localhost:3000).

## Phase 1 data

Mock payments and the daily budget are defined in `app/page.tsx`. Task labels are parsed from the shared memo format `task:<taskId>|req:<requestId>`; an unrecognized memo is displayed as-is. Explorer links use the Solana devnet cluster and the displayed signatures are mock data, so they are not expected to resolve to real transactions.

The dashboard does not read `.env` yet. Real devnet history, vault configuration, and detection of failed Squads spending-limit transactions are Phase 2 work and must be added only after the transaction shape is confirmed with the wallet-service owner.

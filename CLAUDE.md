# CLAUDE.md: AgentCard

Spend control for AI agents, built for the BUILD IRL Solana hackathon (one day, submissions close 16:30, slides must be `.pptx`).
Agents pay for data and services from a shared Squads vault on Solana, within spending limits that Squads enforces on-chain. Every payment is tagged with the task it was for, and a live dashboard shows finance what each agent bought, what was blocked, and how much budget is left.

**New direction (agreed during the day, not built yet):** widen this into a general AI-agent spend tracker that also covers AI provider credits (OpenAI/Anthropic): usage, hard caps, and minimum-usage targets so start-ups use their free credits before they expire. See "Planned" below for what that means and which parts use Solana.

## Status (read this before writing the pitch)

Only claim what's under "Built and verified". Label everything else as planned.

### Built and verified on devnet
- **Shared company vault:** Squads v4 multisig, funds held in the vault PDA (index 0), funded with our own test stablecoin (SPL token, 0 decimals, shown as $1 per token).
- **On-chain spending limit per agent:** 100 tokens/day. The agent is not a multisig member; it can only spend through its limit. **Over-limit payments are rejected by the Squads program on-chain** (error 6026), not by our code, and they land on-chain as failed transactions you can open in the explorer.
- **Task-tagged payments:** every payment carries an on-chain memo `task:<taskId>|req:<requestId>`.
- **Paid data API (HTTP 402) with real data:** `/weather` (10, Open-Meteo), `/stock-quote` (20, Yahoo Finance), `/trivia` (5, Open Trivia DB), `/company-financials` (150, SEC EDGAR; priced above the 100/day limit on purpose, so buying it is always rejected on-chain). It replies "402 Payment Required" with a price, then **verifies each payment on-chain** before returning data: confirmed and succeeded, ≥ price of our token to the provider, the memo's request ID matches one it issued for that endpoint, signature not reused. The provider doesn't have to trust us.
- **Claude agent** with a `buy_data` tool: gets a 402, pays from its allowance, retries with the transaction signature, uses the data. Tested end to end with a real Claude call.
- **Live finance dashboard** (Next.js): polls devnet every 5s. Shows real payments (amount, agent, task, explorer link), blocked payments in red, and budget left today, read straight from the Squads spending-limit account.
- **Owner tools:** one-shot setup script, and a limit reset that keeps the same limit address.
- **AI usage tracking across providers (off-chain):** every Claude call the agent makes is logged with its real token cost per task and agent (`agent/credits.ts`). Any agent on any provider can report usage to `POST /api/usage` on the dashboard. `credits.config.json` sets each provider's credit grant, **hard cap** (the agent checks before each model call and stops at the cap; tested) and **soft minimum** before expiry (tracking only).
- **Limits & targets on the dashboard:** agent purchases (hard limit on-chain + soft daily minimum) and one AI-credits card per provider (hard cap + soft minimum + days to expiry), plus a per-task table of on-chain purchases next to AI cost.
- **Live questions:** `npm run agent -- "What's AAPL trading at?"`.
- **Settings page (`/settings`) + read-only dashboard:** on Settings, the customer chooses for agent purchases and for each AI provider either a **Hard limit** (blocks spend) or a **Spend target** (tracking only: how much is still to spend, by a date), and sets the amount. The dashboard only reflects those choices (each card is labelled HARD LIMIT or SPEND TARGET). Saving a purchases hard limit **changes the Squads limit on-chain** (the dashboard server uses the owner key; in production this would be a Squads approval flow). Note: saving a new on-chain limit also restarts today's allowance. An on-chain safety limit always exists for purchases, even in target mode. AI hard limits are read by the agent before each model call. Settings live in `data/tracking-settings.json`.
- **Honest caveats:** only the Anthropic numbers are real. OpenAI and Gemini usage on the dashboard comes from `scripts/simulate-other-agents.ts` and is labelled SIMULATED. The credit hard cap only stops agents that check with us before calling; enforcing it on any agent needs a proxy (roadmap). Credit tracking isn't on Solana; purchases are.

### Demo evidence (devnet explorer)
- Paid by the Claude agent: https://explorer.solana.com/tx/gccafQctuqbMMwLPUeG48psdm4sELjr6YuosiEfjR4LpPDgxhihhnU1bTNWpr84PGqrdMGgsJuAEakh6Fp9rbHX?cluster=devnet
- Blocked on-chain by the spending limit: https://explorer.solana.com/tx/ZM1vtWwKurLSkjjiwmranmaoZzHsYLtAGccCh7r9DBtws5UA4q6TD4bZJcUjmfhmPfnP5ch3EdTxixWMSKVQWh9?cluster=devnet
- Vault: `8Bea5Fs81mz7isX3D3zuWisg8pELaGos5myoT7s2nybQ`

### Planned (not built, do not claim as done)
| Feature | Enforced by Solana? | How |
|---|---|---|
| Real OpenAI/Gemini usage | No | Wrap those SDKs (or use provider admin usage APIs) to report to `/api/usage` |
| Credit hard cap for any agent | No | A proxy all AI traffic goes through, so the cap is enforced without agent cooperation |
| Verifiable AI-usage record | Partly | Optional on-chain memo per task summarising AI cost: an audit trail, not a control |

**Pitch honesty:** the Solana part of the product is agent payments with on-chain limits and verifiable, task-tagged records. The credit tracker is the wider product around it and doesn't need a blockchain. Say so rather than overclaim. Open questions: which provider to show (only Anthropic can be real, since the agent runs on Claude), and the demo numbers (credit grant, expiry, cap, target).

Also built but **not** part of the demo: vendor lock (only approved recipients) and a freeze switch were prototyped and tested but are not merged.

## How to run the demo

From the repo root, with the shared `.env` and `keys/agent.json`:
```bash
npm run paid-api                  # terminal 1 → http://localhost:3001
cd dashboard && npm run dev       # terminal 2 → http://localhost:3000 (top bar must say LIVE DATA)
npm run agent -- "What's AAPL trading at?"   # terminal 3; rows appear within ~5s
npx tsx scripts/simulate-other-agents.ts     # once: labelled OpenAI/Gemini usage for the multi-provider view
npm run demo:start                # owner only, right before the demo: refill the limit to 100/100 and
                                  # clear the dashboard view (history stays on-chain; `-- --all` shows it again)
```
The agent's question is hard-coded in `agent/index.ts` (the `role: "user"` message; default: Dublin weather). Edit it to change what the agent buys, e.g. "Get Apple's latest annual financials" or "What's AAPL trading at?".

To show a rejection instantly, ask for company financials (150 tokens, over the 100/day limit): Squads rejects it on-chain and it shows as a red BLOCKED row. Repeated smaller purchases hit the limit too.

## Priorities

1. **Working demo over clean code.** Ship the smallest thing that works end to end.
2. **Must-have demo (done):** agent pays per call from its allowance → payments tagged with task → over-limit payment **rejected on-chain** → dashboard shows it all.
3. Don't add features outside the must-have list unless asked. Suggest them instead.
4. Keep changes small and runnable. After each change, say how to run or test it.

## Hard rules

- **Devnet only.** Never point anything at mainnet. RPC must be devnet (`https://api.devnet.solana.com` or a Helius devnet URL from `.env`).
- **Never commit or print secret keys.** Keypairs live in `/keys` (gitignored). Load paths from `.env`. `.env` also holds API keys; never commit it.
- **Squads: send funds to the vault PDA, never the multisig account address.** Derive the vault with the SDK's vault PDA helper (index 0).
- **Don't guess Squads or Solana APIs.** Check the installed package's types in `node_modules` or the current docs before writing code. Say so if you can't verify.
- **The spending limit must be enforced by Squads on-chain,** not only in our code. Off-chain checks are extra, never the only guard.
- **Payment verification stays on.** Never demo with `STUB_VERIFICATION=true`.

## Stack

- TypeScript, Node 20+, run with `tsx`
- Solana devnet, `@solana/web3.js` (v1), `@solana/spl-token`; Helius devnet RPC
- Squads v4 via `@sqds/multisig` (spending limits, `spendingLimitUse`)
- Agent: `@anthropic-ai/sdk` with tool use
- Paid API + wallet service: Express
- Dashboard: Next.js 16 + Tailwind (`dashboard/`, its own `package.json`)

## Repo layout

```
/scripts         setup.ts (token, multisig, vault, agent limit → writes .env), reset-limit.ts, test-payments.ts, check-balance.mjs
/wallet-service  payAsAgent(): Squads spendingLimitUse + SPL memo; returns signature or LIMIT_EXCEEDED
/paid-api        server.js: the API (`npm run paid-api`, port 3001): 402 → on-chain verify → real data
                 index.ts: older version with made-up data (`npm run paid-api:mock`), a fallback if upstream APIs fail
/agent           Claude agent with buy_data tool; handles 402 → pay → retry
/dashboard       Next.js dashboard (`cd dashboard && npm run dev`, port 3000) with live data from app/api/summary/route.ts. Use this one for the demo
                 server.ts + public/index.html: an alternative plain Express dashboard (`npm run dashboard` from root), also live
/keys            keypairs (gitignored)
.env             shared config (see below)
```

## Shared contracts (keep these stable, since other people's code depends on them)

**Payment function (wallet-service):**
```ts
payAsAgent(params: {
  agentKeypairPath: string;
  to: string;          // recipient address (payTo from the 402)
  amount: number;      // in token base units (0 decimals: 20 = 20 tokens)
  taskId: string;
  requestId: string;
}): Promise<{ ok: true; signature: string } | { ok: false; reason: "LIMIT_EXCEEDED" | "ERROR"; detail?: string }>
```
Over-limit attempts are sent anyway (skipPreflight), so Squads rejects them on-chain and they're visible as failed transactions.

**402 response (paid-api):**
```json
{ "price": 20, "payTo": "<address>", "requestId": "<uuid>", "token": "<mint>" }
```
The client retries with header `X-Payment-Signature: <signature>` (the agent also sends `requestId`; the API reads it from the memo). Paid responses are `{ "data": ..., "paymentVerified": true, "signature": "..." }`.

**Payment verification (paid-api) must check:** the transfer went to `payTo`, the amount is ≥ the price quoted for that endpoint in the right mint, the memo contains `req:<requestId>` issued by this API, and the signature hasn't been used before.

**Memo format:** `task:<taskId>|req:<requestId>`. The dashboard parses this. Don't change it without telling the team. When read via `getSignaturesForAddress`, the RPC prefixes it with a length (`[55] task:...`); strip it.

## Environment (`.env`)

```
RPC_URL=                     # Helius devnet URL
MULTISIG_ADDRESS=
VAULT_ADDRESS=
VAULT_INDEX=0
TOKEN_MINT=
SPENDING_LIMIT_ADDRESS=
PROVIDER_ADDRESS=            # the paid API's wallet (payTo)
OWNER_KEYPAIR_PATH=./keys/owner.json
AGENT_KEYPAIR_PATH=./keys/agent.json
ANTHROPIC_API_KEY=
PAID_API_URL=                # optional, default http://localhost:3001
```
The dashboard needs only the addresses and `RPC_URL` (no keypairs). Only the owner (Colin) can reset limits.

## Gotchas

- Devnet faucets are rate-limited per IP/account; reuse funded keys. The owner has ~0.47 SOL, enough for hundreds of resets.
- Real USDC doesn't exist on devnet. Use our own `TOKEN_MINT` everywhere.
- The daily limit (100) is shared by everyone testing. If you hit `LIMIT_EXCEEDED` unexpectedly, ask Colin to reset it.
- Changing spending limits is a Squads config change by the owner. Do it in `/scripts`, not at runtime.
- Wait for `confirmed` commitment before treating a payment as done. Verify on the API side too.
- Poll the RPC every few seconds, not continuously.
- Payments with a task starting `admin-test` are wallet tests; the dashboards hide them (once branch `fix/hide-test-payments` is merged).

## Out of scope today (roadmap slide only)

Mainnet and real stablecoins (USDC), alerts, multi-team support, SDK packaging, account-wide provider usage via admin APIs, Pay.sh integration.

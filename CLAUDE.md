# CLAUDE.md: AgentCard

A company card for AI agents, built for the BUILD IRL Solana hackathon (one day, submissions close 16:30).
Agents spend from a shared Squads vault on Solana, within on-chain spending limits. Every payment is tagged with the task it was for, and a dashboard shows finance what each agent bought and why.

The full plan is in `agent-wallet-plan.md`. Read it if you need product context.

## Priorities (read first)

1. **Working demo over clean code.** It's a one-day hackathon. Ship the smallest thing that works end to end.
2. **Must-have demo:** agent pays per call from its allowance → payments tagged with task → over-limit payment **rejected on-chain** → dashboard shows it all.
3. Don't add features outside the must-have list unless asked. Suggest them instead.
4. Keep changes small and runnable. After each change, say how to run or test it.

## Hard rules

- **Devnet only.** Never point anything at mainnet. RPC must be devnet (`https://api.devnet.solana.com` or a Helius devnet URL from `.env`).
- **Never commit or print secret keys.** Keypairs live in `/keys` (gitignored). Load paths from `.env`.
- **Squads: send funds to the vault PDA, never the multisig account address.** Squads warns that funds sent to the multisig account may be unrecoverable. Derive the vault with the SDK's vault PDA helper (index 0).
- **Don't guess Squads or Solana APIs.** If unsure of a function name or signature in `@sqds/multisig` or `@solana/web3.js`, check the installed package's types in `node_modules` or the current docs before writing code. Say so if you can't verify.
- **The spending limit must be enforced by Squads on-chain,** not only in our code. Off-chain checks (e.g. max per purchase) are extra, never the only guard.

## Stack

- TypeScript everywhere, Node 20+
- Solana devnet, `@solana/web3.js` (v1), `@solana/spl-token` (our own test token stands in for stablecoins)
- Squads v4 via `@sqds/multisig` (spending limits, `spendingLimitUse`)
- Agent: `@anthropic-ai/sdk` with tool use
- Paid API + wallet service: Express
- Dashboard: Next.js + Tailwind
- CLIs: Solana CLI, Squads CLI (for quick setup)

## Repo layout

```
/scripts         one-off setup: create token, mint, create multisig, fund vault, add agent + spending limit
/wallet-service  payAsAgent(): Squads spendingLimitUse from the vault, returns signature or LIMIT_EXCEEDED
/paid-api        Express: 402 challenge → verify payment on-chain → return data
/agent           Claude agent with buy_data tool; handles 402 → pay → retry
/dashboard       Next.js: reads vault tx history, shows spend per agent/task, budget left, blocked events
/keys            keypairs (gitignored)
.env             shared config (see below)
```

## Shared contracts (keep these stable, since other people's code depends on them)

**Payment function (wallet-service):**
```ts
payAsAgent(params: {
  agentKeypairPath: string;
  to: string;          // recipient address (payTo from the 402)
  amount: number;      // in token base units
  taskId: string;
  requestId: string;
}): Promise<{ ok: true; signature: string } | { ok: false; reason: "LIMIT_EXCEEDED" | "ERROR"; detail?: string }>
```

**402 response (paid-api):**
```json
{ "price": 20, "payTo": "<address>", "requestId": "<uuid>", "token": "<mint>" }
```
The client retries with header `X-Payment-Signature: <signature>`.

**Payment verification (paid-api) must check:** the transfer went to `payTo`, the amount is ≥ `price` of the right mint, the memo contains `req:<requestId>`, and the signature hasn't been used before.

**Memo format:** `task:<taskId>|req:<requestId>`. The dashboard parses this. Don't change it without telling the team.

## Environment (`.env`)

```
RPC_URL=
MULTISIG_ADDRESS=
VAULT_ADDRESS=
TOKEN_MINT=
OWNER_KEYPAIR_PATH=./keys/owner.json
AGENT_KEYPAIR_PATH=./keys/agent.json
PROVIDER_ADDRESS=
ANTHROPIC_API_KEY=
```

## Gotchas

- Devnet faucet is rate-limited. Reuse funded keys and transfer SOL between them rather than re-airdropping.
- Real USDC doesn't exist on devnet. Use our own `TOKEN_MINT` everywhere.
- Changing spending limits is a Squads config transaction that needs owner approval. Do it in `/scripts`, not at runtime, unless building the freeze feature.
- Wait for `confirmed` commitment before treating a payment as done. Verify on the API side too.
- The public devnet RPC can rate-limit dashboard polling. Poll every few seconds, not continuously, or use Helius.

## Out of scope today (roadmap slide only)

Mainnet and real stablecoins, alerts, multi-team support, SDK packaging. Pay.sh integration is a stretch goal only (45-min cap).
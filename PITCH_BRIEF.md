# AgentCard: brief for the presentation team

Everything below "What we built" was built and tested today on Solana devnet. Present anything under "Future ideas" as the roadmap, not as done. Slides must be **.pptx**, and the pitch is **3 minutes**.

## The one-liner

**AgentCard lets a company see and control everything its AI agents spend, both money and AI credits, across Claude, OpenAI and Gemini.** Each customer picks what they need: a **hard limit** that blocks spending, or a **spend target** that tracks how much they still want to use (for example, start-up credits that expire).

## The problem

- Companies are giving AI agents budgets: agents buy data and services, and they burn AI credits.
- Today an agent gets a card or an API key with no per-agent limit, and finance can't see what each agent spent, on what, or why.
- Start-ups get free AI credits (from OpenAI, Anthropic and others) that expire. They need to know if they're on pace to use them, not only whether they're overspending.

## Two customers, two needs

| Customer | Wants | In AgentCard |
|---|---|---|
| A company controlling agent spend | "Never let an agent spend more than X" | **Hard limit** |
| A start-up using free AI credits | "We should use $X before our credits expire" | **Spend target** (tracking only, never blocks) |

Each customer sets this per item in **Settings**; the dashboard just reports it.

## What we built (working today)

**Onboarding by public key (Settings page)**
- **Connect your wallet:** paste your Squads multisig address. The vault, the agent spending limit, the token and the agent keys are **found on Solana automatically**.
- **Add your agents:** for each AI agent, pick the AI it runs on (**Claude, OpenAI or Gemini**), paste its public key, and give it a name. The dashboard then tracks only those agents, by name.
- **Choose what to track:** for agent purchases, and separately for each AI provider's credits, choose **Hard limit** or **Spend target** and set the amount (and a date for credit targets).

**Agent purchases (this is where Solana is used)**
- Agents pay for data and services from a **shared company vault on Solana** (Squads), in a stablecoin. On devnet this is our own test token, shown as $1 per token.
- **Hard limit enforced on-chain:** the agent's daily limit is enforced by the Squads program itself. An over-limit purchase is **rejected by Solana**, not by our code, and the rejected attempt is still visible on the public explorer.
- **Changing the limit in Settings sends a real on-chain transaction** that updates it.
- **Every payment is tagged on-chain** with the task it was for (a public, tamper-proof receipt).
- The data provider **checks each payment on Solana** before handing over data, so it doesn't have to trust us.
- The provider sells real data: weather (Open-Meteo), stock prices (Yahoo Finance), trivia, and company financials (SEC). Financials cost $150, over the $100/day limit on purpose, so asking for them shows an on-chain rejection.

**AI credits across providers**
- Every model call the agent makes is recorded with its real cost, per task and per agent.
- One card per provider (Claude, OpenAI, Gemini): credits used, and either a **hard limit** (agents stop calling the model when it's reached) or a **spend target** ("$2.90 still to use, 96 days left").
- Any agent on any provider can report its usage to AgentCard through one simple web endpoint.

**Live dashboard**
- Updates every few seconds from Solana: every payment with amount, agent, task and an explorer link; blocked payments in red; budget left today.
- A per-task view that puts each task's on-chain purchases next to its AI cost.

**The Claude agent**
- A real Claude agent that buys data when it needs it: it's told the price, pays from its allowance, and gets the data. You type its question live, for example "What's Apple trading at?".

## How Solana is used (for the "why Solana" slide)

1. **Holds the money:** company funds sit in a Squads vault on Solana, with no bank or card network in between.
2. **Enforces the limit:** the agent's spending limit is a rule in an on-chain program. Nobody, including our own software, can make the agent overspend.
3. **Keeps the receipts:** each payment records its task on-chain, as a public audit trail anyone can check.
4. **Proves payment:** sellers verify payments on Solana themselves, with no trust needed between the agent's company and the seller.
5. **Fast and cheap enough for per-request payments:** agents pay per request, in seconds, for fractions of a cent in fees.

**Be honest about this:** AI credit tracking happens off-chain, because usage lives on OpenAI's, Anthropic's and Google's servers. Solana is the payment and enforcement layer for what agents buy; credits are tracked alongside it.

## Say these out loud (don't overclaim)

- It runs on **Solana devnet** with a **test stablecoin**, not real money.
- **Only the Claude usage is real.** The OpenAI and Gemini numbers on the dashboard are simulated for the demo and are **labelled "SIMULATED"** on screen.
- The **AI hard limit** stops agents that check with AgentCard before calling a model. Enforcing it on any agent needs the proxy on the roadmap.
- Changing an on-chain limit from Settings works for our demo wallet, because the demo holds the owner key. For real customers this would be approved by their finance team in Squads.
- The business model isn't validated yet. Present it as an assumption.

## Demo evidence (real devnet transactions)

- A payment made by the Claude agent: https://explorer.solana.com/tx/gccafQctuqbMMwLPUeG48psdm4sELjr6YuosiEfjR4LpPDgxhihhnU1bTNWpr84PGqrdMGgsJuAEakh6Fp9rbHX?cluster=devnet
- A payment rejected on-chain by the spending limit: https://explorer.solana.com/tx/ZM1vtWwKurLSkjjiwmranmaoZzHsYLtAGccCh7r9DBtws5UA4q6TD4bZJcUjmfhmPfnP5ch3EdTxixWMSKVQWh9?cluster=devnet
- The company vault: `8Bea5Fs81mz7isX3D3zuWisg8pELaGos5myoT7s2nybQ`

**Screenshots to put in the deck** (ask Colin): the dashboard with the credit cards and a red BLOCKED row, the Settings page (wallet, agents, hard limit vs spend target), and the explorer page of the rejected payment.

## Suggested demo (about 2 minutes)

1. **Settings:** "Paste your Squads address and your agents' keys, pick Claude, OpenAI or Gemini for each, and choose a hard limit or a spend target."
2. **Dashboard:** "Here's everything our agents spend: purchases on Solana, and AI credits for each provider."
3. **Ask the agent** "What's the weather in Dublin?" It pays $10 on Solana and gets live data, and the purchase and Claude credit cards both move.
4. **Ask** "What's Apple trading at?" It pays $20.
5. **Ask** "Get Apple's annual financials." That costs $150, over the $100 limit: **Solana rejects it**, a red row appears, and the explorer shows the rejected transaction.
6. **Close on the credit cards:** "Same controls for your AI credits: a limit so agents can't burn them, or a target so you don't waste the free ones."

## Future ideas (roadmap slide)

- **AI gateway / proxy:** route agents' AI calls through AgentCard, so credit limits are enforced on any agent without its cooperation.
- **Real OpenAI and Gemini usage:** pull usage from the providers directly instead of the demo simulation.
- **Mainnet and real stablecoins (USDC).**
- **Finance approvals in Squads:** limit changes approved by the finance team's multisig, instead of a key on our server.
- **Freeze switch and approved-vendors-only:** instantly stop an agent, or only let it pay approved sellers, both enforced on-chain. Both are prototyped and tested, but not in the product yet.
- **Alerts:** Slack or email when an agent nears a limit or a credit target is behind pace.
- **Per-task budgets** and **teams / multiple workspaces**.
- **On-chain receipts for AI usage:** a tamper-proof record of what each task cost in AI credits.
- **SDK** so any agent framework can plug in with one line.
- **Reports:** export for finance and accounting.

## Business model (assumption, not validated)

A per-agent monthly subscription, or a small fee on agent spend. Customers: companies running AI agents, and start-ups managing free AI credits.

## Submission checklist

- [ ] Deck as **.pptx** (the only accepted format)
- [ ] 3-minute pitch rehearsed with the live demo
- [ ] Backup demo video recorded (in case the live demo fails)
- [ ] Submitted at **tally.so/r/rj7oqN** before **16:30**

# Pay.sh Setup Guide (PowerShell / Windows)

Pay.sh is Solana Foundation's payment layer for AI agents. The `pay` CLI wraps
your tools (`curl`, `claude`, `codex`, etc.), detects HTTP 402 "Payment
Required" challenges from APIs, and pays for them automatically out of your
account balance — no per-service subscriptions or API keys needed.

This guide covers install and redemption on Windows using PowerShell.

> **Note:** `brew install pay` (shown in some docs/announcements) is
> Mac/Linux-only. On Windows, use the `npm` install path below instead.

---

## 1. Confirm Node.js / npm is installed

```powershell
node --version
npm --version
```

If either command errors out, install Node.js for Windows from
[nodejs.org](https://nodejs.org), then close and reopen PowerShell before
continuing.

## 2. Install the pay CLI

```powershell
npm install -g @solana/pay
```

Confirm it installed and is on your PATH:

```powershell
pay --version
```

If PowerShell doesn't recognize `pay` after installing, close and reopen the
terminal — npm global installs sometimes need a fresh PATH read.

**Execution policy note:** if you hit an error like *"running scripts is
disabled on this system"*, that's PowerShell blocking npm's shim script, not
an issue with `pay` itself. Fix it by running (in an elevated PowerShell
window):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 3. Redeem your code

```powershell
pay setup --redeem <code>
```

Replace `<code>` with your actual discount code (no angle brackets). This
sets up your local wallet/account and applies the credit in one step.

## 4. Confirm the account and balance

```powershell
pay whoami
pay account list
```

Check that an account exists and the credit landed before spending anything.

## 5. Browse the provider catalog

```powershell
pay skills update
pay skills search "<keyword>"
```

Example:

```powershell
pay skills search "translate"
pay skills search "data" --category data
```

Or browse the same catalog in a browser at **pay.sh/services**.

## 6. Test in sandbox first (no real funds used)

```powershell
pay --sandbox curl https://debugger.pay.sh/mpp/quote/AAPL
```

This runs the full 402 payment handshake against an ephemeral sandbox wallet,
so you can see how it works before touching your real balance.

## 7. Make a real paid call, or start an agent session

Wrap a normal request with `pay` and it handles payment automatically:

```powershell
pay curl <provider-url>
```

Or start an agent session with Pay's tools attached, so the agent itself can
discover and pay for catalog APIs mid-conversation:

```powershell
pay claude
pay codex
```

---

## Quick reference

| Command | Purpose |
|---|---|
| `pay --version` | Verify install |
| `pay setup --redeem <code>` | Set up account + apply a credit code |
| `pay whoami` / `pay account list` | Inspect the active account |
| `pay skills update` | Refresh the provider catalog |
| `pay skills search "<keyword>"` | Find a paid API by keyword |
| `pay --sandbox curl <url>` | Test a request without spending real funds |
| `pay curl <url>` | Make a real paid request |
| `pay claude` / `pay codex` | Start an agent session with Pay tools attached |

## What credits get you

Redeeming a code funds your **Pay.sh account balance** — it isn't a grant of
tokens/quota for a specific AI model. That balance is spent per-request on
whatever APIs are listed in the Pay.sh marketplace catalog (a community-
maintained registry that changes over time), so check `pay skills search` or
pay.sh/services for what's currently available before assuming a particular
model or service is covered.

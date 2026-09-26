Setup scripts for token + multisig creation

Instructions
1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and edit `RPC_URL` if needed.
3. Generate or copy keypairs into `./keys/owner.json` and `./keys/agent.json` (these must be JSON secret-key arrays). Keep them private.
4. Run the scaffold script (note: script is a scaffold and requires completing TODOs):

```bash
npx ts-node scripts/create-token-and-multisig.ts
```

5. After implementing the Squads and token creation flow in the script and updating `.env`, run the payment test:

```bash
npx ts-node scripts/test-payments.ts
```

Notes
- Creating or changing Squads spending limits may require owner approvals. Use the Squads CLI or the SDK and follow the multisig approval flow.

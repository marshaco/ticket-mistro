import express from 'express';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { Connection, ParsedTransactionWithMeta } from '@solana/web3.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const price = Number(process.env.PAID_API_PRICE || 20);
const { RPC_URL, PROVIDER_ADDRESS: payTo, TOKEN_MINT: tokenMint } = process.env;
if (!RPC_URL || !payTo || !tokenMint) {
  throw new Error('RPC_URL, PROVIDER_ADDRESS and TOKEN_MINT must be set in .env (see scripts/setup.ts)');
}

const connection = new Connection(RPC_URL, 'confirmed');
const usedSignatures = new Set<string>();
const openRequests = new Set<string>(); // requestIds issued in a 402 and not yet paid

// Token amount (base units) that `owner` received of `mint` in this tx.
function tokenReceived(tx: ParsedTransactionWithMeta, owner: string, mint: string): bigint {
  const find = (list: any[] | null | undefined) => (list ?? []).find((b) => b.owner === owner && b.mint === mint);
  const amount = (b: any) => BigInt(b?.uiTokenAmount?.amount ?? '0');
  return amount(find(tx.meta?.postTokenBalances)) - amount(find(tx.meta?.preTokenBalances));
}

function memos(tx: ParsedTransactionWithMeta): string[] {
  return tx.transaction.message.instructions
    .filter((ix: any) => ix.program === 'spl-memo')
    .map((ix: any) => String(ix.parsed));
}

// Checks: tx confirmed and succeeded, >= price of the right mint went to payTo,
// memo contains req:<requestId>, signature not used before. Returns an error string or null.
async function verifyPayment(signature: string, requestId: string): Promise<string | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) return 'Not a valid Solana transaction signature';
  const tx = await connection.getParsedTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx) return 'Transaction not found or not confirmed';
  if (tx.meta?.err) return 'Transaction failed on-chain';
  const received = tokenReceived(tx, payTo!, tokenMint!);
  if (received < BigInt(price)) return `Paid ${received}, price is ${price}`;
  if (!memos(tx).some((m) => m.includes(`req:${requestId}`))) return `Memo does not contain req:${requestId}`;
  return null;
}

app.get('/weather', async (req, res) => {
  const signature = req.headers['x-payment-signature'];

  if (!signature || typeof signature !== 'string' || signature.trim() === '') {
    const requestId = randomUUID();
    openRequests.add(requestId);
    return res.status(402).json({
      price,
      payTo,
      requestId,
      token: tokenMint,
    });
  }

  const requestId = (req.query.requestId as string | undefined) ??
    (req.headers['x-request-id'] as string | undefined);
  if (!requestId) {
    return res.status(400).json({ error: 'Missing requestId' });
  }
  if (!openRequests.has(requestId)) {
    return res.status(402).json({ error: 'Unknown or already-paid requestId' });
  }

  if (usedSignatures.has(signature)) {
    return res.status(409).json({ error: 'Signature already used' });
  }

  try {
    const problem = await verifyPayment(signature, requestId);
    if (problem) return res.status(402).json({ error: problem });
  } catch (e: any) {
    return res.status(502).json({ error: `Could not verify payment: ${e.message}` });
  }

  usedSignatures.add(signature);
  openRequests.delete(requestId);

  return res.json({
    location: 'Dublin',
    temperatureC: 17,
    condition: 'Partly cloudy',
    source: 'demo-paid-api',
    paymentVerified: true,
    requestId,
    signature,
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'paid-api' });
});

app.listen(PORT, () => {
  console.log(`Paid API running on http://localhost:${PORT}`);
});

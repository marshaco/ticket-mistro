import express from 'express';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const price = Number(process.env.PAID_API_PRICE || 20);
const payTo = process.env.PROVIDER_ADDRESS || '11111111111111111111111111111111';
const tokenMint = process.env.TOKEN_MINT || 'So11111111111111111111111111111111111111112';

const usedSignatures = new Set<string>();
const paymentMemoPrefix = 'task:';

app.get('/weather', (req, res) => {
  const signature = req.headers['x-payment-signature'];

  if (!signature || typeof signature !== 'string' || signature.trim() === '') {
    return res.status(402).json({
      price,
      payTo,
      requestId: randomUUID(),
      token: tokenMint,
    });
  }

  const requestId = (req.query.requestId as string | undefined) ??
    (req.headers['x-request-id'] as string | undefined);
  if (!requestId) {
    return res.status(400).json({ error: 'Missing requestId' });
  }

  if (usedSignatures.has(signature)) {
    return res.status(409).json({ error: 'Signature already used' });
  }

  // Demo-only stub verification: accept any non-empty signature for now.
  // This is the seam where real Solana checks will be added later.
  usedSignatures.add(signature);

  return res.json({
    location: 'Dublin',
    temperatureC: 17,
    condition: 'Partly cloudy',
    source: 'demo-paid-api',
    paymentVerified: true,
    requestId,
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'paid-api' });
});

app.listen(PORT, () => {
  console.log(`Paid API running on http://localhost:${PORT}`);
});

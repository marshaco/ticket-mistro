import "dotenv/config";
import express from "express";
import crypto from "crypto";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
 
const app = express();
 
// ---------------------------------------------------------------------------
// Shared config, per CLAUDE.md's .env. PROVIDER_ADDRESS is who gets paid
// (this API's own wallet) — NOT the vault.
// ---------------------------------------------------------------------------
const RPC_URL = process.env.RPC_URL;
const PAY_TO = process.env.PROVIDER_ADDRESS;
const TOKEN_MINT = process.env.TOKEN_MINT;
if (!RPC_URL || !PAY_TO || !TOKEN_MINT) {
  throw new Error("RPC_URL, PROVIDER_ADDRESS and TOKEN_MINT must be set in .env (see scripts/setup.ts)");
}
 
const connection = new Connection(RPC_URL, "confirmed");
 
// The real Solana Memo program — payAsAgent() writes memos through this exact
// program, as a separate instruction alongside the Squads spendingLimitUse call.
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
 
// ---------------------------------------------------------------------------
// Small fetch helper with a timeout, so a hung upstream API can't hang the demo
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url, opts = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
 
// ---------------------------------------------------------------------------
// Weather: Open-Meteo (free, no API key)
// ---------------------------------------------------------------------------
const WEATHER_CODES = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Rain showers", 81: "Heavy rain showers", 95: "Thunderstorm",
};
 
async function geocodeCity(city) {
  const geoRes = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
  );
  const geo = await geoRes.json();
  const hit = geo.results?.[0];
  if (!hit) throw new Error(`unknown city: ${city}`);
  return hit;
}
 
async function fetchWeather(city) {
  const hit = await geocodeCity(city);
 
  const wxRes = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,weather_code`
  );
  const wx = await wxRes.json();
 
  return {
    city: hit.name,
    tempC: wx.current.temperature_2m,
    condition: WEATHER_CODES[wx.current.weather_code] || `code ${wx.current.weather_code}`,
  };
}
 
// ---------------------------------------------------------------------------
// Stock quotes: Yahoo Finance chart endpoint (free, no API key; stooq's CSV endpoint was retired)
// ---------------------------------------------------------------------------
async function fetchStockQuote(symbolRaw) {
  const symbol = symbolRaw.toUpperCase();
  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  const json = await res.json();
  const meta = json.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error(`unknown symbol: ${symbol}`);

  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose;
  return {
    symbol: meta.symbol,
    price,
    currency: meta.currency,
    changePct: prevClose ? +(((price - prevClose) / prevClose) * 100).toFixed(2) : null,
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
  };
}
 
// ---------------------------------------------------------------------------
// Trivia: Open Trivia DB (free, no API key)
// ---------------------------------------------------------------------------
function decodeHtmlEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&eacute;/g, "é")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”");
}
 
async function fetchTrivia() {
  const res = await fetchWithTimeout("https://opentdb.com/api.php?amount=1&type=multiple");
  const json = await res.json();
  const q = json.results?.[0];
  if (!q) throw new Error("no trivia available");
 
  return {
    category: q.category,
    question: decodeHtmlEntities(q.question),
    correctAnswer: decodeHtmlEntities(q.correct_answer),
  };
}
 
// ---------------------------------------------------------------------------
// Company financials: SEC EDGAR (free, no API key — but SEC requires a
// descriptive User-Agent with contact info; swap SEC_USER_AGENT for a real
// contact before using this outside the hackathon, per SEC's fair-access policy).
// Priced above the vault's 100-unit spending limit on purpose: a real startup
// use case (an agent pulling audited financials before, say, a vendor or
// investment decision) that's genuinely worth more than a weather lookup, and
// doubles as the over-limit rejection demo.
// ---------------------------------------------------------------------------
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || "AgentCard-Hackathon-Demo contact@example.com";
 
let tickerMapPromise;
function getTickerMap() {
  if (!tickerMapPromise) {
    tickerMapPromise = fetchWithTimeout("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": SEC_USER_AGENT },
    }).then((r) => r.json());
  }
  return tickerMapPromise;
}
 
// Pulls the most recent annual (10-K) value for a given us-gaap XBRL tag.
function latestAnnualValue(companyFacts, tag) {
  const entries = companyFacts.facts?.["us-gaap"]?.[tag]?.units?.USD;
  if (!entries) return null;
  const annual = entries.filter((e) => e.form === "10-K" && e.fp === "FY");
  if (annual.length === 0) return null;
  const latest = annual.reduce((a, b) => (new Date(b.end) > new Date(a.end) ? b : a));
  return { value: latest.val, fiscalYear: latest.fy, periodEnd: latest.end };
}
 
async function fetchCompanyFinancials(tickerRaw) {
  const ticker = tickerRaw.toUpperCase();
  const tickerMap = await getTickerMap();
  const entry = Object.values(tickerMap).find((e) => e.ticker === ticker);
  if (!entry) throw new Error(`unknown ticker: ${ticker}`);
 
  const cik10 = String(entry.cik_str).padStart(10, "0");
  const factsRes = await fetchWithTimeout(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`, {
    headers: { "User-Agent": SEC_USER_AGENT },
  });
  if (!factsRes.ok) throw new Error(`SEC EDGAR lookup failed: ${factsRes.status}`);
  const facts = await factsRes.json();
 
  return {
    company: facts.entityName,
    ticker,
    cik: entry.cik_str,
    revenue:
      latestAnnualValue(facts, "Revenues") ||
      latestAnnualValue(facts, "RevenueFromContractWithCustomerExcludingAssessedTax"),
    netIncome: latestAnnualValue(facts, "NetIncomeLoss"),
    totalAssets: latestAnnualValue(facts, "Assets"),
  };
}
 
// ---------------------------------------------------------------------------
// "Catalog" of paid endpoints — 4 demo endpoints, backed by real external
// APIs (all free, no API key required).
// price is in token base units. TOKEN_MINT has 0 decimals (per setup.ts), so
// these numbers are whole tokens, no decimal conversion needed anywhere.
// ---------------------------------------------------------------------------
const ENDPOINTS = {
  "/weather": {
    price: 10,
    data: (req) => fetchWeather(req.query.city || "Dublin"),
  },
  "/stock-quote": {
    price: 20,
    data: (req) => fetchStockQuote(req.query.symbol || "AAPL"), // AAPL is a real, always-quoted ticker
  },
  "/trivia": {
    price: 5,
    data: () => fetchTrivia(),
  },
  "/company-financials": {
    // Priced above the vault's 100-unit spending limit on purpose. An agent
    // that tries to buy this will have payAsAgent() ask Squads to move 150,
    // which spendingLimitUse rejects on-chain — the real limit-rejection demo.
    price: 150,
    data: (req) => fetchCompanyFinancials(req.query.ticker || "AAPL"),
  },
};
 
// ---------------------------------------------------------------------------
// In-memory state — fine for a hackathon demo.
// requestId -> { path, price }, so real verification can check the on-chain
// memo's requestId against the price we actually quoted for that path.
// ---------------------------------------------------------------------------
const pendingRequests = new Map();
const usedSignatures = new Set(); // replay protection, applies in both modes
 
// Real on-chain verification by default. STUB_VERIFICATION=true only for testing without a wallet.
const STUB_MODE = process.env.STUB_VERIFICATION === "true";
 
for (const [path, config] of Object.entries(ENDPOINTS)) {
  app.get(path, async (req, res) => {
    const signature = req.header("X-Payment-Signature");
 
    // --- No payment yet: issue the 402 challenge ---
    if (!signature) {
      const requestId = crypto.randomUUID();
      pendingRequests.set(requestId, { path, price: config.price });
      return res.status(402).json({
        price: config.price,
        payTo: PAY_TO,
        requestId,
        token: TOKEN_MINT,
      });
    }
 
    // --- Payment attached ---
    if (usedSignatures.has(signature)) {
      return res.status(400).json({ error: "signature already used" });
    }
 
    if (STUB_MODE) {
      // Stub verification: only require a non-empty signature. There's no
      // real transaction to check yet, so nothing to correlate to a price.
      if (signature.trim().length === 0) {
        return res.status(402).json({ error: "empty signature" });
      }
    }
    let paidRequestId = null;
    if (!STUB_MODE) {
      const result = await verifyPaymentOnChain({ signature, path });
      if (!result.ok) {
        return res.status(402).json({ error: result.reason });
      }
      paidRequestId = result.requestId;
    }
 
    // Fetch the real data BEFORE marking the signature used, so an upstream
    // failure (rate limit, timeout, unknown city/symbol) doesn't burn the
    // agent's payment with nothing to show for it.
    try {
      const data = await config.data(req);
      usedSignatures.add(signature);
      if (paidRequestId) pendingRequests.delete(paidRequestId);
      return res.json({ data, paymentVerified: !STUB_MODE, signature });
    } catch (err) {
      return res.status(502).json({ error: `upstream data fetch failed: ${err.message}` });
    }
  });
}
 
app.get("/health", (req, res) => res.json({ ok: true, stubMode: STUB_MODE }));
 
// ---------------------------------------------------------------------------
// Real verification, matching how wallet-service/index.js (payAsAgent) builds
// its transaction: a plain SPL Memo instruction ("task:<taskId>|req:<requestId>")
// plus a Squads spendingLimitUse instruction that moves tokens as an internal
// CPI (not a top-level SPL Token instruction — so we check balance deltas,
// not instruction contents, to see what actually moved).
// ---------------------------------------------------------------------------
let destinationAtaPromise;
function getDestinationAta() {
  if (!destinationAtaPromise) {
    destinationAtaPromise = getAssociatedTokenAddress(new PublicKey(TOKEN_MINT), new PublicKey(PAY_TO));
  }
  return destinationAtaPromise;
}
 
async function verifyPaymentOnChain({ signature, path }) {
  let tx;
  try {
    tx = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  } catch (err) {
    return { ok: false, reason: `couldn't fetch transaction: ${err.message}` };
  }
  if (!tx) {
    return { ok: false, reason: "transaction not found (not confirmed yet, or wrong signature)" };
  }
 
  // skipPreflight means an over-limit payment still lands on-chain with a real
  // signature, but as a FAILED transaction. That must not count as payment.
  if (tx.meta?.err) {
    return { ok: false, reason: `transaction failed on-chain: ${JSON.stringify(tx.meta.err)}` };
  }
 
  // 1. Find the memo instruction and pull requestId out of "task:<t>|req:<r>"
  const instructions = tx.transaction.message.instructions;
  const memoIx = instructions.find((ix) => ix.programId?.toBase58?.() === MEMO_PROGRAM_ID);
  const memoText = memoIx?.parsed; // spl-memo instructions decode straight to a string
  const match = typeof memoText === "string" && memoText.match(/^task:(.+)\|req:(.+)$/);
  if (!match) {
    return { ok: false, reason: "no valid memo found on transaction" };
  }
  const [, , requestId] = match;
 
  // 2. That requestId must be one we actually issued, for this same path
  const pending = pendingRequests.get(requestId);
  if (!pending || pending.path !== path) {
    return { ok: false, reason: "memo requestId doesn't match a pending request for this endpoint" };
  }
 
  // 3. Confirm the right amount of the right token actually reached PAY_TO's
  //    associated token account. The transfer happens inside Squads' program
  //    via CPI, so we read it off the transaction's token balance deltas
  //    rather than looking for a top-level transfer instruction.
  const destinationAta = (await getDestinationAta()).toBase58();
  const accountKeys = tx.transaction.message.accountKeys.map((k) =>
    k.pubkey ? k.pubkey.toBase58() : k.toBase58()
  );
  const pre = tx.meta.preTokenBalances || [];
  const post = tx.meta.postTokenBalances || [];
 
  let paidAmount = 0n;
  for (const p of post) {
    if (p.mint !== TOKEN_MINT) continue;
    if (accountKeys[p.accountIndex] !== destinationAta) continue;
    const before = pre.find((b) => b.accountIndex === p.accountIndex);
    const beforeAmt = BigInt(before?.uiTokenAmount.amount || "0");
    const afterAmt = BigInt(p.uiTokenAmount.amount);
    paidAmount += afterAmt - beforeAmt;
  }
 
  if (paidAmount < BigInt(pending.price)) {
    return { ok: false, reason: `paid ${paidAmount}, needed ${pending.price}` };
  }
 
  // The caller consumes requestId only after the data is delivered, so an upstream
  // failure doesn't burn the agent's payment.
  return { ok: true, requestId };
}
 
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`paid-api listening on http://localhost:${port} (stub verification: ${STUB_MODE})`);
  console.log(`endpoints: ${Object.keys(ENDPOINTS).join(", ")}`);
  console.log(`payTo: ${PAY_TO}`);
});
 
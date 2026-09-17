// backend/routes/api.js
const express = require('express');
const router = express.Router();
const config = require('../config');
const db = require('../ledger/database');
const doubleEntry = require('../ledger/doubleEntry');
const proxyResolver = require('../services/proxyResolver');
const fxEngine = require('../services/fxEngine');
const qrEngine = require('../services/qrEngine');
const paymentOrchestrator = require('../services/paymentOrchestrator');

// 1. Config & Rails Info
router.get('/config', (req, res) => {
  res.json({
    currencies: config.SUPPORTED_CURRENCIES,
    defaultFeePercent: config.DEFAULT_FEE_PERCENT,
    quoteExpirySeconds: config.QUOTE_EXPIRY_SECONDS,
    limits: config.MAX_TRANSACTION_LIMIT
  });
});

// 2. Accounts & Balances
router.get('/accounts', (req, res) => {
  const accounts = db.getAccounts();
  res.json({ accounts });
});

// 3. Universal Proxy Resolution (Address / VPA)
router.post('/resolve-address', (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ error: 'identifier is required' });
    }
    const resolved = proxyResolver.resolve(identifier);
    res.json(resolved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Guaranteed FX Quote
router.post('/quotes', async (req, res) => {
  try {
    const { fromCurrency, toCurrency, sendAmount } = req.body;
    if (!fromCurrency || !toCurrency || !sendAmount) {
      return res.status(400).json({ error: 'fromCurrency, toCurrency, and sendAmount are required' });
    }
    const quote = await fxEngine.generateQuote({ fromCurrency, toCurrency, sendAmount });
    res.json(quote);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Transfer Execution (State Machine & Double-Entry Ledger)
router.post('/transfers', async (req, res) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;
    const {
      senderAccountId,
      recipientVpa,
      sendAmount,
      sendCurrency,
      receiveCurrency,
      quoteId,
      mpin,
      note
    } = req.body;

    const result = await paymentOrchestrator.processPayment({
      idempotencyKey,
      senderAccountId,
      recipientVpa,
      sendAmount,
      sendCurrency,
      receiveCurrency,
      quoteId,
      mpin,
      note
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Get Transaction History
router.get('/transfers', (req, res) => {
  const transactions = db.getTransactions(req.query.limit || 50);
  res.json({ transactions });
});

// 7. Get Transaction by ID
router.get('/transfers/:id', (req, res) => {
  const tx = db.getTransaction(req.params.id);
  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  res.json({ transaction: tx });
});

// 8. Generate Universal QR Code
router.post('/qr/generate', async (req, res) => {
  try {
    const { pa, pn, am, cu, tn } = req.body;
    const qrResult = await qrEngine.generateUPIQR({ pa, pn, am, cu, tn });
    res.json(qrResult);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Parse Scanned QR Payload
router.post('/qr/parse', (req, res) => {
  try {
    const { payload } = req.body;
    const parsed = qrEngine.parsePayload(payload);
    res.json(parsed);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Double-Entry Ledger Audit & Journal Entries
router.get('/ledger', (req, res) => {
  const audit = doubleEntry.auditLedger();
  const entries = db.getLedgerEntries(req.query.limit || 100);
  res.json({ audit, entries });
});

// 11. Reset State
router.post('/reset', (req, res) => {
  db.reset();
  res.json({ success: true, message: 'Database and ledger reset to initial seed state.' });
});

module.exports = router;

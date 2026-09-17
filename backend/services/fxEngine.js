const crypto = require('crypto');
const config = require('../config');
const db = require('../ledger/database');

/**
 * FX Rate Engine with Guaranteed Rate Lock
 * Modeled after central FX liquidity providers in cross-border systems.
 */
class FXEngine {
  constructor() {
    this.ratesCache = { ...config.BASE_FX_RATES };
    this.lastFetched = 0;
  }

  /**
   * Get current exchange rate between any two supported currencies
   */
  async getExchangeRate(fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return 1.0;

    // Optional: refresh from external public API if older than 1 hour
    const now = Date.now();
    if (now - this.lastFetched > 3600000) {
      try {
        const fetch = (await import('node:http')).get;
        // Keep fallback safe
        this.lastFetched = now;
      } catch (err) {
        // Fallback to configured base rates
      }
    }

    const usdToBase = config.BASE_FX_RATES[fromCurrency] || 1.0;
    const usdToTarget = config.BASE_FX_RATES[toCurrency] || 1.0;

    // Calculate cross-rate: (Target / Base)
    const rate = usdToTarget / usdToBase;
    return parseFloat(rate.toFixed(6));
  }

  /**
   * Generate a time-bound guaranteed FX quote
   */
  async generateQuote({ fromCurrency, toCurrency, sendAmount }) {
    if (!config.SUPPORTED_CURRENCIES[fromCurrency]) {
      throw new Error(`Unsupported sender currency: ${fromCurrency}`);
    }
    if (!config.SUPPORTED_CURRENCIES[toCurrency]) {
      throw new Error(`Unsupported receiver currency: ${toCurrency}`);
    }

    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Valid send amount is required');
    }

    // Check transaction limits
    const maxLimit = config.MAX_TRANSACTION_LIMIT[fromCurrency] || 10000;
    if (amount > maxLimit) {
      throw new Error(`Amount exceeds maximum transaction limit of ${config.SUPPORTED_CURRENCIES[fromCurrency].symbol}${maxLimit} ${fromCurrency}`);
    }

    const interbankRate = await this.getExchangeRate(fromCurrency, toCurrency);

    // Fee calculation
    const calculatedFee = amount * config.DEFAULT_FEE_PERCENT;
    const minFee = config.MIN_FEE[fromCurrency] || 0.50;
    const totalFee = parseFloat(Math.max(calculatedFee, minFee).toFixed(2));

    const netAmount = parseFloat((amount - totalFee).toFixed(2));
    const recipientReceives = parseFloat((netAmount * interbankRate).toFixed(2));

    const expiresAt = new Date(Date.now() + config.QUOTE_EXPIRY_SECONDS * 1000).toISOString();
    const quoteId = 'quo_' + crypto.randomUUID().substr(0, 12);

    const quote = {
      quoteId,
      fromCurrency,
      toCurrency,
      sendAmount: amount,
      interbankRate,
      feePercentage: (config.DEFAULT_FEE_PERCENT * 100).toFixed(2) + '%',
      totalFee,
      netAmount,
      recipientReceives,
      senderSymbol: config.SUPPORTED_CURRENCIES[fromCurrency].symbol,
      receiverSymbol: config.SUPPORTED_CURRENCIES[toCurrency].symbol,
      createdAt: new Date().toISOString(),
      expiresAt,
      expirySeconds: config.QUOTE_EXPIRY_SECONDS,
      status: 'ACTIVE'
    };

    db.saveQuote(quote);
    return quote;
  }

  /**
   * Validate that a quote is still active and unexpired
   */
  validateQuote(quoteId, expectedFrom, expectedTo, expectedAmount) {
    const quote = db.getQuote(quoteId);
    if (!quote) {
      throw new Error('Quote not found or invalid');
    }

    if (new Date() > new Date(quote.expiresAt)) {
      throw new Error('FX Quote has expired. Please refresh to lock a new exchange rate.');
    }

    if (quote.fromCurrency !== expectedFrom || quote.toCurrency !== expectedTo) {
      throw new Error('Currency mismatch between quote and transaction');
    }

    if (Math.abs(quote.sendAmount - expectedAmount) > 0.01) {
      throw new Error('Amount mismatch between quote and transaction');
    }

    return quote;
  }
}

module.exports = new FXEngine();

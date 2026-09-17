// backend/config.js

module.exports = {
  PORT: process.env.PORT || 4000,
  QUOTE_EXPIRY_SECONDS: 180, // 3 minutes guaranteed FX rate lock
  DEFAULT_FEE_PERCENT: 0.0075, // 0.75% network & switch fee (lower than existing 1%)
  MIN_FEE: {
    USD: 0.50,
    INR: 20.00,
    EUR: 0.50,
    GBP: 0.40,
    SGD: 0.70,
    AED: 2.00
  },
  MAX_TRANSACTION_LIMIT: {
    USD: 10000,
    INR: 500000,
    EUR: 10000,
    GBP: 8000,
    SGD: 15000,
    AED: 35000
  },
  SUPPORTED_CURRENCIES: {
    USD: {
      symbol: '$',
      name: 'US Dollar',
      country: 'United States',
      flag: '🇺🇸',
      rail: 'FedNow / RTP (USA)',
      railCode: 'FEDNOW',
      idFormat: 'username@fednow, phone or routing+account'
    },
    INR: {
      symbol: '₹',
      name: 'Indian Rupee',
      country: 'India',
      flag: '🇮🇳',
      rail: 'UPI (India)',
      railCode: 'UPI',
      idFormat: 'user@bank (e.g., rahul@okhdfcbank, priya@paytm)'
    },
    EUR: {
      symbol: '€',
      name: 'Euro',
      country: 'European Union',
      flag: '🇪🇺',
      rail: 'SEPA Instant (Europe)',
      railCode: 'SEPA',
      idFormat: 'IBAN (e.g. DE89370400440532013000) or phone'
    },
    GBP: {
      symbol: '£',
      name: 'British Pound',
      country: 'United Kingdom',
      flag: '🇬🇧',
      rail: 'Faster Payments (UK)',
      railCode: 'FPS',
      idFormat: 'Sort Code + Account (e.g., 20-00-00 12345678)'
    },
    SGD: {
      symbol: 'S$',
      name: 'Singapore Dollar',
      country: 'Singapore',
      flag: '🇸🇬',
      rail: 'PayNow (Singapore)',
      railCode: 'PAYNOW',
      idFormat: 'Mobile or UEN (e.g., +6581234567)'
    },
    AED: {
      symbol: 'د.إ',
      name: 'UAE Dirham',
      country: 'United Arab Emirates',
      flag: '🇦🇪',
      rail: 'Aani Instant (UAE)',
      railCode: 'AANI',
      idFormat: 'Mobile or IBAN (e.g. AE290330000000000123456)'
    }
  },
  // Interbank base rates (relative to 1 USD)
  BASE_FX_RATES: {
    USD: 1.0,
    INR: 83.45,
    EUR: 0.92,
    GBP: 0.78,
    SGD: 1.34,
    AED: 3.67
  }
};

// backend/ledger/database.js
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger_store.json');

// Initial seed data for demo/testing across all rails
const SEED_DATA = {
  accounts: [
    {
      id: 'acc_in_001',
      vpa: 'rahul@okhdfcbank',
      name: 'Rahul Sharma',
      currency: 'INR',
      country: 'India',
      rail: 'UPI',
      bankName: 'HDFC Bank',
      accountNumber: '**** **** 4589',
      balance: 125000.00,
      phone: '+919876543210',
      status: 'VERIFIED',
      mpinHash: '1234' // demo MPIN: 1234
    },
    {
      id: 'acc_in_002',
      vpa: 'priya.sharma@paytm',
      name: 'Priya Sharma',
      currency: 'INR',
      country: 'India',
      rail: 'UPI',
      bankName: 'State Bank of India',
      accountNumber: '**** **** 8821',
      balance: 45200.00,
      phone: '+919812345678',
      status: 'VERIFIED',
      mpinHash: '1234'
    },
    {
      id: 'acc_us_001',
      vpa: 'alex@fednow',
      name: 'Alex Johnson',
      currency: 'USD',
      country: 'United States',
      rail: 'FEDNOW',
      bankName: 'JPMorgan Chase Bank',
      accountNumber: '**** **** 1029',
      balance: 5400.00,
      phone: '+14155552671',
      status: 'VERIFIED',
      mpinHash: '1234'
    },
    {
      id: 'acc_us_002',
      vpa: 'sarah.merch@fednow',
      name: 'Sarah Miller Store',
      currency: 'USD',
      country: 'United States',
      rail: 'FEDNOW',
      bankName: 'Bank of America',
      accountNumber: '**** **** 9482',
      balance: 14200.50,
      phone: '+12125559812',
      status: 'VERIFIED',
      mpinHash: '1234'
    },
    {
      id: 'acc_eu_001',
      vpa: 'DE89370400440532013000',
      name: 'Emma Schmidt',
      currency: 'EUR',
      country: 'Germany',
      rail: 'SEPA',
      bankName: 'Deutsche Bank Frankfurt',
      accountNumber: 'DE89370400440532013000',
      balance: 8900.00,
      phone: '+491512345678',
      status: 'VERIFIED',
      mpinHash: '1234'
    },
    {
      id: 'acc_uk_001',
      vpa: '20-00-00-12345678',
      name: 'Oliver Smith',
      currency: 'GBP',
      country: 'United Kingdom',
      rail: 'FPS',
      bankName: 'Barclays London',
      accountNumber: '20-00-00 12345678',
      balance: 6200.00,
      phone: '+447911123456',
      status: 'VERIFIED',
      mpinHash: '1234'
    },
    {
      id: 'acc_sg_001',
      vpa: '+6581234567',
      name: 'Tan Wei',
      currency: 'SGD',
      country: 'Singapore',
      rail: 'PAYNOW',
      bankName: 'DBS Bank Singapore',
      accountNumber: '**** **** 7731',
      balance: 11500.00,
      phone: '+6581234567',
      status: 'VERIFIED',
      mpinHash: '1234'
    },
    {
      id: 'acc_ae_001',
      vpa: 'AE290330000000000123456',
      name: 'Fatima Al-Mansoori',
      currency: 'AED',
      country: 'United Arab Emirates',
      rail: 'AANI',
      bankName: 'Emirates NBD',
      accountNumber: 'AE290330000000000123456',
      balance: 32000.00,
      phone: '+971501234567',
      status: 'VERIFIED',
      mpinHash: '1234'
    },
    // System Nostro & Clearing Accounts for double-entry balancing
    {
      id: 'sys_clearing_pool',
      vpa: 'system.clearing@nexus',
      name: 'Universal Settlement Clearing Pool',
      currency: 'MULTI',
      country: 'GLOBAL',
      rail: 'SWITCH',
      bankName: 'Nexus Global Settlement Pool',
      accountNumber: 'SYS-CLEARING-001',
      balance: 10000000.00,
      status: 'SYSTEM'
    },
    {
      id: 'sys_fee_revenue',
      vpa: 'system.revenue@nexus',
      name: 'Universal Switch Fee Revenue',
      currency: 'MULTI',
      country: 'GLOBAL',
      rail: 'SWITCH',
      bankName: 'Nexus Revenue Reserve',
      accountNumber: 'SYS-REV-001',
      balance: 0.00,
      status: 'SYSTEM'
    }
  ],
  quotes: [],
  transactions: [],
  ledgerEntries: []
};

class Database {
  constructor() {
    this.data = null;
    this.init();
  }

  init() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        this.data = JSON.parse(raw);
      } catch (err) {
        console.warn('Corrupt ledger store file found, resetting to default seed data:', err.message);
        this.reset();
      }
    } else {
      this.reset();
    }
  }

  reset() {
    this.data = JSON.parse(JSON.stringify(SEED_DATA));
    this.persist();
  }

  persist() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error persisting ledger data:', err);
    }
  }

  // Account queries
  getAccounts() {
    return this.data.accounts;
  }

  getAccountById(id) {
    return this.data.accounts.find(a => a.id === id);
  }

  findAccountByVpaOrPhone(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();
    return this.data.accounts.find(a => 
      a.vpa.toLowerCase() === clean || 
      (a.phone && a.phone.replace(/[\s\-\+]/g, '') === clean.replace(/[\s\-\+]/g, '')) ||
      (a.accountNumber && a.accountNumber.toLowerCase().includes(clean))
    );
  }

  updateAccountBalance(accountId, delta) {
    const acc = this.getAccountById(accountId);
    if (!acc) throw new Error(`Account ${accountId} not found`);
    acc.balance = parseFloat((acc.balance + delta).toFixed(2));
    this.persist();
    return acc.balance;
  }

  // Quotes
  saveQuote(quote) {
    this.data.quotes.push(quote);
    this.persist();
    return quote;
  }

  getQuote(quoteId) {
    return this.data.quotes.find(q => q.quoteId === quoteId);
  }

  // Transactions
  saveTransaction(tx) {
    const existingIndex = this.data.transactions.findIndex(t => t.id === tx.id);
    if (existingIndex >= 0) {
      this.data.transactions[existingIndex] = tx;
    } else {
      this.data.transactions.unshift(tx); // newest first
    }
    this.persist();
    return tx;
  }

  getTransaction(id) {
    return this.data.transactions.find(t => t.id === id);
  }

  getTransactionByIdempotencyKey(key) {
    if (!key) return null;
    return this.data.transactions.find(t => t.idempotencyKey === key);
  }

  getTransactions(limit = 50) {
    return this.data.transactions.slice(0, limit);
  }

  // Double-Entry Ledger Entries
  addLedgerEntry(entry) {
    this.data.ledgerEntries.unshift({
      id: 'ledg_' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      ...entry
    });
    this.persist();
  }

  getLedgerEntries(limit = 100) {
    return this.data.ledgerEntries.slice(0, limit);
  }
}

module.exports = new Database();

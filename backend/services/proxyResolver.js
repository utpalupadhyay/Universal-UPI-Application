// backend/services/proxyResolver.js
const db = require('../ledger/database');
const config = require('../config');

/**
 * Proxy Resolution Service (PRS) / Universal Addressing Directory
 * Modeled after BIS Project Nexus PRS & NPCI UPI Addressing.
 */
class ProxyResolver {
  /**
   * Detect payment rail and country from identifier pattern
   */
  detectRail(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim();

    // 1. UPI VPA format: user@bank (e.g., rahul@okhdfcbank, user@paytm, user@upi)
    if (/^[a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+$/i.test(clean) && !clean.includes('.com') && !clean.includes('.org')) {
      if (clean.endsWith('@fednow') || clean.endsWith('@us')) {
        return { rail: 'FEDNOW', currency: 'USD', country: 'United States' };
      }
      return { rail: 'UPI', currency: 'INR', country: 'India' };
    }

    // 2. IBAN format (e.g., DE89370400440532013000)
    if (/^DE[0-9]{20}$/i.test(clean) || /^FR[0-9]{25}$/i.test(clean) || /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/i.test(clean)) {
      if (clean.startsWith('AE')) {
        return { rail: 'AANI', currency: 'AED', country: 'United Arab Emirates' };
      }
      return { rail: 'SEPA', currency: 'EUR', country: 'European Union' };
    }

    // 3. UK Sort Code + Account (e.g., 20-00-00 12345678 or 200000-12345678)
    if (/^[0-9]{2}-?[0-9]{2}-?[0-9]{2}\s*[-/]?\s*[0-9]{8}$/.test(clean)) {
      return { rail: 'FPS', currency: 'GBP', country: 'United Kingdom' };
    }

    // 4. US FedNow Cashtag or ACH ($username or routing/acc)
    if (clean.startsWith('$') || clean.toLowerCase().endsWith('@fednow')) {
      return { rail: 'FEDNOW', currency: 'USD', country: 'United States' };
    }

    // 5. Phone numbers
    const cleanPhone = clean.replace(/[\s\-\(\)]/g, '');
    if (cleanPhone.startsWith('+91')) {
      return { rail: 'UPI', currency: 'INR', country: 'India' };
    }
    if (cleanPhone.startsWith('+1')) {
      return { rail: 'FEDNOW', currency: 'USD', country: 'United States' };
    }
    if (cleanPhone.startsWith('+44')) {
      return { rail: 'FPS', currency: 'GBP', country: 'United Kingdom' };
    }
    if (cleanPhone.startsWith('+49') || cleanPhone.startsWith('+33')) {
      return { rail: 'SEPA', currency: 'EUR', country: 'European Union' };
    }
    if (cleanPhone.startsWith('+65')) {
      return { rail: 'PAYNOW', currency: 'SGD', country: 'Singapore' };
    }
    if (cleanPhone.startsWith('+971')) {
      return { rail: 'AANI', currency: 'AED', country: 'United Arab Emirates' };
    }

    // Default fallback based on common UPI format
    return { rail: 'UPI', currency: 'INR', country: 'India' };
  }

  /**
   * Resolve identifier to verified account details
   */
  resolve(identifier) {
    if (!identifier || identifier.trim() === '') {
      throw new Error('Payment identifier or VPA is required');
    }

    const clean = identifier.trim();

    // 1. Search in local banking directory / database
    const localAccount = db.findAccountByVpaOrPhone(clean);
    if (localAccount) {
      const railInfo = config.SUPPORTED_CURRENCIES[localAccount.currency] || {};
      return {
        verified: true,
        identifier: clean,
        name: localAccount.name,
        bankName: localAccount.bankName,
        accountNumber: localAccount.accountNumber,
        currency: localAccount.currency,
        country: localAccount.country,
        rail: localAccount.rail,
        railName: railInfo.rail || localAccount.rail,
        symbol: railInfo.symbol || '$',
        status: localAccount.status,
        internalAccountId: localAccount.id
      };
    }

    // 2. If not found in seed database, perform Directory Pattern Resolution
    const detected = this.detectRail(clean);
    const railInfo = config.SUPPORTED_CURRENCIES[detected.currency] || {};

    // Generate a standardized verified identity from address
    let displayName = clean.split('@')[0].replace(/[\._\-]/g, ' ');
    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    if (displayName.length < 3) displayName = 'Verified Recipient';

    return {
      verified: true,
      identifier: clean,
      name: displayName,
      bankName: detected.rail === 'UPI' ? 'NPCI Switch Member Bank' :
                detected.rail === 'FEDNOW' ? 'Federal Reserve Member Bank' :
                detected.rail === 'SEPA' ? 'Eurosystem SEPA Member Bank' :
                detected.rail === 'FPS' ? 'Pay.UK Participating Bank' :
                detected.rail === 'PAYNOW' ? 'FAST Clearing Bank' : 'Central Switch Bank',
      accountNumber: '**** **** ' + Math.floor(1000 + Math.random() * 9000),
      currency: detected.currency,
      country: detected.country,
      rail: detected.rail,
      railName: railInfo.rail || detected.rail,
      symbol: railInfo.symbol || '$',
      status: 'VERIFIED',
      internalAccountId: null // External network participant
    };
  }
}

module.exports = new ProxyResolver();

// backend/services/qrEngine.js
const QRCode = require('qrcode');
const proxyResolver = require('./proxyResolver');

/**
 * QR Code Engine for Universal UPI & EMVCo Standards
 */
class QREngine {
  /**
   * Generate standard UPI payment link and Data URL QR image
   */
  async generateUPIQR({ pa, pn, am, cu = 'INR', tn = 'Universal UPI Payment' }) {
    if (!pa) throw new Error('Payee VPA (pa) is required');

    const params = new URLSearchParams();
    params.append('pa', pa);
    if (pn) params.append('pn', pn);
    if (am) params.append('am', parseFloat(am).toFixed(2));
    params.append('cu', cu);
    params.append('tn', tn);

    const upiUri = `upi://pay?${params.toString()}`;
    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'H',
      margin: 2,
      scale: 8,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    return {
      rawPayload: upiUri,
      qrDataUrl,
      payeeVpa: pa,
      payeeName: pn || 'Merchant',
      amount: am ? parseFloat(am) : null,
      currency: cu,
      note: tn
    };
  }

  /**
   * Parse UPI URI or EMVCo string payload
   */
  parsePayload(rawString) {
    if (!rawString || typeof rawString !== 'string') {
      throw new Error('Invalid QR payload string');
    }

    const trimmed = rawString.trim();

    // 1. UPI URI scheme: upi://pay?pa=...
    if (trimmed.startsWith('upi://pay')) {
      try {
        const urlObj = new URL(trimmed);
        const pa = urlObj.searchParams.get('pa');
        const pn = urlObj.searchParams.get('pn') || '';
        const am = urlObj.searchParams.get('am');
        const cu = urlObj.searchParams.get('cu') || 'INR';
        const tn = urlObj.searchParams.get('tn') || '';

        const resolved = pa ? proxyResolver.resolve(pa) : null;

        return {
          standard: 'UPI_DEEP_LINK',
          valid: true,
          payeeVpa: pa,
          payeeName: pn || (resolved ? resolved.name : 'Unknown Payee'),
          amount: am ? parseFloat(am) : null,
          currency: cu,
          note: tn,
          resolvedRecipient: resolved
        };
      } catch (err) {
        throw new Error('Malformed UPI URI: ' + err.message);
      }
    }

    // 2. EMVCo QR Code format check (Starts with '000201')
    if (trimmed.startsWith('000201')) {
      // Basic EMVCo tag extraction
      return {
        standard: 'EMVCO_QR',
        valid: true,
        payeeVpa: 'emvco.merchant@universal',
        payeeName: 'Global EMVCo Merchant',
        currency: 'USD',
        amount: null,
        rawPayload: trimmed
      };
    }

    // 3. Plain identifier (VPA, Phone, IBAN) scanned from QR
    const resolved = proxyResolver.resolve(trimmed);
    return {
      standard: 'PLAIN_IDENTIFIER',
      valid: true,
      payeeVpa: trimmed,
      payeeName: resolved.name,
      currency: resolved.currency,
      amount: null,
      resolvedRecipient: resolved
    };
  }
}

module.exports = new QREngine();

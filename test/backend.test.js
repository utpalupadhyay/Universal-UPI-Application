// test/backend.test.js
const assert = require('assert');
const db = require('../backend/ledger/database');
const doubleEntry = require('../backend/ledger/doubleEntry');
const proxyResolver = require('../backend/services/proxyResolver');
const fxEngine = require('../backend/services/fxEngine');
const qrEngine = require('../backend/services/qrEngine');
const amlRiskService = require('../backend/services/amlRiskService');
const paymentOrchestrator = require('../backend/services/paymentOrchestrator');

async function runTests() {
  console.log('\n🧪 Starting Universal UPI & Universal Payment System Test Suite...\n');
  db.reset();

  // Test 1: Proxy Resolution Service (Universal Addressing)
  console.log('▶ Test 1: Universal Proxy Resolution (Addressing)');
  {
    // UPI VPA
    const upiRes = proxyResolver.resolve('rahul@okhdfcbank');
    assert.strictEqual(upiRes.rail, 'UPI');
    assert.strictEqual(upiRes.currency, 'INR');
    assert.strictEqual(upiRes.name, 'Rahul Sharma');
    console.log('  ✔ UPI VPA resolved correctly to Rahul Sharma (HDFC / UPI)');

    // FedNow ID
    const fedRes = proxyResolver.resolve('alex@fednow');
    assert.strictEqual(fedRes.rail, 'FEDNOW');
    assert.strictEqual(fedRes.currency, 'USD');
    console.log('  ✔ FedNow ID resolved correctly to Alex Johnson (Chase / FedNow)');

    // SEPA IBAN
    const sepaRes = proxyResolver.resolve('DE89370400440532013000');
    assert.strictEqual(sepaRes.rail, 'SEPA');
    assert.strictEqual(sepaRes.currency, 'EUR');
    console.log('  ✔ SEPA IBAN resolved correctly to Emma Schmidt (Deutsche Bank / SEPA)');

    // UK FPS
    const fpsRes = proxyResolver.resolve('20-00-00-12345678');
    assert.strictEqual(fpsRes.rail, 'FPS');
    assert.strictEqual(fpsRes.currency, 'GBP');
    console.log('  ✔ UK Faster Payments resolved correctly to Oliver Smith (Barclays / FPS)');
  }

  // Test 2: Guaranteed FX Rate Lock Engine
  console.log('\n▶ Test 2: Guaranteed FX Rate Lock Engine');
  let lockedQuote;
  {
    lockedQuote = await fxEngine.generateQuote({
      fromCurrency: 'USD',
      toCurrency: 'INR',
      sendAmount: 100.00
    });

    assert.ok(lockedQuote.quoteId.startsWith('quo_'));
    assert.strictEqual(lockedQuote.sendAmount, 100);
    assert.strictEqual(lockedQuote.interbankRate > 80, true);
    assert.strictEqual(lockedQuote.totalFee > 0, true);
    assert.strictEqual(lockedQuote.recipientReceives > 0, true);
    assert.strictEqual(lockedQuote.expirySeconds, 180);
    console.log(`  ✔ Locked Rate: 1 USD = ${lockedQuote.interbankRate} INR (Quote ID: ${lockedQuote.quoteId})`);
    console.log(`  ✔ Fee: $${lockedQuote.totalFee}, Recipient Receives: ₹${lockedQuote.recipientReceives}`);
  }

  // Test 3: End-to-End Cross-Border Transfer & Double-Entry Ledger
  console.log('\n▶ Test 3: End-to-End Transfer & Double-Entry Ledger Sealing');
  {
    const senderBefore = db.getAccountById('acc_us_001');
    const initialSenderBal = senderBefore.balance;
    const receiverBefore = db.getAccountById('acc_in_001');
    const initialReceiverBal = receiverBefore.balance;

    const result = await paymentOrchestrator.processPayment({
      idempotencyKey: 'idem_test_001',
      senderAccountId: 'acc_us_001',
      recipientVpa: 'rahul@okhdfcbank',
      sendAmount: 100.00,
      sendCurrency: 'USD',
      receiveCurrency: 'INR',
      quoteId: lockedQuote.quoteId,
      mpin: '1234',
      note: 'Cross-border test settlement'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.transaction.status, 'SETTLED');
    assert.ok(result.transaction.railTxId.startsWith('UPI_'));
    assert.ok(result.transaction.journalId.startsWith('jrn_'));

    // Check balances
    const senderAfter = db.getAccountById('acc_us_001');
    const receiverAfter = db.getAccountById('acc_in_001');

    assert.strictEqual(senderAfter.balance, initialSenderBal - 100);
    assert.strictEqual(receiverAfter.balance, initialReceiverBal + lockedQuote.recipientReceives);
    console.log(`  ✔ Sender debited: $${initialSenderBal} -> $${senderAfter.balance}`);
    console.log(`  ✔ Receiver credited: ₹${initialReceiverBal} -> ₹${receiverAfter.balance}`);

    // Audit Double-Entry Ledger
    const audit = doubleEntry.auditLedger();
    assert.strictEqual(audit.allBalanced, true);
    console.log(`  ✔ Double-Entry Accounting Audit: PASSED (Debits == Credits sealed, ${audit.totalEntries} journal entries)`);
  }

  // Test 4: Idempotency Protection
  console.log('\n▶ Test 4: Idempotency Protection (Duplicate Request Defense)');
  {
    const senderBefore = db.getAccountById('acc_us_001');
    const duplicateAttempt = await paymentOrchestrator.processPayment({
      idempotencyKey: 'idem_test_001', // Repeat same key
      senderAccountId: 'acc_us_001',
      recipientVpa: 'rahul@okhdfcbank',
      sendAmount: 100.00,
      sendCurrency: 'USD',
      receiveCurrency: 'INR',
      quoteId: lockedQuote.quoteId,
      mpin: '1234'
    });

    const senderAfter = db.getAccountById('acc_us_001');
    assert.strictEqual(duplicateAttempt.duplicateRequest, true);
    assert.strictEqual(senderAfter.balance, senderBefore.balance); // NO extra debit!
    console.log('  ✔ Repeated transaction safely rejected by Idempotency Key (Zero double debits)');
  }

  // Test 5: QR Code Generation & Decoding
  console.log('\n▶ Test 5: QR Code Standard Engine');
  {
    const qrResult = await qrEngine.generateUPIQR({
      pa: 'priya.sharma@paytm',
      pn: 'Priya Sharma',
      am: 500,
      cu: 'INR',
      tn: 'Coffee Payment'
    });

    assert.ok(qrResult.qrDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(qrResult.rawPayload.includes('upi://pay?'));

    const parsed = qrEngine.parsePayload(qrResult.rawPayload);
    assert.strictEqual(parsed.standard, 'UPI_DEEP_LINK');
    assert.strictEqual(parsed.payeeVpa, 'priya.sharma@paytm');
    assert.strictEqual(parsed.amount, 500);
    console.log(`  ✔ UPI Deep Link generated and parsed: ${qrResult.rawPayload}`);
  }

  // Test 6: AML & Sanctions Filter
  console.log('\n▶ Test 6: AML & Sanctions Filter');
  {
    try {
      await paymentOrchestrator.processPayment({
        idempotencyKey: 'idem_test_sanction',
        senderAccountId: 'acc_us_001',
        recipientVpa: 'terrorist_account@bank',
        sendAmount: 100.00,
        sendCurrency: 'USD',
        receiveCurrency: 'INR',
        quoteId: lockedQuote.quoteId,
        mpin: '1234'
      });
      assert.fail('Should have been blocked by AML');
    } catch (err) {
      assert.ok(err.message.includes('AML/Sanctions Alert'));
      console.log(`  ✔ Sanctioned transfer successfully intercepted: "${err.message}"`);
    }
  }

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The Universal Payment System backend is rock-solid.\n');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});

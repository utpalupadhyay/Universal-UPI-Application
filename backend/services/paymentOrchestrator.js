const crypto = require('crypto');
const db = require('../ledger/database');
const doubleEntry = require('../ledger/doubleEntry');
const fxEngine = require('./fxEngine');
const proxyResolver = require('./proxyResolver');
const amlRiskService = require('./amlRiskService');
const { getRailAdapter } = require('./rails/railFactory');

class PaymentOrchestrator {
  constructor() {
    this.wsBroadcaster = null;
  }

  setWebSocketBroadcaster(fn) {
    this.wsBroadcaster = fn;
  }

  emitUpdate(stepData) {
    if (this.wsBroadcaster) {
      this.wsBroadcaster(stepData);
    }
  }

  /**
   * Execute End-to-End Cross-Border Transfer
   */
  async processPayment({
    idempotencyKey,
    senderAccountId,
    recipientVpa,
    sendAmount,
    sendCurrency,
    receiveCurrency,
    quoteId,
    mpin,
    note
  }) {
    // 1. Idempotency Check
    if (idempotencyKey) {
      const existing = db.getTransactionByIdempotencyKey(idempotencyKey);
      if (existing) {
        return {
          duplicateRequest: true,
          transaction: existing,
          message: 'Idempotent request: returning existing transaction record.'
        };
      }
    }

    const txId = 'tx_' + crypto.randomUUID().substr(0, 12);
    const amountNum = parseFloat(sendAmount);

    // 2. Validate Sender Account
    const sender = db.getAccountById(senderAccountId || 'acc_us_001'); // default to demo USD sender if not specified
    if (!sender) {
      throw new Error(`Sender account ${senderAccountId} not found`);
    }

    if (sender.currency !== sendCurrency) {
      throw new Error(`Sender account currency (${sender.currency}) does not match transfer currency (${sendCurrency})`);
    }

    // 3. Verify MPIN (Default demo MPIN is 1234)
    if (mpin && sender.mpinHash && mpin !== sender.mpinHash) {
      throw new Error('Invalid Security MPIN. Transfer rejected.');
    }

    // 4. Validate FX Quote
    const quote = fxEngine.validateQuote(quoteId, sendCurrency, receiveCurrency, amountNum);

    // 5. Check Balance
    if (sender.balance < amountNum) {
      throw new Error(`Insufficient funds: Balance is ${sender.balance} ${sendCurrency}, required ${amountNum} ${sendCurrency}`);
    }

    // 6. Resolve Recipient VPA
    const recipient = proxyResolver.resolve(recipientVpa);

    // Create In-flight Transaction record
    let txRecord = {
      id: txId,
      idempotencyKey: idempotencyKey || txId,
      sender: {
        id: sender.id,
        name: sender.name,
        currency: sender.currency,
        bankName: sender.bankName,
        vpa: sender.vpa
      },
      recipient: {
        vpa: recipient.identifier,
        name: recipient.name,
        bankName: recipient.bankName,
        currency: recipient.currency,
        rail: recipient.rail,
        railName: recipient.railName
      },
      quote: {
        quoteId: quote.quoteId,
        rate: quote.interbankRate,
        fee: quote.totalFee,
        netAmount: quote.netAmount,
        recipientReceives: quote.recipientReceives
      },
      sendAmount: amountNum,
      sendCurrency,
      receivedAmount: quote.recipientReceives,
      receiveCurrency,
      feeAmount: quote.totalFee,
      note: note || 'Universal UPI Transfer',
      status: 'INITIATED',
      stages: [
        { stage: 'INITIATED', timestamp: new Date().toISOString(), status: 'SUCCESS' }
      ],
      createdAt: new Date().toISOString()
    };

    db.saveTransaction(txRecord);
    this.emitUpdate({ type: 'TX_STAGE', txId, stage: 'INITIATED' });

    try {
      // 7. AML & Compliance Screening
      const amlResult = amlRiskService.screenTransaction({
        senderAccount: sender,
        recipientName: recipient.name,
        recipientVpa: recipient.identifier,
        amount: amountNum,
        currency: sendCurrency
      });

      if (!amlResult.passed) {
        throw new Error(`AML/Sanctions Alert: ${amlResult.reason}`);
      }

      txRecord.stages.push({
        stage: 'COMPLIANCE_SCREENED',
        timestamp: new Date().toISOString(),
        status: 'SUCCESS',
        riskScore: amlResult.riskScore
      });
      this.emitUpdate({ type: 'TX_STAGE', txId, stage: 'COMPLIANCE_SCREENED', riskScore: amlResult.riskScore });

      // 8. Execute Double-Entry Booking (Debit Sender, Credit Ledger Clearing Pool)
      txRecord.status = 'DEBITED';
      txRecord.stages.push({
        stage: 'DEBITED',
        timestamp: new Date().toISOString(),
        status: 'SUCCESS'
      });
      this.emitUpdate({ type: 'TX_STAGE', txId, stage: 'DEBITED' });

      // 9. Dispatch to Regional Payment Rail Adapter
      const adapter = getRailAdapter(recipient.rail);
      const railResult = await adapter.executeSettlement({
        recipientVpa: recipient.identifier,
        recipientName: recipient.name,
        amount: quote.recipientReceives,
        currency: receiveCurrency,
        referenceNote: txId
      });

      txRecord.stages.push({
        stage: 'RAIL_SETTLED',
        timestamp: new Date().toISOString(),
        status: 'SUCCESS',
        railTxId: railResult.railTxId,
        railName: railResult.railName
      });
      this.emitUpdate({ type: 'TX_STAGE', txId, stage: 'RAIL_SETTLED', railTxId: railResult.railTxId });

      // 10. Record Final Balanced Journal Entries in Double-Entry Ledger
      const ledgerEntry = doubleEntry.recordTransfer({
        transactionId: txId,
        senderAccount: sender,
        receiverAccount: recipient.internalAccountId ? db.getAccountById(recipient.internalAccountId) : {
          id: 'ext_recipient_' + recipient.rail.toLowerCase(),
          name: recipient.name,
          vpa: recipient.identifier
        },
        sendAmount: amountNum,
        sendCurrency,
        receivedAmount: quote.recipientReceives,
        receiveCurrency,
        feeAmount: quote.totalFee,
        feeCurrency: sendCurrency
      });

      // 11. Mark Transaction Fully SETTLED
      txRecord.status = 'SETTLED';
      txRecord.railTxId = railResult.railTxId;
      txRecord.journalId = ledgerEntry.journalId;
      txRecord.settledAt = new Date().toISOString();
      txRecord.stages.push({
        stage: 'COMPLETED',
        timestamp: new Date().toISOString(),
        status: 'SUCCESS'
      });

      db.saveTransaction(txRecord);
      this.emitUpdate({ type: 'TX_COMPLETED', transaction: txRecord });

      return {
        success: true,
        transaction: txRecord
      };

    } catch (err) {
      // Compensating rollback if debited
      txRecord.status = 'FAILED';
      txRecord.failureReason = err.message;
      txRecord.stages.push({
        stage: 'FAILED',
        timestamp: new Date().toISOString(),
        reason: err.message
      });

      db.saveTransaction(txRecord);
      this.emitUpdate({ type: 'TX_FAILED', txId, reason: err.message });
      throw err;
    }
  }
}

module.exports = new PaymentOrchestrator();

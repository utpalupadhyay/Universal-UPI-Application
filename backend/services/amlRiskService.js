// backend/services/amlRiskService.js

/**
 * AML (Anti-Money Laundering), Sanctions & Fraud Risk Scoring Service
 * Real-time automated transaction screening.
 */
class AMLRiskService {
  constructor() {
    // Known blocked entities/keywords for sanctions demo
    this.sanctionKeywords = ['sanctioned', 'blocked_entity', 'illicit', 'terrorist'];
    this.recentTransactions = [];
  }

  screenTransaction({ senderAccount, recipientName, recipientVpa, amount, currency }) {
    const riskReasons = [];
    let riskScore = 10; // Base low risk

    // 1. Sanctions Screening
    const checkString = `${recipientName} ${recipientVpa}`.toLowerCase();
    const isSanctioned = this.sanctionKeywords.some(kw => checkString.includes(kw));
    if (isSanctioned) {
      return {
        passed: false,
        riskScore: 100,
        decision: 'BLOCKED_SANCTIONS',
        reason: 'Recipient triggered international compliance and sanctions blacklist filter.'
      };
    }

    // 2. High-Value Alert Check
    const convertedToUsd = currency === 'INR' ? amount / 83.5 :
                           currency === 'EUR' ? amount / 0.92 :
                           currency === 'GBP' ? amount / 0.78 : amount;

    if (convertedToUsd > 10000) {
      riskScore += 40;
      riskReasons.push('Transaction exceeds CTR (Currency Transaction Report) threshold of $10,000 USD equivalent.');
    }

    // 3. Velocity / Burst Check (more than 5 transfers in 1 minute)
    const oneMinuteAgo = Date.now() - 60000;
    const recentFromSender = this.recentTransactions.filter(
      t => t.senderId === senderAccount.id && t.time > oneMinuteAgo
    );

    if (recentFromSender.length >= 5) {
      return {
        passed: false,
        riskScore: 90,
        decision: 'BLOCKED_VELOCITY',
        reason: 'Rate limit exceeded: Unusual burst of transactions detected. Please wait before retrying.'
      };
    }

    this.recentTransactions.push({
      senderId: senderAccount.id,
      time: Date.now()
    });

    // Cleanup old records
    if (this.recentTransactions.length > 500) {
      this.recentTransactions = this.recentTransactions.filter(t => t.time > oneMinuteAgo);
    }

    return {
      passed: true,
      riskScore,
      decision: riskScore > 60 ? 'REVIEW_FLAGGED' : 'APPROVED',
      reasons: riskReasons,
      screenedAt: new Date().toISOString()
    };
  }
}

module.exports = new AMLRiskService();

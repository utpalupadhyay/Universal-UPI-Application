// backend/services/rails/railFactory.js

class BaseRailAdapter {
  constructor(railCode, railName) {
    this.railCode = railCode;
    this.railName = railName;
  }

  async executeSettlement({ recipientVpa, recipientName, amount, currency, referenceNote }) {
    // Simulate real switch network latency (300ms - 800ms)
    await new Promise(resolve => setTimeout(resolve, 400));

    const railTxId = this.railCode + '_' + Math.random().toString(36).substr(2, 9).toUpperCase();
    return {
      success: true,
      railCode: this.railCode,
      railName: this.railName,
      railTxId,
      iso20022Code: 'pacs.008.001.08',
      settledAt: new Date().toISOString(),
      recipientVpa,
      amount,
      currency,
      status: 'SETTLED'
    };
  }
}

class UPIAdapter extends BaseRailAdapter {
  constructor() {
    super('UPI', 'Unified Payments Interface (NPCI India)');
  }
}

class FedNowAdapter extends BaseRailAdapter {
  constructor() {
    super('FEDNOW', 'FedNow / RTP Instant Service (USA)');
  }
}

class SEPAAdapter extends BaseRailAdapter {
  constructor() {
    super('SEPA', 'SEPA Instant Credit Transfer (Europe)');
  }
}

class FPSAdapter extends BaseRailAdapter {
  constructor() {
    super('FPS', 'Faster Payments Service (UK Pay.UK)');
  }
}

class PayNowAdapter extends BaseRailAdapter {
  constructor() {
    super('PAYNOW', 'PayNow FAST Network (Singapore)');
  }
}

class AaniAdapter extends BaseRailAdapter {
  constructor() {
    super('AANI', 'Aani Instant Payment Platform (UAE)');
  }
}

const adapters = {
  UPI: new UPIAdapter(),
  FEDNOW: new FedNowAdapter(),
  SEPA: new SEPAAdapter(),
  FPS: new FPSAdapter(),
  PAYNOW: new PayNowAdapter(),
  AANI: new AaniAdapter()
};

module.exports = {
  getRailAdapter(railCode) {
    return adapters[railCode] || adapters['UPI'];
  }
};

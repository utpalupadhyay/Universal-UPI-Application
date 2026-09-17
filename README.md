# Universal UPI & Global Payment System (Nexus Core)

A production-grade, interoperable cross-border payment gateway and backend engine modeled after the **Bank for International Settlements (BIS) Project Nexus**, **NPCI UPI International**, **Federal Reserve FedNow**, and **European SEPA Instant**.

![Universal UPI Architecture](https://img.shields.io/badge/Architecture-Double--Entry%20Ledger-blue)
![Status](https://img.shields.io/badge/Status-Operational-brightgreen)
![Tests](https://img.shields.io/badge/Tests-Passing-success)

---

## 🌟 Architecture & Core Systems

```
                      [ Client Web / Mobile UI ]
                                  │
                                  ▼ (HTTP REST / WebSocket)
                 [ Universal UPI API Gateway :4000 ]
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      ▼                           ▼                           ▼
[Proxy Resolver]          [AML & Risk Filter]        [FX Quote Engine]
(VPA/IBAN/FedNow/FPS)     (Sanctions & Limits)       (Guaranteed Rate Lock)
      │                           │                           │
      └───────────────────────────┼───────────────────────────┘
                                  ▼
           [ Core Transaction Orchestrator & State Machine ]
                                  │
      ┌───────────────────────────┴───────────────────────────┐
      ▼                                                       ▼
[Multi-Rail Settlement Router]               [Financial Double-Entry Ledger]
 ├── 🇮🇳 UPI / IMPS (NPCI)                     ├── Debits == Credits Guaranteed
 ├── 🇺🇸 FedNow / RTP (Fed)                    ├── ACID Journaling
 ├── 🇪🇺 SEPA Instant (Eurosystem)             └── Idempotency Guard
 ├── 🇬🇧 Faster Payments (Pay.UK)
 ├── 🇸🇬 PayNow (FAST Singapore)
 └── 🇦🇪 Aani (Central Bank UAE)
```

---

## 🚀 Key Features

### 1. Universal Proxy Resolution Service (PRS)
Resolves any regional address format into a verified beneficiary bank profile:
- 🇮🇳 **UPI ID / VPA**: `rahul@okhdfcbank`, `priya.sharma@paytm`
- 🇺🇸 **FedNow / ACH / Cashtag**: `alex@fednow`, `$sarah.merch`
- 🇪🇺 **SEPA IBAN**: `DE89370400440532013000`
- 🇬🇧 **UK Faster Payments**: `20-00-00-12345678`
- 🇸🇬 **PayNow**: `+6581234567`
- 🇦🇪 **Aani**: `AE290330000000000123456`

### 2. Guaranteed FX Rate Lock Engine
- Eliminates currency volatility during authorization with a **3-minute guaranteed rate lock window**.
- Transparent fee calculation: Interbank rate, 0.75% network switch fee, and exact recipient payout.

### 3. Financial Double-Entry Accounting Ledger
- **Debits = Credits**: No money is ever created or lost.
- **Idempotency Guard**: Repeated clicks or retries with identical `Idempotency-Key` headers never double-charge.
- Audit explorer endpoint (`/api/v1/ledger`) provides complete ledger validation.

### 4. Interactive Stage-by-Stage Routing Pipeline
Visualizes each phase of the settlement process in real-time via WebSockets:
1. **AML / Sanctions Screening**
2. **Guaranteed FX Rate Locked**
3. **Sender Account Debited**
4. **Downstream Rail Settlement** (`UPI`, `FedNow`, `SEPA`, `FPS`)
5. **Double-Entry Ledger Sealed**

### 5. Standards-Compliant QR Code Engine
- Parses and generates standard **UPI Deep Links** (`upi://pay?pa=...&am=...`).
- Built-in camera scanner & image file decoder.
- Universal QR generator for merchants and personal addresses.

---

## 🏃 Getting Started

### Prerequisites
- Node.js (v18+)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Automated Test Suite
```bash
npm test
```
Runs 6 automated integration tests covering proxy resolution, quote locks, double-entry ledger balance, idempotency protection, QR parsing, and AML screening.

### 3. Start the Server
```bash
npm start
```
- Web Application: `http://localhost:4000`
- WebSocket Gateway: `ws://localhost:4000/ws`
- Health Endpoint: `http://localhost:4000/api/health`

---

## 📡 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/config` | `GET` | Get supported currencies, fee schedules, and rail limits |
| `/api/v1/accounts` | `GET` | Get demo user accounts and live balances |
| `/api/v1/resolve-address` | `POST` | Resolve any VPA, IBAN, Phone, or Cashtag |
| `/api/v1/quotes` | `POST` | Generate guaranteed 3-minute FX quote lock |
| `/api/v1/transfers` | `POST` | Authorize transfer with MPIN and idempotency key |
| `/api/v1/transfers` | `GET` | Fetch transaction history |
| `/api/v1/qr/generate` | `POST` | Generate dynamic UPI / EMVCo QR code Data URL |
| `/api/v1/qr/parse` | `POST` | Parse scanned QR code payload |
| `/api/v1/ledger` | `GET` | View balanced double-entry ledger audit entries |
| `/api/v1/reset` | `POST` | Reset ledger to initial seed state |

---

## 🔐 Security & Testing MPIN
For all demo accounts, the default Security MPIN is **`1234`**.

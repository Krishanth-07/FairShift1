# FairShift 🛡️

> **A worker-first workplace trust platform for UN SDG 8 (Decent Work and Economic Growth).**

FairShift bridges the transparency, safety, and trust gap between frontline workers and employers in shift-intensive industries. Built with a verified, two-sided work record and an explainable decision engine, FairShift guarantees that workers can prove hours worked, report safety hazards with zero retaliation risk, and access portable credentials.

---

## 🌟 Key Capabilities

1. **Tamper-Evident Shift Receipts**: Individual append-only SHA-256 hash chains per worker with HMAC-SHA256 digital receipts.
2. **Rotating Physical Site Codes**: Time-windowed TOTP-style codes linking punches to job sites without requiring active client internet.
3. **Pure Function Decision Engine**: Deterministic calculations for hours, overtime, and fatigue rules returning structured explainable reason codes.
4. **Offline Batch Synchronization**: Up to 50 punches sorted chronologically with per-item idempotency.
5. **Privacy-Preserving Hazard Reporting**: Anonymous hazard reporting with unambiguous alphanumeric tracking codes (`FS-XXXX-XXXX`) and zero stored worker metadata.
6. **k-Anonymous Sentiment Pulse**: Feedback aggregation requiring a minimum group size of 5 before disclosing sentiment, protected by unlinkable monthly rate markers.
7. **Cross-Sector Support from Single Core**: Configurable profiles for **Construction** (heat safety thresholds, daily caps) and **Hospital** (round-the-clock rotations, night shift fatigue limits).

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────┐
│               Frontline Dual Interfaces                │
│       Worker Web App        │      Employer Dashboard  │
└───────────────┬────────────────────────────┬───────────┘
                │ HTTP / REST                │
┌───────────────▼────────────────────────────▼───────────┐
│               Security & Transport Layer               │
│ Helmet CSP • 20kb Limit • Rate Limiters • CSRF Header │
└───────────────────────────────┬────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────┐
│                   Express API Routing                  │
│   /api/auth   │   /api/records   │   /api/admin/overview│
└───────────────┬────────────────────────────┬───────────┘
                │                            │
┌───────────────▼──────────────┐ ┌───────────▼───────────┐
│        Service Layer         │ │ Pure Decision Engine  │
│ recordService  payslipService│ │ hours.js      pay.js  │
│ reportService  adviceService │ │ fatigue.js  chain.js  │
│ feedbackService adminService │ │ anomaly.js risk.js    │
└───────────────┬──────────────┘ └───────────┬───────────┘
                │                            │
┌───────────────▼────────────────────────────▼───────────┐
│                  In-Memory Repository                  │
│   (Swap with Firestore / PostgreSQL in Production)     │
└────────────────────────────────────────────────────────┘
```

---

## 🔌 API Route Reference

All endpoints return JSON and enforce strict schema validation, rejecting unexpected parameters with HTTP 400.

### Public Transparency
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/healthz` | System health check and server timestamp. |
| `GET` | `/api/public/what-we-store` | Machine-readable transparency specification detailing stored vs forbidden fields. |

### Authentication
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | None | Authenticates worker/admin with userId and 4-8 digit PIN. Sets httpOnly `fs_session` cookie. |
| `POST` | `/api/auth/logout` | Session | Clears session cookie. Requires `X-Requested-With: fairshift`. |
| `GET` | `/api/auth/me` | Session | Returns authenticated profile (omits PIN hash/salt). |
| `POST` | `/api/auth/demo-login` | Demo | Instant login for demo users. Available only when `DEMO_MODE=true`. |

### Worker Self-Service (`role: worker`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/records` | Records a shift check-in or check-out with rotating site code. |
| `POST` | `/api/records/sync` | Synchronizes up to 50 offline punches chronologically. |
| `GET` | `/api/me/status` | Current active session, punch count, and recent records. |
| `GET` | `/api/me/payslip?period=YYYY-MM` | Itemized monthly payslip with logged vs payroll reconciliation and audit trails. |
| `GET` | `/api/me/advice` | Synthesized advocate advisory prioritizing rest, pay, and hazards. |
| `POST` | `/api/reports` | Submits an anonymous hazard report. Stores zero worker identity. |
| `GET` | `/api/reports/:code` | Queries hazard report status by tracking code (`FS-XXXX-XXXX`). |
| `POST` | `/api/feedback` | Submits anonymous workplace sentiment (manager, policy, conditions). |
| `POST` | `/api/me/days/:date/dispute` | Formally flags a logged shift day as disputed. |

### Employer & Site Admin (`role: admin`, scoped to `req.user.siteId`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/overview` | 360-degree site dashboard: attendance, fatigue alerts, anomalies, reports, feedback. |
| `GET` | `/api/admin/site-code` | Retrieves active 5-minute rotating site code for worker check-ins. |
| `GET` | `/api/admin/reports` | Lists site hazard reports sorted by escalation status, severity, and age. |
| `PATCH` | `/api/admin/reports/:id` | Enforces linear status transition: `open -> acknowledged -> in_progress -> resolved`. |
| `PUT` | `/api/admin/payroll` | Modifies worker payroll hours and logs an auditable entry. |
| `POST` | `/api/admin/days/confirm` | Confirms a worker's logged shift day. |
| `POST` | `/api/admin/days/dispute` | Flags a worker's shift day as disputed. |
| `GET` | `/api/admin/integrity` | Cryptographically verifies hash chain continuity for all site workers. |

---

## 🔒 Security & Privacy Highlights

- **Secret Zero**: All secrets passed via environment variables with random cryptographic fallbacks during development.
- **Strict Content Security Policy (CSP)**: `default-src 'self'`, no inline scripts, no inline styles, no clickjacking (`frame-ancestors 'none'`).
- **CSRF Defense**: State-mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) strictly require `X-Requested-With: fairshift` header alongside `SameSite=Strict` cookies.
- **Constant-Time Verification**: `crypto.timingSafeEqual` used on PIN verification, HMAC receipts, session tokens, and site code comparisons to prevent timing side channels.
- **Rate Limiting**: Tiered IP-based limits (300/15m general, 10/15m login, 20/h reports, 10/h feedback).
- **Anti-Enumeration Login**: Identical error responses and simulated work duration for non-existent users and wrong PINs.
- **k-Anonymity (Group Size >= 5)**: Feedback aggregate analytics are suppressed until 5 or more distinct workers submit feedback at that site.
- **Payload Restrictions**: Strict 20kb JSON payload ceiling prevents buffer starvation and memory exhaustion.

---

## ⚖️ Honest Limitations & Design Trade-offs

1. **Tamper-Evident, Not Tamper-Proof**:
   FairShift's append-only hash chains make **any post-hoc data tampering immediately detectable** via `/api/admin/integrity` and cryptographic receipts. However, without external replication, an attacker with full root filesystem access could delete the entire store. In production, chain heads should be anchored to an external ledger or cloud storage write-once log.
2. **Illustrative Rule Defaults**:
   All numeric thresholds (e.g., 8h normal day, 12h rest interval, 3 consecutive nights) in configuration files are illustrative baselines designed for demonstration, not certified legal or occupational health advice.
3. **In-Memory Store**:
   The current repository uses an in-memory map suitable for containerized microservices and integration testing. In production, swap `src/repository/memoryRepository.js` with Google Cloud Firestore or PostgreSQL.
4. **Rule-Based Triage with AI Roadmap**:
   Current hazard report triage utilizes deterministic multilingual keyword matching across English, Tamil, and Hindi. While resilient against prompt injection, nuanced voice transcripts will benefit from Google Gemini SDK integration in production.

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20

### Setup
```bash
# Clone the repository
git clone <repo-url>
cd FairShift

# Copy environment variables
cp .env.example .env

# Install approved runtime dependencies
npm install

# Run automated test suite (163 tests)
npm test

# Launch development server
npm start
```

### Docker Deployment
```bash
# Build container image
docker build -t fairshift:latest .

# Run containerized service
docker run -p 8080:8080 -e DEMO_MODE=true fairshift:latest
```

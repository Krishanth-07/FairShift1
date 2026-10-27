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

## 🎭 How to Demo (Interactive 4-Step Walkthrough)

Start FairShift in demo mode (`DEMO_MODE=true npm start` or `node src/server.js` with `DEMO_MODE=true` in `.env`). In demo mode, one-click login cards appear on both the Worker App (`/worker/`) and Admin Dashboard (`/admin/`).

### Demo Credentials & Personas
- **Construction Worker**: `c_worker_1` (Rajesh Kumar) — Greenfield Tower Construction
- **Hospital Worker**: `h_worker_2` (Deepa Nair) — City General Hospital
- **Construction Admin**: `c_admin_1` (Priya Desai) — Greenfield Tower Construction
- **Hospital Admin**: `h_admin_1` (Vikram Reddy) — City General Hospital
- **Universal Demo PIN**: `4321` (or whatever `SEED_PIN` is configured)

---

### The 4-Step Verification Flow

#### Step 1: Explainable Worker Advocate & Underpaid Payslip
1. Open the **Worker App** at `http://localhost:8080/worker/`.
2. Click the quick-login card for **Rajesh Kumar** (`c_worker_1`).
3. Notice the **Worker Trust Advocate** card on the Home screen: it immediately surfaces an active **Pay Advisory: Unpaid Hours Detected** with structured reasons. Click the speaker icon to hear the advice read aloud in English/Hindi.
4. Navigate to the **Payslip** tab: a prominent alert highlights that logged shift hours exceed employer payroll records. Click **Dispute This Discrepancy** to submit a formal shift dispute.

#### Step 2: Frontline Check-In with Rotating Site Code & Offline Queue
1. Open the **Admin Dashboard** in a second window at `http://localhost:8080/admin/`.
2. Click **Priya Desai** (`c_admin_1`). View the **Active Rotating Site Code** card displaying a 6-digit TOTP code and live countdown.
3. In the Worker window, click the giant **Check In to Shift** button and enter the 6-digit code.
4. An instant verifiable digital receipt is issued with a SHA-256 record hash and HMAC signature.
5. *Offline Resilience*: Turn off Wi-Fi or set browser DevTools to Offline. Click punch again — shifts queue safely in local storage and synchronize automatically with per-item idempotency when connection restores.

#### Step 3: Anonymous Voice Hazard Reporting & Escalation SLA
1. In the Worker App, switch to the **Safety** tab.
2. Click **Speak Hazard (Voice)** or type a description (e.g., *"Large crack observed in support pillar"*).
3. Click **Submit Safety Report**: receives a private alphanumeric tracking code (`FS-XXXX-XXXX`). No worker identity is stored.
4. Switch to the Admin Dashboard: notice the **Escalated Hazards** metric and the red **Escalated (3h overdue)** badge for `report_critical_01`, which exceeded its 2-hour critical SLA.
5. In the Reports table, select the status dropdown to transition the report (`open → acknowledged → in_progress → resolved`).

#### Step 4: k-Anonymity Pulse Feedback & Zero-Surveillance Guarantee
1. In the Construction Admin view (`c_admin_1`), look at the **Anonymous Worker Voice** panel: notice it displays *"Not enough responses to protect anonymity (need 5, have 3)"*.
2. Log out and switch to Hospital Admin (`h_admin_1`): since 6 hospital workers submitted feedback, the panel unlocks, displaying the aggregate rating (`★ 3.2 / 5.0`) and CSS bar distribution for tags (`schedule`, `fatigue`, `teamwork`).
3. In the footer, click **What We Store** (`/trust/`): inspect the public data retention contract detailing every stored cryptographic field alongside explicit zero-storage guarantees (no GPS, no biometrics, no device fingerprinting).

---

## ♿ Accessibility & Inclusivity (WCAG 2.1 AA)

FairShift is engineered for frontline workers on basic smartphones, noisy work sites, and diverse literacy backgrounds:
- **Zero Framework / Zero Bundler**: Plain vanilla ES modules for instant loading on 3G/4G connections.
- **Strict Color Contrast**: All text/background combinations meet or exceed **WCAG 2.1 AA 4.5:1** (tested and verified via `tests/contrast.test.js`).
- **Touch Ergonomics**: All interactive buttons, inputs, and tab navigation bars provide minimum tap target dimensions of **44px by 44px**.
- **Keyboard Operable**: Visible 3px high-contrast focus rings on interactive elements with full tab-key navigability.
- **Screen Reader Announcements**: Live dynamic status updates and voice recognition state changes broadcast via `aria-live="polite"` regions.
- **Multilingual Spoken Interfaces**: Complete coverage across English, Tamil (`ta-IN`), and Hindi (`hi-IN`) with Web Speech API speech synthesis read-aloud and voice hazard capture.

---

## ⚖️ Honest Limitations & Design Trade-offs

1. **Tamper-Evident, Not Tamper-Proof**:
   FairShift's append-only hash chains make **any post-hoc data tampering immediately detectable** via `/api/admin/integrity` and digital receipts. However, without external multi-party replication, an attacker with full root database access could delete or rewrite the store. In production, chain heads should be anchored to an external ledger or cloud write-once archive (e.g. Google Cloud Storage bucket lock).
2. **Rotating Site Codes Mitigate, but Do Not Prevent, Code Sharing**:
   Dynamic 5-minute site codes confirm that a check-in occurred within the facility's physical time window without requiring continuous GPS tracking. However, a worker could theoretically message the 6-digit code to a colleague off-site within that 5-minute window. Pair with physical site displays or NFC tokens in high-security environments.
3. **Illustrative Rule Defaults**:
   All numeric thresholds (e.g., 8h normal day, 12h rest interval, 3 consecutive nights) in configuration files are illustrative baselines designed for demonstration, not certified legal or occupational health advice.
4. **In-Memory Store**:
   The current repository uses an in-memory store suitable for containerized microservices and integration testing. In production, swap `src/repository/memoryRepository.js` with Google Cloud Firestore or PostgreSQL.
5. **Rule-Based Triage with AI Roadmap**:
   Current hazard report triage utilizes deterministic multilingual keyword matching across English, Tamil, and Hindi. While resilient against prompt injection and zero-latency, nuanced spoken transcripts will benefit from Google Gemini SDK integration in production.

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

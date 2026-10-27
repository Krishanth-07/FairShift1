# FairShift 🛡️

> **A worker-first workplace trust platform for UN SDG 8 (Decent Work and Economic Growth).**
>
> *"Workers and employers shouldn't have to trust each other. They should be able to check."*

FairShift bridges the transparency, safety, and accountability gap between frontline shift workers and employers. Built with a verified two-sided work record, an explainable decision engine, and a privacy-preserving whistleblowing architecture, FairShift enables workers to prove hours worked, resolve payroll discrepancies, and report workplace hazards with zero fear of retaliation.

---

## 🎯 Problem Statement & Feature Mapping

Frontline industries (construction, healthcare, manufacturing, sanitation) employ millions of shift workers under asymmetric conditions where records are unilaterally controlled by employers.

| Frontline Problem | Industry Reality | FairShift Architectural Solution |
|---|---|---|
| **Wage Theft & Unrecorded Overtime** | Paper logs or employer databases can be retroactively altered, shorting overtime pay. | **Tamper-Evident Hash Chains & HMAC Receipts**: Every shift punch is linked into an individual SHA-256 chain. Workers receive a cryptographically signed receipt immediately verifiable on their device. |
| **Invasive Worker Surveillance** | Apps enforce continuous background GPS or biometric scans, violating worker privacy. | **Dynamic Rotating Site Codes**: TOTP-style 6-digit codes rotate every 5 minutes at the facility, proving physical presence without GPS or biometrics. |
| **Fatigue & Unsafe Rotations** | Chronic overtime and back-to-back shifts cause severe occupational burnout and injury. | **Pure Explainable Fatigue Engine**: Automatically flags excessive daily hours, 7-day rolling ceilings, and short rest intervals with structured explainable reason codes. |
| **Fear of Retaliation on Hazards** | Workers stay silent about collapsed scaffolding or biohazards for fear of termination. | **Anonymous Hazard Reporting & SLA Escalation**: Hazard reports store zero worker identity fields. Private `FS-XXXX-XXXX` tracking codes let workers monitor progress; overdue hazards automatically escalate. |
| **Management Blacklists for Feedback** | Supervisors retaliate against workers who report poor site conditions or abusive practices. | **k-Anonymous Sentiment Pulse (Group Size $\ge 5$)**: Employer dashboards hide feedback aggregates until at least 5 workers submit sentiment, guarded by unlinkable monthly HMAC markers. |
| **Low Literacy & Linguistic Barriers** | Complex legalistic portals exclude workers who do not speak English or read text well. | **Multilingual Voice-First PWA**: Spoken-style English, Tamil (`ta-IN`), and Hindi (`hi-IN`) interfaces with Web Speech read-aloud and voice-to-text input. |

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                      Frontline Dual Interfaces                         │
│   Worker PWA (/worker/)   │   Employer Dashboard (/admin/)  │  /trust/ │
└───────────────────┬────────────────────────────┬───────────────────────┘
                    │ HTTP / REST                │
┌───────────────────▼────────────────────────────▼───────────────────────┐
│                       Security & Transport Layer                       │
│  Helmet Strict CSP • 20kb JSON Limit • Rate Limiters • CSRF Validation │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                          Express API Routing                           │
│  /api/auth   │   /api/records   │   /api/me/*   │  /api/admin/*        │
└───────────────────┬────────────────────────────┬───────────────────────┘
                    │                            │
┌───────────────────▼──────────────┐ ┌───────────▼───────────────────────┐
│          Service Layer           │ │        Pure Decision Engine       │
│  recordService    payslipService │ │  hours.js          pay.js         │
│  reportService    adviceService  │ │  fatigue.js        chain.js       │
│  feedbackService  adminService   │ │  anomaly.js        risk.js        │
│                                  │ │  triage.js         escalation.js  │
│                                  │ │  anonymity.js      advocate.js    │
└───────────────────┬──────────────┘ └───────────┬───────────────────────┘
                    │                            │
┌───────────────────▼────────────────────────────▼───────────────────────┐
│                          In-Memory Repository                          │
│          (Swap memoryRepository.js for Firestore in Production)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🏭 Two Industries & Adding a Third via Config

FairShift runs multiple diverse industries from a single unified core engine via configuration profiles in [`src/config/industries.js`](file:///c:/Users/krish/OneDrive/Desktop/FairShift/src/config/industries.js).

### Active Built-in Profiles
1. **Construction (`"construction"`)**:
   - Heavy daytime shifts (07:00–15:30, 15:30–23:30).
   - Strict 10-hour daily maximum and 12-hour minimum rest gap between shifts.
   - 1.5x overtime wage multiplier.
   - Environmental heat safety rules (caution, extreme caution, danger, mandatory work stoppage).
   - Fast 2-hour critical hazard escalation deadline for structural risks.
2. **Hospital (`"hospital"`)**:
   - Round-the-clock rotations including overnight shifts (23:00–07:30).
   - Emergency allowance up to 14 hours with mandatory 3-consecutive-night shift limit.
   - 2.0x overtime multiplier for emergency medical coverage.
   - Biohazard spill and medical supply shortage triage categories.

### How to Add a Third Industry (e.g., Logistics / Warehousing)
To support a new sector, add an entry to the `INDUSTRIES` dictionary in `src/config/industries.js`. Zero engine changes required:

```javascript
// src/config/industries.js
export const INDUSTRIES = {
  // Existing: construction, hospital...

  logistics: {
    id: 'logistics',
    label: 'Logistics & Fulfillment Hub',
    currency: 'INR',
    shifts: [
      { id: 'log-day', name: 'Sortation Day', start: '06:00', end: '14:30', isNight: false },
      { id: 'log-night', name: 'Dispatch Night', start: '22:00', end: '06:30', isNight: true }
    ],
    normalDailyHours: 8,
    overtimeMultiplier: 1.75,
    maxDailyHours: 11,
    maxWeeklyHours: 50,
    minRestHours: 11,
    maxConsecutiveNights: 4,
    heat: null, // Indoor climate-controlled facility
    reportCategories: [
      'conveyor_jam',
      'forklift_safety',
      'pallet_collapse',
      'blocked_fire_exit',
      'speeding_vehicle'
    ],
    severityDeadlineHours: { critical: 2, high: 8, medium: 24, low: 72 },
    lateSyncWarnHours: 12,
    reconcileToleranceMinutes: 15
  }
};
```

---

## 🚀 Running & Testing

### Prerequisites
- Node.js >= 20 (`node -v` must report v20+)
- Plain JavaScript only — no TypeScript, no build step, no bundlers.

### Local Setup
```bash
# Clone the repository
git clone <repo-url>
cd FairShift

# Copy environment variables
cp .env.example .env

# Install approved runtime dependencies (express, helmet, express-rate-limit, compression)
npm install

# Run automated test suite (174 tests, 60 suites)
npm test

# Launch development server
npm start
```

### Docker Deployment
```bash
# Build lightweight Alpine image
docker build -t fairshift:latest .

# Run container as non-root user (port 8080)
docker run -p 8080:8080 -e DEMO_MODE=true fairshift:latest
```

---

## 🎭 How to Demo (Interactive 4-Step Walkthrough)

Start FairShift in demo mode (`DEMO_MODE=true npm start`). One-click demo cards appear on both the Worker App and Admin Dashboard.

### Demo Personas
- **Construction Worker**: `c_worker_1` (Rajesh Kumar) — Greenfield Tower Construction
- **Hospital Worker**: `h_worker_2` (Deepa Nair) — City General Hospital
- **Construction Admin**: `c_admin_1` (Priya Desai) — Greenfield Tower Construction
- **Hospital Admin**: `h_admin_1` (Vikram Reddy) — City General Hospital
- **Universal Demo PIN**: `4321` (or configured `SEED_PIN`)

---

### The 4-Step Verification Walkthrough

#### Step 1: Explainable Worker Advocate & Underpaid Payslip
1. Open the **Worker App** at `http://localhost:8080/worker/`.
2. Click the quick-login card for **Rajesh Kumar** (`c_worker_1`).
3. The **Worker Trust Advocate** immediately displays: **Pay Advisory: Unpaid Hours Detected**. Click the speaker icon to listen via speech synthesis.
4. Navigate to the **Payslip** tab: a red underpayment card details that logged shift hours exceed employer payroll records. Click **Dispute This Discrepancy** to submit a formal shift dispute.

#### Step 2: Frontline Check-In with Rotating Site Code & Offline Queue
1. Open the **Admin Dashboard** in a second window at `http://localhost:8080/admin/`.
2. Click **Priya Desai** (`c_admin_1`). View the **Active Rotating Site Code** displaying a 6-digit TOTP code and live countdown timer.
3. In the Worker window, click **Check In to Shift** and enter the 6-digit code.
4. An instant verifiable digital receipt is issued with a SHA-256 record hash and HMAC signature.
5. *Offline Resilience*: Turn off your connection or set DevTools to Offline. Click punch again — shifts queue safely in local storage and synchronize automatically with per-item idempotency when reconnected.

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

## 🔒 Security & Privacy Highlights

- **Secret Zero**: All secrets passed via environment variables with random cryptographic fallbacks during development.
- **Strict Content Security Policy (CSP)**: `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, no inline scripts, no inline styles, no clickjacking (`frame-ancestors 'none'`).
- **CSRF Defense**: State-mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) require `X-Requested-With: fairshift` alongside `SameSite=Strict` cookies.
- **Constant-Time Verification**: `crypto.timingSafeEqual` used on PIN verification, HMAC receipts, session tokens, and site code comparisons.
- **Anti-Enumeration Login**: Identical error responses and simulated work duration for non-existent users and incorrect PINs.
- **Rate Limiting**: Tiered IP limits (300/15m general, 10/15m login, 20/h reports, 10/h feedback).
- **Payload Restrictions**: Strict 20kb JSON payload ceiling prevents buffer starvation and memory exhaustion.

---

## ♿ Accessibility & Inclusivity (WCAG 2.1 AA)

- **Strict Color Contrast**: All text/background combinations meet or exceed **WCAG 2.1 AA 4.5:1** (tested and verified via `tests/contrast.test.js`).
- **Touch Ergonomics**: All interactive buttons, inputs, and tab navigation bars provide minimum tap target dimensions of **44px by 44px**.
- **Keyboard Operable**: Visible 3px high-contrast focus rings on interactive elements with full tab-key navigability.
- **Screen Reader Announcements**: Live dynamic status updates and voice recognition state changes broadcast via `aria-live="polite"` regions.
- **Multilingual Spoken Interfaces**: Complete coverage across English, Tamil (`ta-IN`), and Hindi (`hi-IN`) with Web Speech API speech synthesis read-aloud and voice hazard capture.

---

## ⚖️ Honest Limitations & Assumptions

### Honest Limitations
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

### Assumptions
1. **Clock Monotonicity**: Worker devices and server rely on ISO UTC timestamps; client punches with timestamps more than 5 minutes in the future are rejected.
2. **Single Active Site Assignment**: Each worker is assigned to one primary facility or construction site at a given time.
3. **Browser Audio Support**: Voice recording and speech synthesis rely on standard Web Speech APIs; browsers lacking speech support fall back gracefully to text.

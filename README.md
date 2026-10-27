# FairShift 🛡️

> **A worker-first workplace trust platform for UN SDG 8 (Decent Work and Economic Growth).**

FairShift bridges the trust and safety gap between frontline workers and employers in shift-intensive industries. It delivers a verified, two-sided work record alongside an explainable, pure-function decision engine.

---

## 🌟 Key Features

1. **Verified Shift & Hours Tracking**: Tamper-evident digital receipts proving hours worked and overtime.
2. **Explainable Decision Engine**: Deterministic rule evaluation for fatigue limits, rest intervals, and overtime calculations with human-readable and localized reason codes.
3. **Voice & Text Hazard Reporting**: Multilingual reporting with actionable risk assessment.
4. **Anonymous Worker Voice**: Secure feedback channel to surface concerns without fear of retaliation.
5. **Portable Skill Passport**: Digital credentials and experience history that move with the worker.
6. **Dual Role Interfaces**:
   - **Worker App**: High-contrast, mobile-friendly, voice-enabled, and multilingual.
   - **Employer/Admin Dashboard**: Real-time workforce health monitoring, fatigue flags, and proactive safety alerts.
7. **Multi-Industry Support from Single Engine**: Pluggable configurations for distinct sectors (e.g., Construction Sites and Hospital Rotations).

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

# Install dependencies (when ready)
npm install

# Run tests
npm test

# Start the application
npm start
```

---

## 📐 Architecture & Standards

See [AGENTS.md](./AGENTS.md) for architectural guardrails and engineering rules, and [DECISIONS.md](./DECISIONS.md) for architectural decision records (ADRs).

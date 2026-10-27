# Prompt Log - FairShift

This document logs the key prompts and instructions used in designing and developing FairShift for transparency, reproducibility, and auditability.

---

## Prompt 1: Project Genesis & Foundation Bootstrap

- **Date**: 2026-10-27
- **Role**: Antigravity AI Pair Programmer
- **Prompt Summary**:
  - Establish standing rules in `AGENTS.md` covering product goals (SDG 8, verified work records, explainable decision engine, construction & hospital industries), engineering constraints (Node 20, ES modules, pure functions in `src/engine/`, `node:test`, strict security, WCAG 2.1 AA accessibility, <10MB repo size).
  - Bootstrap project skeleton (`package.json`, `.gitignore`, `.env.example`, directory structure with `.gitkeep`, stub `README.md`, `DECISIONS.md`, and `PROMPTS.md`).
  - Work strictly on branch `main`.

---

## Prompt 2: Pure Decision Engine Foundation (Part 1) & Test Suite

- **Date**: 2026-10-27
- **Role**: Antigravity AI Pair Programmer
- **Prompt Summary**:
  - Build `src/config/industries.js` with construction and hospital profiles (heat safety, night shift limits, illustrative defaults).
  - Build pure `src/engine/hours.js` (deterministic dateKey, pairRecords for overnight & open sessions, sessionMinutes, summarizeDay, summarizePeriod).
  - Build pure `src/engine/pay.js` (integer paise only, computePay, explainable reconcile with status and reasons).
  - Build `src/engine/chain.js` (Node crypto, canonicalize, createRecord, verifyChain with brokenAtIndex, signReceipt, verifyReceipt with timingSafeEqual).
  - Build `src/engine/siteCode.js` (generateSiteCode, verifySiteCode with window tolerance).
  - Build pure `src/engine/anomaly.js` (neutral review flags for DUPLICATE_IN, IMPOSSIBLE_SESSION, LATE_SYNC, OVERTIME_SPIKE, NIGHT_ROSTER_MISMATCH, detectCloneCheckins).
  - Comprehensive `node:test` suite with 65 passing assertions.

---

## Prompt 3: Pure Decision Engine Foundation (Part 2) & Test Suite

- **Date**: 2026-10-27
- **Role**: Antigravity AI Pair Programmer
- **Prompt Summary**:
  - Build `src/engine/fatigue.js` (DAILY_MAX, WEEKLY_MAX rolling 7-day, MIN_REST gap, CONSECUTIVE_NIGHTS hospital-only).
  - Build `src/config/keywords.js` (English, Tamil, Hindi category keywords + critical keywords with native-speaker review notes).
  - Build `src/engine/triage.js` (triageByRules with multilingual matching, mergeTriage that never lowers severity).
  - Build `src/engine/escalation.js` (deadline evaluation, resolved never escalates).
  - Build `src/engine/risk.js` (0–100 retention risk score, never uses anonymous feedback).
  - Build `src/engine/anonymity.js` (MIN_GROUP_SIZE=5, assertAnonymous rejecting PII fields and time-granular timestamps, aggregateFeedback with k-anonymity).
  - Build `src/engine/advocate.js` (priority: rest-required > underpaid > escalated hazard > watch > anomalies > all-clear).
  - Comprehensive tests: 126 passing assertions across both industries.

---

## Prompt 4: App Server, Auth, Memory Repository, Seed Data & Security Middleware

- **Date**: 2026-10-27
- **Role**: Antigravity AI Pair Programmer
- **Prompt Summary**:
  - Install runtime dependencies: `express`, `helmet`, `express-rate-limit`, `compression`. Zero AI packages installed.
  - Build `src/config/env.js`: frozen config, random fallback secrets with single warning, hidden in prod.
  - Build `src/services/clock.js`: `systemClock` and `createFakeClock`.
  - Build `src/repository/memoryRepository.js`: in-memory store with narrow interface, deep clone returns, hash chain verification on appendRecord.
  - Build `src/repository/seed.js`: deterministic data for construction and hospital with 7 planted scenarios.
  - Build `src/services/auth.js`: scrypt PIN hashing with per-user salt and timingSafeEqual, custom HMAC-SHA256 session tokens.
  - Build `src/middleware/`:
    - `security.js` (helmet strict CSP, compression, 20kb JSON limit, trust proxy 1).
    - `rateLimits.js` (general 300/15m, login 10/15m, reports 20/h, feedback 10/h).
    - `requireAuth.js` (session cookie verification, role check, CSRF header requirement on mutations).
    - `validate.js` (strict body schema validation rejecting unknown keys).
    - `errors.js` (AppError, JSON 404, central handler with zero stack trace leaks).
  - Build `src/routes/authRoutes.js`: login, logout, me, demo-login (only in DEMO_MODE), /healthz.
  - Build `src/app.js` and `src/server.js`.
  - Tests in `tests/auth.test.js` and `tests/security.test.js`: 140 passing assertions.

---

## Prompt 5: Core Services, API Routing, Docker & End-to-End Test Suite

- **Date**: 2026-10-27
- **Role**: Antigravity AI Pair Programmer
- **Prompt Summary**:
  - Build services: `recordService.js` (time boundaries, site code check, deduplication, hash chain, digital receipt, offline batch sync), `payslipService.js` (payslips with reconciliation and audit trails), `adviceService.js` (advocate advisory), `reportService.js` (anonymous hazard reports with tracking code `FS-XXXX-XXXX`, linear status transitions), `feedbackService.js` (unlinkable HMAC monthly markers, k-anonymity with MIN_GROUP_SIZE=5), `adminService.js` (site overview, auditLog payroll edits, day status confirm/dispute, chain integrity audit).
  - Build schema transparency: `schemaFields.js` and `GET /api/public/what-we-store`.
  - Build routes: `workerRoutes.js` (records, sync, status, payslip, advice, reports, feedback, dispute) and `adminRoutes.js` (scoped strictly to `req.user.siteId`).
  - Containerization: `Dockerfile` (node:20-alpine, non-root user, `npm ci --omit=dev`) and `.dockerignore`.
  - Comprehensive end-to-end API test suite in `tests/api/api.test.js`: 163 passing assertions covering authorization, cross-tenant isolation, idempotency, tampering detection, k-anonymity, and validation.
  - Updated `README.md` and `DECISIONS.md`.




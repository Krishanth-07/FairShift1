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

---

## Prompt 6: Front-End Architecture, Multilingual Worker App & UI Test Suite

- **Date**: 2026-10-27
- **Role**: Antigravity AI Pair Programmer
- **Prompt Summary**:
  - Added `GET /api/auth/demo-users` to `src/routes/authRoutes.js` (available only when `DEMO_MODE=true`, returning sanitized roster without credentials or pay rates).
  - Built `public/shared/`:
    - `api.js`: Fetch wrapper sending `X-Requested-With: fairshift` on state-modifying requests, credentials inclusion, and 401 redirect.
    - `i18n.js`: Dynamic client-side internationalization loading `/locales/{en,ta,hi}.json`, `{key}` template substitution, language persistence in `localStorage`, and DOM attribute translation.
    - `speech.js`: Web Speech API integration with `speak()` (silent fallback, language-appropriate voices) and `listen()` (graceful failure on unsupported browsers).
    - `icons.js`: Semantic inline SVGs built via `document.createElementNS` with visible text labels and `aria-hidden` attributes.
    - `base.css`: CSS custom properties, WCAG 2.1 AA 44px minimum tap targets, 3px high-contrast focus rings, `prefers-reduced-motion` compliance.
  - Built `public/locales/` (`en.json`, `ta.json`, `hi.json`): 145 synchronized translation keys covering all engine decision rules, service errors, and UI labels, written in accessible, spoken phrasing for low-literacy workers.
  - Built `public/worker/`:
    - `index.html`: Fully semantic, accessible markup (`<main>`, `<dialog>`, `<fieldset>`, `<nav>`), zero inline scripts and zero inline styles.
    - `worker.css`: Mobile-first responsive styling, high contrast, touch-friendly controls.
    - `worker.js`: Vanilla JS SPA handling demo user selection, PIN login, Advocate advisory, giant shift punch with rotating site code dialog, offline punch queue with automatic background sync, payslip view with dispute dialog and speech synthesis read-aloud, anonymous hazard reporting with voice input and tracking code lookup, and anonymous feedback with k-anonymity guarantee link. Strictly avoids `innerHTML`.
  - Built comprehensive tests:
    - `tests/auth.test.js`: Verified `demo-users` returns 404 when `DEMO_MODE=false` and returns sanitized array when `DEMO_MODE=true`.
    - `tests/i18n.test.js`: Verified identical key sets across languages, zero empty strings, and full coverage of all `messageKey` occurrences in `src/engine/` and `src/services/`.
    - `tests/static.test.js`: Verified semantic HTML tags (`lang`, `<title>`, `<main>`), zero inline script blocks, zero inline styles, and zero `innerHTML` usage in `public/`.
  - Full suite: 172 tests across 59 suites passing cleanly.

---

## Prompt 7: Employer Dashboard, Trust Transparency Page, Landing Page & WCAG Contrast Suite

- **Date**: 2026-10-27
- **Role**: Antigravity AI Pair Programmer
- **Prompt Summary**:
  - Built `public/admin/`:
    - `index.html`: Desktop-first responsive dashboard with semantic markup (`<main>`, `<table>`, `<caption>`, `<th scope="col">`, `<th scope="row">`, `<fieldset>`), zero inline scripts, and zero inline styles.
    - `admin.css`: High-contrast dashboard styling, 44px tap targets, prominent rotating site code card, accessible severity chips.
    - `admin.js`: Vanilla JS dashboard handling demo admin quick-login, overview cards (attendance, fatigue alert count, escalated hazard count, cryptographic chain integrity status), live TOTP rotating site code with live countdown timer and automatic re-fetch, fatigue & operational anomaly review table with neutral wording, hazard report table sorted escalated first with status transition dropdown, k-anonymous pulse feedback panel (showing insufficient responses notice when < 5 or unlocked CSS bar distributions when >= 5), retention risk cards with explicit operational reasons, and auditable payroll editor with shift day confirmation and dispute actions. Strictly avoids `innerHTML`.
  - Built `public/trust/`:
    - `index.html`, `trust.css`, `trust.js`: Transparent data retention specification page rendering `/api/public/what-we-store` as two plain lists (what FairShift stores vs what FairShift NEVER stores) across records, reports, and feedback, with human-readable explanations and full internationalization. Linked from worker feedback screen and admin footer.
  - Built landing page at `/` (`public/index.html` & `public/landing.css`):
    - Featured thesis: "Workers and employers shouldn't have to trust each other. They should be able to check."
    - Two large primary action cards (Worker App, Admin Dashboard) plus Trust Guarantee link.
    - Configured static asset long cache headers (`max-age=31536000, immutable`) in `src/app.js` with `no-cache, must-revalidate` for HTML files.
  - Built `tests/contrast.test.js`:
    - Parsed CSS custom properties from `base.css` and computed exact WCAG 2.1 relative luminance and contrast ratios.
    - Tested explicit text/background pairs for normal text (>= 4.5:1) and graphical boundaries (>= 3.0:1).
    - Hardened color palette: updated `--accent-primary` to `#0369a1` (5.93:1 with white), `--border-strong` to `#64748b` (4.7:1 with white), and `--text-muted` to `#526071` (>= 5.8:1 on all backgrounds).
  - Updated `README.md` with interactive 4-step demo walkthrough, demo user credentials and planted scenarios, accessibility notes, and expanded honest limits.
  - Full suite: 174 tests across 60 suites passing cleanly.






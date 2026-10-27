# Architectural Decision Records (ADR) - FairShift

This document records the architectural and technology decisions made for FairShift, including justifications for dependencies, patterns, and trade-offs.

---

## ADR 001: Plain ES Modules and Node.js 20 Built-ins

- **Status**: Accepted
- **Context**: FairShift needs to run reliably across development, testing, and production environments without transpilation overhead or fragile build steps.
- **Decision**: Use Node.js >= 20 with native ES Modules (`"type": "module"`). Use `node:test` and `node:assert` for test runners.
- **Consequences**:
  - Zero build step; instantaneous boot and testing.
  - Reduced dependencies and attack surface.
  - Native performance and debugging.

---

## ADR 002: Pure Function Decision Engine (`src/engine/`)

- **Status**: Accepted
- **Context**: Shift verification, fatigue rules, and wage/overtime calculations must be explainable, testable, and auditable without side-effects or timing inconsistencies.
- **Decision**: All business logic in `src/engine/` is implemented as pure functions. External factors like time (`now`) are explicitly passed in as arguments. No direct I/O, no system clock access (`Date.now()`), and no random number generation. Every decision output returns an array of structured reasons containing a `ruleId`, `messageKey`, `params`, and English `message`.
- **Consequences**:
  - 100% deterministic unit tests.
  - Easily localizable into multiple worker languages via `messageKey` and `params`.
  - Auditable compliance logs with full explainability.

---

## ADR 003: Approved Runtime Dependencies

- **Status**: Accepted
- **Context**: In accordance with `AGENTS.md`, only minimal, justified runtime dependencies are allowed.
- **Allowed Dependencies**:
  - `express`: Core HTTP router and application server.
  - `helmet`: Essential security headers (CSP, HSTS, frameguard, etc.).
  - `express-rate-limit`: Protect against brute-force and DoS on public endpoints.
  - `compression`: Payload compression for low-bandwidth mobile devices.
  - `@google/genai`: Official SDK for Gemini integration (multilingual hazard analysis and voice-to-text processing).
- **Rule**: Any addition beyond this list must be documented and justified in this file.

---

## ADR 004: Two-Sided Trust via Per-Worker Hash Chains and HMAC Digital Receipts

- **Status**: Accepted
- **Context**: Frontline workers frequently suffer wage theft or uncounted overtime when hours records are unilaterally managed by employers.
- **Decision**: Every punch event is appended to an individual SHA-256 hash chain per worker. Each record references the predecessor's hash (`prevHash`) and is sealed with an HMAC-SHA256 digital receipt signature. The employer dashboard provides a `/api/admin/integrity` endpoint to detect any retroactive modification or record deletion.
- **Consequences**:
  - Tamper-evident proof of work for employees.
  - Any historical database alteration is immediately detected.

---

## ADR 005: Worker-First Privacy Architecture (k-Anonymity & Unlinkable Monthly Markers)

- **Status**: Accepted
- **Context**: Frontline workers hesitate to report hazardous equipment or voice negative feedback about managers due to fear of retaliation.
- **Decision**:
  1. Hazard reports strictly store zero worker identity fields (`workerId`, `userId`, `name`, `ipAddress`). Reports receive an alphanumeric tracking code (`FS-XXXX-XXXX`) allowing workers to monitor remediation progress without logging in.
  2. Anonymous feedback enforces a 1-per-month rate limit using an irreversible HMAC marker stored separately in `submissionMarkers`. Stored feedback records contain only date-level granularity (`YYYY-MM-DD`).
  3. Aggregate sentiment is hidden from employers unless at least 5 distinct workers have submitted feedback (`MIN_GROUP_SIZE = 5`), guaranteeing k-anonymity.
- **Consequences**:
  - Absolute protection against whistleblower retaliation.
  - Unlinkable monthly rate-limiting prevents feedback spam without de-anonymizing workers.

---

## ADR 006: Zero-Framework, Zero-Build Frontend with Strict CSP

- **Status**: Accepted
- **Context**: Frontline worker apps must run smoothly on low-end mobile devices over basic 3G/4G connectivity, with zero exposure to script injection attacks (XSS).
- **Decision**:
  - Pure vanilla JavaScript with standard ES modules served directly without bundlers (no React, Vue, Webpack, Vite, or Babel).
  - Strict Content Security Policy enforced via Helmet (`script-src 'self'`, `style-src 'self'`, `default-src 'self'`, `object-src 'none'`).
  - Zero inline `<script>` tags, zero inline `<style>` or `style="..."` attributes, and strictly zero `innerHTML` usage. DOM construction uses pure browser APIs (`document.createElement`, `textContent`).
- **Consequences**:
  - Instant page boot (< 100ms) with lightweight transfer size (< 550 KB total repository assets).
  - Complete immunity against DOM-based XSS injection.

---

## ADR 007: Rotating Time-Windowed Site Codes vs. Continuous GPS

- **Status**: Accepted
- **Context**: Employers require proof that workers physically logged shifts at the job site, but continuous GPS tracking is invasive, drains worker batteries, and violates privacy standards.
- **Decision**: Implement dynamic 6-digit TOTP-style rotating site codes derived from HMAC-SHA256 (`generateSiteCode`). Codes update every 5 minutes and are displayed on-site or in the supervisor dashboard. Punch verification accepts the current window and immediately adjacent windows (±5 minutes).
- **Consequences**:
  - Cryptographic verification of physical presence without storing or requesting GPS coordinates.
  - Workers' location is never tracked outside or inside the facility.

---

## ADR 008: Config-Driven Cross-Sector Industry Profiles

- **Status**: Accepted
- **Context**: Workplace norms vary widely between sectors (e.g. daytime heavy civil engineering vs. round-the-clock intensive clinical care). Building custom engines per vertical causes code duplication and fragmented security boundaries.
- **Decision**: Single unified pure decision engine parametrized by configuration profiles (`src/config/industries.js`). The engine evaluates fatigue, roster alignment, overtime multipliers, and escalation deadlines strictly from the active site's profile.
- **Consequences**:
  - Immediate multi-industry support (`construction` and `hospital`) from one verified codebase.
  - Adding a new sector (e.g., `logistics`, `manufacturing`, `mining`) requires zero modifications to engine code—simply adding an illustrative configuration profile.


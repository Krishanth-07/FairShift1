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

# FairShift - Standing Agent Rules

These standing rules govern the architecture, engineering principles, security standards, and coding practices for the **FairShift** codebase. All automated agents and contributors must adhere to them at every step.

---

## 1. Product Definition

- **Core Mission**: FairShift is a worker-first workplace trust platform aligning with **UN SDG 8 (Decent Work and Economic Growth)**. It provides a verified, two-sided work record combined with an explainable decision engine.
- **Worker Capabilities**:
  - Prove hours and completed shifts with tamper-evident digital receipts.
  - Report workplace hazards via voice or text input with structured tracking.
  - Submit safe, anonymous feedback regarding management and site conditions.
  - Maintain a portable, verifiable digital Skill Passport across jobs.
- **Employer/Admin Capabilities**:
  - Live dashboard monitoring workforce health, attendance anomalies, and hazard escalations.
  - Fatigue and overtime alerts driven by explainable rule evaluations.
- **Cross-Sector Support**:
  - Configurable support for multiple industries from a single unified core engine (e.g., `"construction"` active site shifts and `"hospital"` round-the-clock healthcare / sanitation rotations).

---

## 2. Engineering & Architecture Rules

- **Platform & Runtime**:
  - Node.js version >= 20.
  - Standard ES Modules (`"type": "module"` in `package.json`).
  - Plain JavaScript only — no TypeScript compiler, no client or server build steps or bundlers.
- **Allowed Runtime Dependencies**:
  - `express`: Minimal HTTP application routing and middleware handling.
  - `helmet`: Essential HTTP security headers.
  - `express-rate-limit`: Rate limiting on public and sensitive API endpoints.
  - `compression`: Efficient gzip/brotli response compression for low-bandwidth devices.
  - `@google/genai`: Official Google Gemini SDK for processing voice/text hazard reports and multilingual assistance.
  - *Note*: Any additional dependency requires an explicit entry and written justification in `DECISIONS.md`.
- **Testing Standard**:
  - Built-in `node:test` and `node:assert` only (no external testing frameworks like Jest or Mocha).
  - Strict rule: `npm test` must pass cleanly before every commit.
- **Pure Decision Engine (`src/engine/`)**:
  - Pure functions only: strictly zero I/O, no network calls, no database access, no `Date.now()`, no `new Date()` without params, and no `Math.random()`.
  - Deterministic time: the current timestamp must always be supplied explicitly as a `now` argument (ISO string or timestamp integer).
  - Explainable decisions: every evaluation output must return a structured reasons array:
    ```json
    [
      {
        "ruleId": "FATIGUE_MAX_HOURS_EXCEEDED",
        "messageKey": "rules.fatigue.max_hours_exceeded",
        "params": { "threshold": 12, "actual": 13.5 },
        "message": "Shift duration of 13.5 hours exceeds maximum safe limit of 12.0 hours."
      }
    ]
    ```
    Where `message` is the human-readable English explanation, and `messageKey` + `params` allow client-side localization.
- **Illustrative Defaults**:
  - All numeric rule thresholds in configuration files are illustrative default standards, not certified legal or medical advice.

---

## 3. Security & Privacy Guardrails

- **Secret Zero**: Zero secrets, API keys, passwords, or credentials stored in repository files or git history.
- **Environment Driven**: All environment-specific variables must be read from `process.env` with sensible local fallbacks.
- **Strict Input Validation**: Every request body, query parameter, and route parameter must be validated and sanitized.
- **No Unsafe Execution**: Strictly no `eval()`, no `Function()` constructor, and no `innerHTML` injection with untrusted user data.
- **Strict Content Security Policy (CSP)**: No inline scripts (`<script>...</script>`) and no inline style attributes (`style="..."`). Scripts and styles must be served via static assets with strict CSP headers configured via Helmet.
- **Error Hygiene**: Error handlers must never leak stack traces, internal paths, or environment data to client responses.

---

## 4. Accessibility & UI Inclusivity (WCAG 2.1 AA)

- **Semantic HTML**: Utilize semantic elements (`<main>`, `<nav>`, `<article>`, `<section>`, `<header>`, `<button>`, `<fieldset>`).
- **Input Accessibility**: Explicit `<label for="...">` associations for every form input.
- **Focus & Navigation**: Fully operable via keyboard alone; visible, high-contrast focus rings on interactive elements.
- **Color Contrast**: Minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text/icons against their backgrounds.
- **Screen Reader Announcements**: Strategic use of `aria-live="polite"` for dynamic content, alerts, and status changes.
- **Touch Targets**: Minimum interactive tap target dimensions of 44px by 44px to accommodate mobile devices and field workers.

---

## 5. Performance & Repository Size Hygiene

- **Size Cap**: Repository size must remain under 10 MB at all times.
- **No Bloat**: Strictly no media binaries, no videos, no heavy image files (JPG/PNG).
- **Icons**: Inline SVG icons or lightweight CSS icons only.
- **Mobile First**: Optimized for basic smartphones on 3G/4G connections.

---

## 6. Code Quality & Version Control

- **Commit Strategy**: Small, incremental commits with descriptive conventional messages (`feat: ...`, `fix: ...`, `docs: ...`, `test: ...`).
- **Comment Philosophy**: Code comments must explain the *why*, not the *what*.
- **Documentation**: JSDoc annotations required on all exported functions, types, and modules.
- **Branch Discipline**: Work exclusively on branch `main`.

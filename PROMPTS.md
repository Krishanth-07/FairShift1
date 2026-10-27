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


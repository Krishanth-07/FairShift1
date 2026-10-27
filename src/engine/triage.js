/**
 * @file Rule-Based Hazard Report Triage Engine
 *
 * Performs keyword-matching triage across multilingual dictionaries and merges
 * rule-based results with optional AI-assisted severity assessments. The merge
 * function guarantees severity is never lowered by AI input.
 */

import { CATEGORY_KEYWORDS, CRITICAL_KEYWORDS } from '../config/keywords.js';

/** Maximum input length processed to prevent resource exhaustion. */
const MAX_INPUT_LENGTH = 10000;

/** Severity ordering for comparison. */
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Performs rule-based keyword triage on a hazard report text.
 *
 * @param {object} params
 * @param {string} params.text - Report text (voice transcript or typed input).
 * @param {object} params.industry - Industry configuration with reportCategories.
 * @returns {{ category: string|null, severity: 'low'|'medium'|'high'|'critical', matchedKeywords: string[] }}
 */
export function triageByRules({ text, industry }) {
  if (!industry) throw new Error('triageByRules requires an industry configuration.');

  // Empty or non-string input gets low severity with no category match
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { category: null, severity: 'low', matchedKeywords: [] };
  }

  // Truncate to prevent excessive processing on adversarial inputs
  const safeText = text.length > MAX_INPUT_LENGTH
    ? text.slice(0, MAX_INPUT_LENGTH)
    : text;
  const lowerText = safeText.toLowerCase();

  const matchedKeywords = [];
  let bestCategory = null;
  let bestCategoryHits = 0;
  let isCritical = false;

  // Check critical keywords across all languages first
  for (const lang of Object.keys(CRITICAL_KEYWORDS)) {
    for (const kw of CRITICAL_KEYWORDS[lang]) {
      if (lowerText.includes(kw.toLowerCase())) {
        isCritical = true;
        if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
      }
    }
  }

  // Match against category keywords for the industry's valid categories
  const validCategories = new Set(industry.reportCategories || []);

  for (const lang of Object.keys(CATEGORY_KEYWORDS)) {
    const langCategories = CATEGORY_KEYWORDS[lang];
    for (const [category, keywords] of Object.entries(langCategories)) {
      if (!validCategories.has(category)) continue;

      let hits = 0;
      for (const kw of keywords) {
        if (lowerText.includes(kw.toLowerCase())) {
          hits += 1;
          if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
        }
      }

      if (hits > bestCategoryHits) {
        bestCategoryHits = hits;
        bestCategory = category;
      }
    }
  }

  // Determine severity from match density
  let severity = 'low';
  if (isCritical) {
    severity = 'critical';
  } else if (bestCategoryHits >= 3) {
    severity = 'high';
  } else if (bestCategoryHits >= 1) {
    severity = 'medium';
  }

  return { category: bestCategory, severity, matchedKeywords };
}

/**
 * Merges a rule-based triage result with an optional AI triage result.
 * The final severity is always the HIGHER of the two; AI can never lower severity.
 * A null or invalid AI result returns the rules result unchanged.
 *
 * @param {{ category: string|null, severity: string, matchedKeywords: string[] }} rulesResult
 * @param {{ severity?: string, category?: string }|null} aiResult
 * @returns {{ category: string|null, severity: string, matchedKeywords: string[], source: string }}
 */
export function mergeTriage(rulesResult, aiResult) {
  if (!rulesResult) throw new Error('mergeTriage requires a valid rulesResult.');

  // Fallback if AI result is missing or malformed
  if (!aiResult || typeof aiResult !== 'object' || !(aiResult.severity in SEVERITY_RANK)) {
    return { ...rulesResult, source: 'rules' };
  }

  const rulesRank = SEVERITY_RANK[rulesResult.severity] ?? 0;
  const aiRank = SEVERITY_RANK[aiResult.severity] ?? 0;

  // AI can only elevate severity, never reduce it
  const finalSeverity = aiRank > rulesRank ? aiResult.severity : rulesResult.severity;
  const finalCategory = rulesResult.category || aiResult.category || null;

  return {
    category: finalCategory,
    severity: finalSeverity,
    matchedKeywords: rulesResult.matchedKeywords || [],
    source: 'merged'
  };
}

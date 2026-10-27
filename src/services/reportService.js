/**
 * @file Workplace Hazard Report Service
 *
 * Implements privacy-first hazard reporting: stores zero worker identifying fields,
 * generates unambiguous tracking codes (FS-XXXX-XXXX) for status queries, performs
 * rule-based triage, tracks status transitions, and enforces escalation sorting.
 */

import crypto from 'node:crypto';
import { triageByRules } from '../engine/triage.js';
import { evaluateEscalation } from '../engine/escalation.js';
import { AppError } from '../middleware/errors.js';

// 32-character unambiguous alphabet omitting visually ambiguous characters (0/O, 1/I)
const TRACKING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates an unambiguous tracking code in FS-XXXX-XXXX format.
 * @returns {string}
 */
export function generateTrackingCode() {
  const bytes = crypto.randomBytes(8);
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i += 1) {
    part1 += TRACKING_ALPHABET[bytes[i] % TRACKING_ALPHABET.length];
  }
  for (let i = 4; i < 8; i += 1) {
    part2 += TRACKING_ALPHABET[bytes[i] % TRACKING_ALPHABET.length];
  }
  return `FS-${part1}-${part2}`;
}

const SEVERITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 };

const ALLOWED_TRANSITIONS = {
  open: ['acknowledged'],
  acknowledged: ['in_progress'],
  in_progress: ['resolved'],
  resolved: [] // Terminal state
};

/**
 * Creates report service.
 *
 * @param {object} dependencies
 * @param {object} dependencies.repo - Memory repository.
 * @param {object} dependencies.clock - Clock abstraction.
 * @returns {object}
 */
export function createReportService({ repo, clock }) {
  /**
   * Files a new anonymous hazard report. Strictly stores NO worker identity.
   *
   * @param {object} params
   * @param {string} params.text - Hazard description.
   * @param {string} [params.category] - Optional category override.
   * @param {string} params.siteId - Job site or facility ID.
   * @param {object} params.industry - Industry profile.
   * @returns {object} Created report with tracking code.
   */
  function createReport({ text, category, siteId, industry }) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new AppError(400, 'EMPTY_TEXT', 'errors.reports.empty_text', 'Hazard report text is required.');
    }
    if (!siteId) {
      throw new AppError(400, 'MISSING_SITE', 'errors.reports.missing_site', 'Site identifier is required.');
    }

    // 1. Evaluate report with pure rule-based triage
    const triage = triageByRules({ text: text.trim(), industry });
    const finalCategory = category || triage.category || 'general_hazard';
    const finalSeverity = triage.severity || 'low';

    const id = `rep_${crypto.randomUUID()}`;
    const trackingCode = generateTrackingCode();
    const createdAt = clock.now();

    const history = [
      {
        status: 'open',
        timestamp: createdAt,
        note: 'Hazard report submitted'
      }
    ];

    // 2. Construct sanitized record: strictly NO workerId or personal metadata
    const report = {
      id,
      trackingCode,
      siteId,
      category: finalCategory,
      severity: finalSeverity,
      text: text.trim(),
      status: 'open',
      history,
      createdAt
    };

    repo.putReport(report);

    return report;
  }

  /**
   * Queries report status by unambiguous tracking code.
   * Returns public tracking metadata only.
   *
   * @param {string} code - Tracking code (FS-XXXX-XXXX).
   * @returns {object} Status snapshot.
   */
  function getReportByCode(code) {
    if (!code || typeof code !== 'string') {
      throw new AppError(400, 'INVALID_CODE', 'errors.reports.invalid_code', 'Tracking code is required.');
    }

    const normalized = code.trim().toUpperCase();
    const allReports = repo.getAllReports();
    const match = allReports.find((r) => r.trackingCode === normalized);

    if (!match) {
      throw new AppError(404, 'REPORT_NOT_FOUND', 'errors.reports.not_found', 'No hazard report found matching this tracking code.');
    }

    return {
      trackingCode: match.trackingCode,
      status: match.status,
      severity: match.severity,
      category: match.category,
      history: match.history
    };
  }

  /**
   * Lists all hazard reports for a site, applying dynamic escalation evaluations
   * and sorting by escalation status, severity, and creation age.
   *
   * @param {string} siteId - Site identifier.
   * @param {object} industry - Industry configuration.
   * @returns {Array<object>}
   */
  function listReports(siteId, industry) {
    const rawReports = repo.getReportsBySite(siteId);

    const evaluated = rawReports.map((report) => {
      const escalation = evaluateEscalation({
        severity: report.severity,
        createdAtIso: report.createdAt,
        status: report.status,
        nowIso: clock.now(),
        industry
      });
      return {
        ...report,
        escalation
      };
    });

    // Sort: escalated first, then severity rank (critical > high > medium > low), then oldest first
    return evaluated.sort((a, b) => {
      if (a.escalation.escalated !== b.escalation.escalated) {
        return a.escalation.escalated ? -1 : 1;
      }
      const sevDiff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
      if (sevDiff !== 0) return sevDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  /**
   * Transitions report status along the strictly enforced linear workflow:
   * open -> acknowledged -> in_progress -> resolved.
   *
   * @param {string} reportId - Report ID.
   * @param {string} newStatus - Target status.
   * @param {string} actorId - ID of the admin updating status.
   * @param {string} [note] - Optional status change note.
   * @returns {object} Updated report.
   */
  function updateStatus(reportId, newStatus, actorId, note) {
    const report = repo.getReport(reportId);
    if (!report) {
      throw new AppError(404, 'REPORT_NOT_FOUND', 'errors.reports.not_found', 'Report not found.');
    }

    const currentStatus = report.status;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      throw new AppError(
        400,
        'INVALID_STATUS_TRANSITION',
        'errors.reports.invalid_transition',
        `Cannot transition report from "${currentStatus}" to "${newStatus}". Allowed next state: ${allowed.join(', ') || 'none'}.`
      );
    }

    report.status = newStatus;
    report.history.push({
      status: newStatus,
      timestamp: clock.now(),
      actorId,
      note: note ? String(note).trim() : `Status transitioned to ${newStatus}`
    });

    repo.putReport(report);
    return report;
  }

  return {
    createReport,
    getReportByCode,
    listReports,
    updateStatus
  };
}

/**
 * @file Hazard Report Escalation Engine
 *
 * Evaluates whether an open hazard report has exceeded its severity-based
 * deadline window and computes overdue hours. Resolved reports never escalate.
 */

/**
 * Evaluates whether a hazard report requires escalation based on its severity deadline.
 *
 * @param {object} params
 * @param {'critical'|'high'|'medium'|'low'} params.severity - Report severity level.
 * @param {string} params.createdAtIso - ISO timestamp when the report was created.
 * @param {string} params.status - Current status ('open', 'in_progress', 'resolved', etc.).
 * @param {string} params.nowIso - Deterministic evaluation timestamp.
 * @param {object} params.industry - Industry config with severityDeadlineHours.
 * @returns {{
 *   escalated: boolean,
 *   hoursOpen: number,
 *   deadlineAtIso: string,
 *   hoursOverdue: number
 * }}
 */
export function evaluateEscalation({ severity, createdAtIso, status, nowIso, industry }) {
  if (!industry || !industry.severityDeadlineHours) {
    throw new Error('evaluateEscalation requires an industry config with severityDeadlineHours.');
  }
  if (!severity || !createdAtIso || !nowIso) {
    throw new Error('evaluateEscalation requires severity, createdAtIso, and nowIso.');
  }

  const createdMs = new Date(createdAtIso).getTime();
  const nowMs = new Date(nowIso).getTime();
  const hoursOpen = Math.max(0, (nowMs - createdMs) / (3600 * 1000));

  const deadlineHours = industry.severityDeadlineHours[severity];
  if (typeof deadlineHours !== 'number') {
    throw new Error(`No deadline configured for severity "${severity}" in industry "${industry.id}".`);
  }

  const deadlineMs = createdMs + deadlineHours * 3600 * 1000;
  const deadlineAtIso = new Date(deadlineMs).toISOString();

  // Resolved reports never escalate regardless of timing
  const isResolved = status === 'resolved';
  const pastDeadline = nowMs > deadlineMs;

  const escalated = !isResolved && pastDeadline;
  const hoursOverdue = escalated ? Math.round((hoursOpen - deadlineHours) * 10) / 10 : 0;

  return {
    escalated,
    hoursOpen: Math.round(hoursOpen * 10) / 10,
    deadlineAtIso,
    hoursOverdue
  };
}

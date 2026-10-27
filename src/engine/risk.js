/**
 * @file Worker Retention Risk Scoring Engine
 *
 * Computes a composite 0–100 risk score from observable operational metrics.
 * IMPORTANT: This engine NEVER takes anonymous feedback as input. Risk scoring
 * is derived exclusively from structural fatigue, dispute, pay, and overtime data
 * to preserve the integrity and safety of the anonymous feedback channel.
 */

/**
 * Computes a worker retention risk score from operational metrics.
 *
 * @param {object} params
 * @param {number} params.fatigueFlags30d - Count of fatigue flags in trailing 30 days.
 * @param {number} params.disputedDays30d - Count of disputed shift days in trailing 30 days.
 * @param {number} params.payMismatches90d - Count of pay mismatches in trailing 90 days.
 * @param {number} params.overtimeShare30d - Overtime as fraction of total hours (0.0–1.0) over 30 days.
 * @returns {{
 *   score: number,
 *   level: 'low' | 'medium' | 'high' | 'critical',
 *   reasons: Array<{ factor: string, points: number, messageKey: string, params: object, message: string }>
 * }}
 */
export function computeRetentionRisk({
  fatigueFlags30d = 0,
  disputedDays30d = 0,
  payMismatches90d = 0,
  overtimeShare30d = 0
}) {
  const reasons = [];
  let score = 0;

  // Fatigue flags: up to 30 points (each flag adds 6 points, capped)
  const fatiguePoints = Math.min(30, Math.max(0, Math.floor(fatigueFlags30d)) * 6);
  if (fatiguePoints > 0) {
    reasons.push({
      factor: 'fatigue',
      points: fatiguePoints,
      messageKey: 'risk.factor.fatigue',
      params: { count: fatigueFlags30d, points: fatiguePoints },
      message: `${fatigueFlags30d} fatigue flag(s) in 30 days contributed ${fatiguePoints} risk points.`
    });
  }
  score += fatiguePoints;

  // Disputed days: up to 25 points (each day adds 5 points, capped)
  const disputePoints = Math.min(25, Math.max(0, Math.floor(disputedDays30d)) * 5);
  if (disputePoints > 0) {
    reasons.push({
      factor: 'disputes',
      points: disputePoints,
      messageKey: 'risk.factor.disputes',
      params: { count: disputedDays30d, points: disputePoints },
      message: `${disputedDays30d} disputed day(s) in 30 days contributed ${disputePoints} risk points.`
    });
  }
  score += disputePoints;

  // Pay mismatches: up to 25 points (each mismatch adds 5 points, capped)
  const payPoints = Math.min(25, Math.max(0, Math.floor(payMismatches90d)) * 5);
  if (payPoints > 0) {
    reasons.push({
      factor: 'pay_mismatches',
      points: payPoints,
      messageKey: 'risk.factor.pay_mismatches',
      params: { count: payMismatches90d, points: payPoints },
      message: `${payMismatches90d} pay mismatch(es) in 90 days contributed ${payPoints} risk points.`
    });
  }
  score += payPoints;

  // Overtime share: up to 20 points (linear scale where 50%+ OT share = max points)
  const clampedShare = Math.max(0, Math.min(1, overtimeShare30d));
  const otPoints = Math.min(20, Math.round(clampedShare * 40));
  if (otPoints > 0) {
    reasons.push({
      factor: 'overtime',
      points: otPoints,
      messageKey: 'risk.factor.overtime',
      params: { share: Math.round(clampedShare * 100), points: otPoints },
      message: `Overtime share of ${Math.round(clampedShare * 100)}% contributed ${otPoints} risk points.`
    });
  }
  score += otPoints;

  // Clamp final score to 0–100
  score = Math.min(100, Math.max(0, score));

  let level = 'low';
  if (score >= 75) level = 'critical';
  else if (score >= 50) level = 'high';
  else if (score >= 25) level = 'medium';

  return { score, level, reasons };
}

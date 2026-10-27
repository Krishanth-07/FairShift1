/**
 * @file Pure Function Wage & Reconciliation Engine
 *
 * Enforces integer-only currency calculations (paise) to prevent floating-point rounding errors.
 * Reconciles worker-recorded shift hours against employer payroll declarations, producing
 * explainable reasons for any pay anomalies.
 */

/**
 * Computes base and overtime wages in integer paise from logged minutes and rate parameters.
 * 1 Rupee = 100 Paise.
 *
 * @param {object} params
 * @param {number} params.hourlyRatePaise - Contractual hourly pay in integer paise.
 * @param {number} params.normalMinutes - Regular minutes worked.
 * @param {number} params.overtimeMinutes - Overtime minutes worked.
 * @param {number} params.overtimeMultiplier - Multiplier for overtime work (e.g., 1.5 or 2.0).
 * @returns {{
 *   lines: Array<{ key: string, minutes: number, ratePaise: number, amountPaise: number, messageKey: string, params: object }>,
 *   totalPaise: number
 * }}
 */
export function computePay({ hourlyRatePaise, normalMinutes = 0, overtimeMinutes = 0, overtimeMultiplier = 1.5 }) {
  if (typeof hourlyRatePaise !== 'number' || hourlyRatePaise < 0) {
    throw new Error('hourlyRatePaise must be a non-negative integer.');
  }

  // Integer arithmetic: convert minutes to hours by multiplying first, then dividing by 60 with rounding
  const normalAmountPaise = Math.round((Math.max(0, normalMinutes) * hourlyRatePaise) / 60);

  const effectiveOtRatePaise = Math.round(hourlyRatePaise * overtimeMultiplier);
  const overtimeAmountPaise = Math.round((Math.max(0, overtimeMinutes) * hourlyRatePaise * overtimeMultiplier) / 60);

  const lines = [
    {
      key: 'normal',
      minutes: Math.max(0, normalMinutes),
      ratePaise: hourlyRatePaise,
      amountPaise: normalAmountPaise,
      messageKey: 'pay.line.normal',
      params: {
        minutes: Math.max(0, normalMinutes),
        ratePaise: hourlyRatePaise
      }
    },
    {
      key: 'overtime',
      minutes: Math.max(0, overtimeMinutes),
      ratePaise: effectiveOtRatePaise,
      amountPaise: overtimeAmountPaise,
      messageKey: 'pay.line.overtime',
      params: {
        minutes: Math.max(0, overtimeMinutes),
        multiplier: overtimeMultiplier,
        ratePaise: effectiveOtRatePaise
      }
    }
  ];

  return {
    lines,
    totalPaise: normalAmountPaise + overtimeAmountPaise
  };
}

/**
 * Reconciles independently logged worker shift records against employer payroll summaries.
 * Generates an explainable structured audit record with clear status and reasons.
 *
 * @param {object} params
 * @param {{ normalMinutes: number, overtimeMinutes: number }} params.logged - Worker shift hours.
 * @param {{ normalMinutes: number, overtimeMinutes: number }} params.payroll - Employer payroll records.
 * @param {number} params.hourlyRatePaise - Agreed base hourly rate in paise.
 * @param {number} [params.overtimeMultiplier=1.5] - Overtime wage multiplier.
 * @param {number} [params.toleranceMinutes=0] - Acceptable grace margin before flagging variance.
 * @returns {{
 *   status: 'match' | 'underpaid' | 'overpaid',
 *   diffNormalMinutes: number,
 *   diffOvertimeMinutes: number,
 *   owedPaise: number,
 *   reasons: Array<{ ruleId: string, messageKey: string, params: object, message: string }>
 * }}
 */
export function reconcile({
  logged,
  payroll,
  hourlyRatePaise,
  overtimeMultiplier = 1.5,
  toleranceMinutes = 0
}) {
  if (!logged || !payroll) {
    throw new Error('reconcile requires both logged and payroll data structures.');
  }

  const loggedNormal = Math.max(0, logged.normalMinutes || 0);
  const loggedOt = Math.max(0, logged.overtimeMinutes || 0);
  const payrollNormal = Math.max(0, payroll.normalMinutes || 0);
  const payrollOt = Math.max(0, payroll.overtimeMinutes || 0);

  const diffNormalMinutes = loggedNormal - payrollNormal;
  const diffOvertimeMinutes = loggedOt - payrollOt;

  const loggedPay = computePay({
    hourlyRatePaise,
    normalMinutes: loggedNormal,
    overtimeMinutes: loggedOt,
    overtimeMultiplier
  }).totalPaise;

  const payrollPay = computePay({
    hourlyRatePaise,
    normalMinutes: payrollNormal,
    overtimeMinutes: payrollOt,
    overtimeMultiplier
  }).totalPaise;

  // Positive owedPaise indicates the worker performed uncompensated work (underpaid)
  const owedPaise = loggedPay - payrollPay;
  const totalDiscrepancyMinutes = Math.abs(diffNormalMinutes) + Math.abs(diffOvertimeMinutes);

  const reasons = [];
  let status = 'match';

  // Evaluate if variance falls within the configured tolerance threshold
  if (totalDiscrepancyMinutes <= toleranceMinutes || (owedPaise === 0 && totalDiscrepancyMinutes === 0)) {
    status = 'match';
    reasons.push({
      ruleId: 'PAY_RECONCILE_MATCH',
      messageKey: 'rules.reconcile.match',
      params: {
        toleranceMinutes,
        diffMinutes: totalDiscrepancyMinutes,
        owedPaise
      },
      message: totalDiscrepancyMinutes === 0
        ? 'Payroll matches verified work records exactly.'
        : `Discrepancy of ${totalDiscrepancyMinutes} minutes is within allowed tolerance of ${toleranceMinutes} minutes.`
    });
  } else if (owedPaise > 0) {
    status = 'underpaid';
    reasons.push({
      ruleId: 'PAY_RECONCILE_UNDERPAID',
      messageKey: 'rules.reconcile.underpaid',
      params: {
        owedPaise,
        diffNormalMinutes,
        diffOvertimeMinutes
      },
      message: `Worker is underpaid by ₹${(owedPaise / 100).toFixed(2)} (${owedPaise} paise) across ${diffNormalMinutes} normal and ${diffOvertimeMinutes} overtime minutes.`
    });
  } else {
    status = 'overpaid';
    reasons.push({
      ruleId: 'PAY_RECONCILE_OVERPAID',
      messageKey: 'rules.reconcile.overpaid',
      params: {
        overpaidPaise: Math.abs(owedPaise),
        diffNormalMinutes,
        diffOvertimeMinutes
      },
      message: `Worker has been credited ₹${(Math.abs(owedPaise) / 100).toFixed(2)} (${Math.abs(owedPaise)} paise) above logged shift records.`
    });
  }

  return {
    status,
    diffNormalMinutes,
    diffOvertimeMinutes,
    owedPaise,
    reasons
  };
}

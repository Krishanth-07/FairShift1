/**
 * @file Payslip & Discrepancy Reconciliation Service
 *
 * Reconstructs monthly work sessions from verified hash-chain records,
 * computes contractual base and overtime wages in integer paise, reconciles
 * against employer payroll declarations, and attaches historical audit logs.
 */

import { getIndustry } from '../config/industries.js';
import { pairRecords, summarizePeriod } from '../engine/hours.js';
import { computePay, reconcile } from '../engine/pay.js';
import { AppError } from '../middleware/errors.js';

/**
 * Creates payslip service.
 *
 * @param {object} dependencies
 * @param {object} dependencies.config - Application config.
 * @param {object} dependencies.repo - Memory repository.
 * @param {object} dependencies.clock - Clock abstraction.
 * @returns {object} Payslip service methods.
 */
export function createPayslipService({ config, repo, clock }) {
  /**
   * Builds an explainable monthly payslip with reconciliation details.
   *
   * @param {string} workerId - Unique worker identifier.
   * @param {string} period - Target month in "YYYY-MM" format.
   * @returns {object} Structured payslip breakdown.
   */
  function buildPayslip(workerId, period) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new AppError(
        400,
        'INVALID_PERIOD',
        'errors.payslip.invalid_period',
        'Period must follow the "YYYY-MM" format.'
      );
    }

    const worker = repo.getUser(workerId);
    if (!worker) {
      throw new AppError(404, 'USER_NOT_FOUND', 'errors.auth.user_not_found', 'Worker not found.');
    }

    const site = repo.getSite(worker.siteId);
    if (!site) {
      throw new AppError(404, 'SITE_NOT_FOUND', 'errors.site.not_found', 'Associated site not found.');
    }

    const industry = getIndustry(site.industryId);

    // 1. Reconstruct paired work sessions from the worker's verified chain
    const chainRecords = repo.getRecords(workerId);
    const punches = chainRecords.map((r) => r.payload || r);
    const { sessions } = pairRecords(punches);

    // 2. Filter sessions starting in the requested calendar month
    const monthSessions = sessions.filter((s) => {
      return s.inTs && s.inTs.startsWith(period);
    });

    const periodSummary = summarizePeriod(
      monthSessions,
      industry,
      config.TZ_OFFSET_MINUTES,
      clock.now()
    );

    const loggedTotals = {
      normalMinutes: periodSummary.totals.normalMinutes,
      overtimeMinutes: periodSummary.totals.overtimeMinutes
    };

    // 3. Load employer payroll records for the month
    const startDate = `${period}-01`;
    const endDate = `${period}-31`;
    const payrollEntries = repo.getPayrollRange(workerId, startDate, endDate);

    const payrollTotals = payrollEntries.reduce(
      (acc, entry) => ({
        normalMinutes: acc.normalMinutes + (entry.normalMinutes || 0),
        overtimeMinutes: acc.overtimeMinutes + (entry.overtimeMinutes || 0)
      }),
      { normalMinutes: 0, overtimeMinutes: 0 }
    );

    // 4. Compute verified earnings based on logged hours
    const payResult = computePay({
      hourlyRatePaise: worker.hourlyRatePaise || 0,
      normalMinutes: loggedTotals.normalMinutes,
      overtimeMinutes: loggedTotals.overtimeMinutes,
      overtimeMultiplier: industry.overtimeMultiplier
    });

    // 5. Reconcile verified logs against employer payroll declaration
    const reconciliation = reconcile({
      logged: loggedTotals,
      payroll: payrollTotals,
      hourlyRatePaise: worker.hourlyRatePaise || 0,
      overtimeMultiplier: industry.overtimeMultiplier,
      toleranceMinutes: industry.reconcileToleranceMinutes
    });

    // 6. Gather all auditLog entries touching this worker's payroll for the month
    const auditEntries = repo.getAuditLog().filter((entry) => {
      return (
        entry.workerId === workerId &&
        entry.date &&
        entry.date.startsWith(period)
      );
    });

    return {
      workerId,
      period,
      currency: industry.currency,
      hourlyRatePaise: worker.hourlyRatePaise,
      days: periodSummary.days,
      lines: payResult.lines,
      totalPaise: payResult.totalPaise,
      reconciliation,
      owedPaise: reconciliation.owedPaise,
      payrollEntries,
      auditLog: auditEntries
    };
  }

  return {
    buildPayslip
  };
}

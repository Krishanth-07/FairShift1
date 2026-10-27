/**
 * @file Worker Advocate Advisory Service
 *
 * Assembles multi-signal operational data (fatigue flags, pay reconciliation,
 * operational anomalies, site hazard escalations) and invokes the pure advocate
 * decision engine to produce a unified, prioritized worker advisory.
 */

import { getIndustry } from '../config/industries.js';
import { pairRecords } from '../engine/hours.js';
import { evaluateFatigue } from '../engine/fatigue.js';
import { detectAnomalies } from '../engine/anomaly.js';
import { evaluateEscalation } from '../engine/escalation.js';
import { advise } from '../engine/advocate.js';
import { AppError } from '../middleware/errors.js';

/**
 * Creates advice service.
 *
 * @param {object} dependencies
 * @param {object} dependencies.config - Application config.
 * @param {object} dependencies.repo - Memory repository.
 * @param {object} dependencies.clock - Clock abstraction.
 * @param {object} dependencies.payslipService - Payslip service instance.
 * @returns {object}
 */
export function createAdviceService({ config, repo, clock, payslipService }) {
  /**
   * Evaluates all operational signals for a worker and produces a prioritized advisory.
   *
   * @param {string} workerId - Worker ID.
   * @returns {object} Structured advisory output from engine/advocate.
   */
  function getWorkerAdvice(workerId) {
    const worker = repo.getUser(workerId);
    if (!worker) {
      throw new AppError(404, 'USER_NOT_FOUND', 'errors.auth.user_not_found', 'Worker not found.');
    }

    const site = repo.getSite(worker.siteId);
    if (!site) {
      throw new AppError(404, 'SITE_NOT_FOUND', 'errors.site.not_found', 'Site not found.');
    }

    const industry = getIndustry(site.industryId);

    // 1. Gather work sessions and evaluate fatigue
    const chainRecords = repo.getRecords(workerId);
    const punches = chainRecords.map((r) => r.payload || r);
    const { sessions } = pairRecords(punches);

    const fatigue = evaluateFatigue({
      sessions,
      industry,
      now: clock.now(),
      tzOffsetMinutes: config.TZ_OFFSET_MINUTES
    });

    // 2. Evaluate reconciliation for the current period
    const currentPeriod = clock.now().slice(0, 7);
    let reconciliation = null;
    try {
      const payslip = payslipService.buildPayslip(workerId, currentPeriod);
      reconciliation = payslip.reconciliation;
    } catch {
      reconciliation = null;
    }

    // 3. Detect operational anomalies
    const anomalies = detectAnomalies({
      records: punches,
      sessions,
      serverNowIso: clock.now(),
      industry,
      tzOffsetMinutes: config.TZ_OFFSET_MINUTES
    });

    // 4. Check for active escalated reports at this worker's site
    const siteReports = repo.getReportsBySite(worker.siteId);
    const escalatedReports = siteReports.map((report) => {
      return evaluateEscalation({
        severity: report.severity,
        createdAtIso: report.createdAt,
        status: report.status,
        nowIso: clock.now(),
        industry
      });
    });

    // 5. Invoke pure advocate engine
    return advise({
      industry,
      fatigue,
      reconciliation,
      anomalies,
      escalatedReports
    });
  }

  return {
    getWorkerAdvice
  };
}

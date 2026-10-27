/**
 * @file Employer / Site Admin Management Service
 *
 * Provides site-level workforce oversight: attendance rollups, explainable fatigue flags,
 * operational anomalies, retention risk scoring (strictly independent of feedback),
 * cryptographic chain verification, and auditable payroll / day-status modifications.
 */

import { getIndustry } from '../config/industries.js';
import { pairRecords, sessionMinutes } from '../engine/hours.js';
import { evaluateFatigue } from '../engine/fatigue.js';
import { detectAnomalies, detectCloneCheckins } from '../engine/anomaly.js';
import { computeRetentionRisk } from '../engine/risk.js';
import { verifyChain } from '../engine/chain.js';
import { generateSiteCode } from '../engine/siteCode.js';
import { AppError } from '../middleware/errors.js';

/**
 * Creates admin service.
 *
 * @param {object} dependencies
 * @param {object} dependencies.config - Application config.
 * @param {object} dependencies.repo - Memory repository.
 * @param {object} dependencies.clock - Clock abstraction.
 * @param {object} dependencies.reportService - Report service.
 * @param {object} dependencies.feedbackService - Feedback service.
 * @returns {object}
 */
export function createAdminService({ config, repo, clock, reportService, feedbackService }) {
  /**
   * Generates a 360-degree operational overview for an employer dashboard.
   *
   * @param {string} siteId - Admin's scoped site ID.
   * @returns {object}
   */
  function overview(siteId) {
    const site = repo.getSite(siteId);
    if (!site) {
      throw new AppError(404, 'SITE_NOT_FOUND', 'errors.site.not_found', 'Site not found.');
    }

    const industry = getIndustry(site.industryId);
    const workers = repo.getUsersBySite(siteId).filter((u) => u.role === 'worker');

    // 1. Attendance & Fatigue Evaluation across site workers
    let activeOpenSessions = 0;
    const fatigueAlerts = [];
    const retentionRisks = [];
    const allSitePunches = [];
    const allSiteSessions = [];

    const nowIso = clock.now();
    const thirtyDaysAgoMs = new Date(nowIso).getTime() - 30 * 24 * 3600 * 1000;
    const ninetyDaysAgoMs = new Date(nowIso).getTime() - 90 * 24 * 3600 * 1000;

    for (const worker of workers) {
      const chainRecords = repo.getRecords(worker.id);
      const punches = chainRecords.map((r) => r.payload || r);
      allSitePunches.push(...punches);

      const { sessions } = pairRecords(punches);
      allSiteSessions.push(...sessions);

      // Check open sessions
      const openSession = sessions.find((s) => s.outTs === null);
      if (openSession) {
        activeOpenSessions += 1;
      }

      // Fatigue evaluation
      const fatigue = evaluateFatigue({
        sessions,
        industry,
        now: nowIso,
        tzOffsetMinutes: config.TZ_OFFSET_MINUTES
      });

      if (fatigue.level !== 'ok') {
        fatigueAlerts.push({
          workerId: worker.id,
          workerName: worker.name,
          level: fatigue.level,
          flags: fatigue.flags
        });
      }

      // Retention risk calculation (DERIVED EXCLUSIVELY FROM OPERATIONAL DATA, NEVER FEEDBACK)
      const fatigueFlags30d = fatigue.flags.length;

      // Disputed days in trailing 30 days
      let disputedDays30d = 0;
      for (const s of sessions) {
        const inMs = new Date(s.inTs).getTime();
        if (inMs >= thirtyDaysAgoMs) {
          const date = s.inTs.slice(0, 10);
          const dayStatus = repo.getDayStatus(worker.id, date);
          if (dayStatus && dayStatus.status === 'disputed') {
            disputedDays30d += 1;
          }
        }
      }

      // Pay mismatches in trailing 90 days
      let payMismatches90d = 0;
      const ninetyDaysAgoDate = new Date(ninetyDaysAgoMs).toISOString().slice(0, 10);
      const todayDate = nowIso.slice(0, 10);
      const payrollRange = repo.getPayrollRange(worker.id, ninetyDaysAgoDate, todayDate);
      if (payrollRange.length > 0) {
        // Compare payroll days with sessions
        for (const p of payrollRange) {
          const daySessions = sessions.filter((s) => s.inTs && s.inTs.slice(0, 10) === p.date);
          const totalMins = daySessions.reduce((acc, s) => acc + sessionMinutes(s, nowIso), 0);
          const normalCapMins = Math.round(industry.normalDailyHours * 60);
          const expectedNormal = Math.min(totalMins, normalCapMins);
          const expectedOt = Math.max(0, totalMins - normalCapMins);

          if (p.normalMinutes !== expectedNormal || p.overtimeMinutes !== expectedOt) {
            payMismatches90d += 1;
          }
        }
      }

      // Overtime share in trailing 30 days
      let totalMinutes30d = 0;
      let overtimeMinutes30d = 0;
      const normalCap = Math.round(industry.normalDailyHours * 60);

      for (const s of sessions) {
        const inMs = new Date(s.inTs).getTime();
        if (inMs >= thirtyDaysAgoMs) {
          const dur = sessionMinutes(s, nowIso);
          totalMinutes30d += dur;
          if (dur > normalCap) {
            overtimeMinutes30d += (dur - normalCap);
          }
        }
      }

      const overtimeShare30d = totalMinutes30d > 0 ? (overtimeMinutes30d / totalMinutes30d) : 0;

      const risk = computeRetentionRisk({
        fatigueFlags30d,
        disputedDays30d,
        payMismatches90d,
        overtimeShare30d
      });

      retentionRisks.push({
        workerId: worker.id,
        workerName: worker.name,
        score: risk.score,
        level: risk.level,
        reasons: risk.reasons
      });
    }

    // 2. Operational Anomalies (site-wide)
    const anomalies = detectAnomalies({
      records: allSitePunches,
      sessions: allSiteSessions,
      serverNowIso: nowIso,
      industry,
      tzOffsetMinutes: config.TZ_OFFSET_MINUTES
    });

    const cloneCheckinFlags = detectCloneCheckins(allSitePunches);
    anomalies.push(...cloneCheckinFlags);

    // 3. Site Hazard Reports (escalated first)
    const reports = reportService.listReports(siteId, industry);

    // 4. Feedback Sentiment Aggregate (k-anonymity applied)
    const feedbackAggregate = feedbackService.getAggregate(siteId);

    // 5. Cryptographic Chain Integrity across all workers
    const chainIntegrity = verifyAllChains(siteId);

    // 6. Current Rotating Site Code
    const currentSiteCode = getCurrentSiteCode(siteId);

    return {
      site: {
        id: site.id,
        name: site.name,
        industryId: site.industryId,
        location: site.location
      },
      attendance: {
        totalWorkers: workers.length,
        activeOpenSessions,
        currentSiteCode
      },
      fatigueAlerts,
      anomalies,
      reports,
      feedbackAggregate,
      retentionRisks: retentionRisks.sort((a, b) => b.score - a.score),
      chainIntegrity
    };
  }

  /**
   * Confirms or disputes a worker's logged shift day.
   *
   * @param {string} workerId - Worker ID.
   * @param {string} date - Date YYYY-MM-DD.
   * @param {'confirmed' | 'disputed'} status - Status.
   * @param {string} [reason] - Optional reason.
   * @param {string} adminId - Acting admin user ID.
   * @returns {object} Updated status record.
   */
  function setDayStatus(workerId, date, status, reason, adminId) {
    if (!['confirmed', 'disputed'].includes(status)) {
      throw new AppError(400, 'INVALID_STATUS', 'errors.admin.invalid_status', 'Status must be confirmed or disputed.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, 'INVALID_DATE', 'errors.admin.invalid_date', 'Date must be YYYY-MM-DD.');
    }

    const worker = repo.getUser(workerId);
    if (!worker) {
      throw new AppError(404, 'WORKER_NOT_FOUND', 'errors.admin.worker_not_found', 'Worker not found.');
    }

    const statusObj = {
      status,
      reason: reason ? String(reason).trim() : '',
      updatedBy: adminId,
      updatedAt: clock.now()
    };

    repo.putDayStatus(workerId, date, statusObj);

    repo.appendAudit({
      action: 'DAY_STATUS_UPDATE',
      workerId,
      date,
      status,
      reason,
      adminId,
      timestamp: clock.now()
    });

    return statusObj;
  }

  /**
   * Sets employer payroll minutes for a worker on a specific date, writing an auditLog entry.
   *
   * @param {string} workerId - Worker ID.
   * @param {string} date - Date string YYYY-MM-DD.
   * @param {number} normalMinutes - Regular paid minutes.
   * @param {number} overtimeMinutes - Overtime paid minutes.
   * @param {string} adminId - Acting admin user ID.
   * @returns {object} Updated payroll record.
   */
  function setPayroll(workerId, date, normalMinutes, overtimeMinutes, adminId) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, 'INVALID_DATE', 'errors.admin.invalid_date', 'Date must be YYYY-MM-DD.');
    }
    const norm = Math.max(0, Math.floor(Number(normalMinutes) || 0));
    const ot = Math.max(0, Math.floor(Number(overtimeMinutes) || 0));

    const worker = repo.getUser(workerId);
    if (!worker) {
      throw new AppError(404, 'WORKER_NOT_FOUND', 'errors.admin.worker_not_found', 'Worker not found.');
    }

    const before = repo.getPayroll(workerId, date) || { normalMinutes: 0, overtimeMinutes: 0 };
    const after = { normalMinutes: norm, overtimeMinutes: ot };

    repo.putPayroll(workerId, date, after);

    repo.appendAudit({
      action: 'PAYROLL_EDIT',
      workerId,
      date,
      before,
      after,
      adminId,
      timestamp: clock.now()
    });

    return after;
  }

  /**
   * Verifies hash-chain continuity and payload hashes for all workers assigned to a site.
   *
   * @param {string} siteId - Site ID.
   * @returns {{ allValid: boolean, workersChecked: number, brokenChains: Array<object> }}
   */
  function verifyAllChains(siteId) {
    const workers = repo.getUsersBySite(siteId).filter((u) => u.role === 'worker');
    const brokenChains = [];

    for (const worker of workers) {
      const records = repo.getRecords(worker.id);
      const result = verifyChain(records);
      if (!result.valid) {
        brokenChains.push({
          workerId: worker.id,
          workerName: worker.name,
          brokenAtIndex: result.brokenAtIndex,
          reason: result.reason
        });
      }
    }

    return {
      allValid: brokenChains.length === 0,
      workersChecked: workers.length,
      brokenChains
    };
  }

  /**
   * Generates the active rotating site code for frontline check-in verification.
   *
   * @param {string} siteId - Site ID.
   * @returns {{ siteId: string, code: string, expiresAt: string, windowSeconds: number }}
   */
  function getCurrentSiteCode(siteId) {
    const tsMs = new Date(clock.now()).getTime();
    const windowMs = 300000; // 5-minute window
    const code = generateSiteCode(config.SITE_SECRET, siteId, tsMs, windowMs);
    const windowEndMs = Math.floor(tsMs / windowMs) * windowMs + windowMs;

    return {
      siteId,
      code,
      expiresAt: new Date(windowEndMs).toISOString(),
      windowSeconds: 300
    };
  }

  return {
    overview,
    setDayStatus,
    setPayroll,
    verifyAllChains,
    getCurrentSiteCode
  };
}

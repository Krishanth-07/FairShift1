/**
 * @file Worker Self-Service API Routes
 *
 * Exposes shift check-ins, offline batch synchronization, status checks,
 * explainable payslips, real-time advocate advisory, hazard reporting,
 * anonymous pulse feedback, and shift day dispute submissions.
 * Strictly enforces worker role authorization.
 */

import { Router } from 'express';
import { getIndustry } from '../config/industries.js';
import { pairRecords } from '../engine/hours.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { reportsLimiter, feedbackLimiter } from '../middleware/rateLimits.js';
import { AppError } from '../middleware/errors.js';

/**
 * Creates worker routes router.
 *
 * @param {object} dependencies
 * @param {object} dependencies.config - Application config.
 * @param {object} dependencies.repo - Repository instance.
 * @param {object} dependencies.clock - Clock abstraction.
 * @param {object} dependencies.recordService - Record service.
 * @param {object} dependencies.payslipService - Payslip service.
 * @param {object} dependencies.adviceService - Advice service.
 * @param {object} dependencies.reportService - Report service.
 * @param {object} dependencies.feedbackService - Feedback service.
 * @returns {Router}
 */
export function createWorkerRoutes({
  config,
  repo,
  clock,
  recordService,
  payslipService,
  adviceService,
  reportService,
  feedbackService
}) {
  const router = Router();
  const workerAuth = requireAuth({ config, repo, role: 'worker' });

  // ─── POST /api/records ──────────────────────────────────────
  router.post(
    '/api/records',
    workerAuth,
    validateBody({
      type: { required: true, type: 'string', enum: ['in', 'out'] },
      clientTs: { required: true, type: 'string' },
      clientId: { required: true, type: 'string', min: 1, max: 128 },
      siteCode: { required: true, type: 'string', min: 6, max: 6 }
    }),
    async (req, res, next) => {
      try {
        const result = await recordService.createRecord({
          worker: req.user,
          type: req.body.type,
          clientTs: req.body.clientTs,
          clientId: req.body.clientId,
          siteCode: req.body.siteCode
        });
        res.status(result.duplicate ? 200 : 201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── POST /api/records/sync ─────────────────────────────────
  router.post(
    '/api/records/sync',
    workerAuth,
    validateBody({
      items: { required: true, type: 'array' }
    }),
    async (req, res, next) => {
      try {
        const result = await recordService.syncBatch(req.user, req.body.items);
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── GET /api/me/status ─────────────────────────────────────
  router.get('/api/me/status', workerAuth, (req, res) => {
    const rawRecords = repo.getRecords(req.user.id);
    const punches = rawRecords.map((r) => r.payload || r);
    const { sessions } = pairRecords(punches);

    const activeSession = sessions.find((s) => s.outTs === null) || null;
    const completedSessions = sessions.filter((s) => s.outTs !== null);

    res.json({
      worker: {
        id: req.user.id,
        name: req.user.name,
        siteId: req.user.siteId,
        role: req.user.role,
        lang: req.user.lang
      },
      activeSession,
      completedSessionsCount: completedSessions.length,
      totalPunches: rawRecords.length,
      latestPunch: rawRecords.length > 0 ? rawRecords[rawRecords.length - 1] : null
    });
  });

  // ─── GET /api/me/payslip?period=YYYY-MM ─────────────────────
  router.get('/api/me/payslip', workerAuth, (req, res, next) => {
    try {
      const period = req.query.period || clock.now().slice(0, 7);
      const payslip = payslipService.buildPayslip(req.user.id, period);
      res.json(payslip);
    } catch (err) {
      next(err);
    }
  });

  // ─── GET /api/me/advice ─────────────────────────────────────
  router.get('/api/me/advice', workerAuth, (req, res, next) => {
    try {
      const advisory = adviceService.getWorkerAdvice(req.user.id);
      res.json(advisory);
    } catch (err) {
      next(err);
    }
  });

  // ─── POST /api/reports ──────────────────────────────────────
  router.post(
    '/api/reports',
    workerAuth,
    reportsLimiter,
    validateBody({
      text: { required: true, type: 'string', min: 1, max: 10000 },
      category: { type: 'string' }
    }),
    (req, res, next) => {
      try {
        const site = repo.getSite(req.user.siteId);
        if (!site) {
          throw new AppError(404, 'SITE_NOT_FOUND', 'errors.site.not_found', 'Worker site not found.');
        }
        const industry = getIndustry(site.industryId);

        const report = reportService.createReport({
          text: req.body.text,
          category: req.body.category,
          siteId: req.user.siteId,
          industry
        });

        res.status(201).json(report);
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── GET /api/reports/:code ─────────────────────────────────
  router.get('/api/reports/:code', (req, res, next) => {
    try {
      const report = reportService.getReportByCode(req.params.code);
      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  // ─── POST /api/feedback ─────────────────────────────────────
  router.post(
    '/api/feedback',
    workerAuth,
    feedbackLimiter,
    validateBody({
      targetType: { required: true, type: 'string', enum: ['manager', 'policy', 'conditions'] },
      rating: { required: true, type: 'number', min: 1, max: 5 },
      tags: { type: 'array' },
      comment: { type: 'string', max: 2000 }
    }),
    (req, res, next) => {
      try {
        const result = feedbackService.submitFeedback(req.user, {
          targetType: req.body.targetType,
          rating: req.body.rating,
          tags: req.body.tags,
          comment: req.body.comment
        });
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── POST /api/me/days/:date/dispute ────────────────────────
  router.post(
    '/api/me/days/:date/dispute',
    workerAuth,
    validateBody({
      reason: { required: true, type: 'string', min: 1, max: 500 }
    }),
    (req, res, next) => {
      try {
        const { date } = req.params;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new AppError(400, 'INVALID_DATE', 'errors.dispute.invalid_date', 'Date must be YYYY-MM-DD.');
        }

        const disputeObj = {
          status: 'disputed',
          reason: req.body.reason.trim(),
          disputedBy: req.user.id,
          disputedAt: clock.now()
        };

        repo.putDayStatus(req.user.id, date, disputeObj);

        repo.appendAudit({
          action: 'DAY_DISPUTED_BY_WORKER',
          workerId: req.user.id,
          date,
          reason: req.body.reason.trim(),
          timestamp: clock.now()
        });

        res.json({
          success: true,
          date,
          status: 'disputed',
          reason: req.body.reason.trim()
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

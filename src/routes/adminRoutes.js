/**
 * @file Employer & Site Admin API Routes
 *
 * Exposes site overview metrics, real-time rotating site codes, hazard report triage workflows,
 * auditable payroll amendments, shift day confirmations/disputes, and cryptographic integrity audits.
 * Strictly enforces admin role and scopes all operations to req.user.siteId.
 */

import { Router } from 'express';
import { getIndustry } from '../config/industries.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../middleware/errors.js';

/**
 * Creates admin routes router.
 *
 * @param {object} dependencies
 * @param {object} dependencies.config - Application config.
 * @param {object} dependencies.repo - Repository instance.
 * @param {object} dependencies.adminService - Admin service.
 * @param {object} dependencies.reportService - Report service.
 * @returns {Router}
 */
export function createAdminRoutes({ config, repo, adminService, reportService }) {
  const router = Router();
  const adminAuth = requireAuth({ config, repo, role: 'admin' });

  // ─── GET /api/admin/overview ────────────────────────────────
  router.get('/api/admin/overview', adminAuth, (req, res, next) => {
    try {
      // Scoped strictly to the authenticated admin's siteId
      const data = adminService.overview(req.user.siteId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // ─── GET /api/admin/site-code ───────────────────────────────
  router.get('/api/admin/site-code', adminAuth, (req, res, next) => {
    try {
      const data = adminService.getCurrentSiteCode(req.user.siteId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // ─── GET /api/admin/reports ─────────────────────────────────
  router.get('/api/admin/reports', adminAuth, (req, res, next) => {
    try {
      const site = repo.getSite(req.user.siteId);
      if (!site) {
        throw new AppError(404, 'SITE_NOT_FOUND', 'errors.site.not_found', 'Site not found.');
      }
      const industry = getIndustry(site.industryId);
      const reports = reportService.listReports(req.user.siteId, industry);
      res.json(reports);
    } catch (err) {
      next(err);
    }
  });

  // ─── PATCH /api/admin/reports/:id ───────────────────────────
  router.patch(
    '/api/admin/reports/:id',
    adminAuth,
    validateBody({
      status: { required: true, type: 'string' },
      note: { type: 'string' }
    }),
    (req, res, next) => {
      try {
        const report = repo.getReport(req.params.id);
        if (!report) {
          throw new AppError(404, 'REPORT_NOT_FOUND', 'errors.reports.not_found', 'Report not found.');
        }

        // Cross-tenant boundary check: admin can only modify reports belonging to their site
        if (report.siteId !== req.user.siteId) {
          throw new AppError(
            403,
            'FORBIDDEN_SITE',
            'errors.auth.forbidden_site',
            'Cannot modify reports belonging to another facility or site.'
          );
        }

        const updated = reportService.updateStatus(
          req.params.id,
          req.body.status,
          req.user.id,
          req.body.note
        );

        res.json(updated);
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── PUT /api/admin/payroll ─────────────────────────────────
  router.put(
    '/api/admin/payroll',
    adminAuth,
    validateBody({
      workerId: { required: true, type: 'string' },
      date: { required: true, type: 'string' },
      normalMinutes: { required: true, type: 'number' },
      overtimeMinutes: { required: true, type: 'number' }
    }),
    (req, res, next) => {
      try {
        const targetWorker = repo.getUser(req.body.workerId);
        if (!targetWorker) {
          throw new AppError(404, 'WORKER_NOT_FOUND', 'errors.admin.worker_not_found', 'Target worker not found.');
        }

        // Cross-tenant boundary check: worker must belong to admin's site
        if (targetWorker.siteId !== req.user.siteId) {
          throw new AppError(
            403,
            'FORBIDDEN_SITE',
            'errors.auth.forbidden_site',
            'Cannot modify payroll for a worker assigned to another site.'
          );
        }

        const updated = adminService.setPayroll(
          req.body.workerId,
          req.body.date,
          req.body.normalMinutes,
          req.body.overtimeMinutes,
          req.user.id
        );

        res.json({
          success: true,
          workerId: req.body.workerId,
          date: req.body.date,
          payroll: updated
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── POST /api/admin/days/confirm ───────────────────────────
  router.post(
    '/api/admin/days/confirm',
    adminAuth,
    validateBody({
      workerId: { required: true, type: 'string' },
      date: { required: true, type: 'string' },
      reason: { type: 'string' }
    }),
    (req, res, next) => {
      try {
        const targetWorker = repo.getUser(req.body.workerId);
        if (!targetWorker || targetWorker.siteId !== req.user.siteId) {
          throw new AppError(403, 'FORBIDDEN_SITE', 'errors.auth.forbidden_site', 'Worker belongs to another site.');
        }

        const result = adminService.setDayStatus(
          req.body.workerId,
          req.body.date,
          'confirmed',
          req.body.reason,
          req.user.id
        );

        res.json({ success: true, status: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── POST /api/admin/days/dispute ───────────────────────────
  router.post(
    '/api/admin/days/dispute',
    adminAuth,
    validateBody({
      workerId: { required: true, type: 'string' },
      date: { required: true, type: 'string' },
      reason: { required: true, type: 'string' }
    }),
    (req, res, next) => {
      try {
        const targetWorker = repo.getUser(req.body.workerId);
        if (!targetWorker || targetWorker.siteId !== req.user.siteId) {
          throw new AppError(403, 'FORBIDDEN_SITE', 'errors.auth.forbidden_site', 'Worker belongs to another site.');
        }

        const result = adminService.setDayStatus(
          req.body.workerId,
          req.body.date,
          'disputed',
          req.body.reason,
          req.user.id
        );

        res.json({ success: true, status: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── GET /api/admin/integrity ───────────────────────────────
  router.get('/api/admin/integrity', adminAuth, (req, res, next) => {
    try {
      const integrity = adminService.verifyAllChains(req.user.siteId);
      res.json(integrity);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * @file Express Application Factory
 *
 * Configures middleware, static asset routing, service dependencies, and API route mounting.
 * Does not bind or listen on ports; returns pure configured app instance for testing and server bootstrap.
 */

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applySecurityMiddleware } from './middleware/security.js';
import { generalLimiter } from './middleware/rateLimits.js';
import { notFoundHandler, errorHandler } from './middleware/errors.js';

import { createRecordService } from './services/recordService.js';
import { createPayslipService } from './services/payslipService.js';
import { createAdviceService } from './services/adviceService.js';
import { createReportService } from './services/reportService.js';
import { createFeedbackService } from './services/feedbackService.js';
import { createAdminService } from './services/adminService.js';

import { createAuthRoutes } from './routes/authRoutes.js';
import { createWorkerRoutes } from './routes/workerRoutes.js';
import { createAdminRoutes } from './routes/adminRoutes.js';
import { createPublicRoutes } from './routes/publicRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, '..', 'public');

/**
 * Creates and configures the Express application with all services and route layers.
 *
 * @param {object} dependencies
 * @param {object} dependencies.config - Application configuration.
 * @param {object} dependencies.repo - Data repository.
 * @param {object} dependencies.clock - Clock abstraction.
 * @returns {express.Express}
 */
export function createApp({ config, repo, clock }) {
  const app = express();

  // Apply transport, header, and body parsing security
  applySecurityMiddleware(app);

  // General traffic rate limiter
  app.use(generalLimiter);

  // Serve static UI assets from public directory
  app.use(express.static(PUBLIC_DIR));

  // Instantiate service layer
  const recordService = createRecordService({ config, repo, clock });
  const payslipService = createPayslipService({ config, repo, clock });
  const adviceService = createAdviceService({ config, repo, clock, payslipService });
  const reportService = createReportService({ repo, clock });
  const feedbackService = createFeedbackService({ config, repo, clock });
  const adminService = createAdminService({ config, repo, clock, reportService, feedbackService });

  // Mount API routes
  app.use(createPublicRoutes({ clock }));
  app.use(createAuthRoutes({ config, repo, clock }));
  app.use(
    createWorkerRoutes({
      config,
      repo,
      clock,
      recordService,
      payslipService,
      adviceService,
      reportService,
      feedbackService
    })
  );
  app.use(
    createAdminRoutes({
      config,
      repo,
      adminService,
      reportService
    })
  );

  // Fallback 404 handler for unknown routes
  app.use(notFoundHandler);

  // Central sanitized error handler
  app.use(errorHandler);

  return app;
}

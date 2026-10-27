/**
 * @file Express Application Factory
 *
 * Configures middleware, static asset routing, and API route mounting.
 * Does not bind or listen on ports; returns pure configured app instance for testing and server bootstrap.
 */

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applySecurityMiddleware } from './middleware/security.js';
import { generalLimiter } from './middleware/rateLimits.js';
import { notFoundHandler, errorHandler } from './middleware/errors.js';
import { createAuthRoutes } from './routes/authRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, '..', 'public');

/**
 * Creates and configures the Express application.
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

  // Mount authentication & health endpoints
  app.use(createAuthRoutes({ config, repo, clock }));

  // Fallback 404 handler for unknown routes
  app.use(notFoundHandler);

  // Central sanitized error handler
  app.use(errorHandler);

  return app;
}

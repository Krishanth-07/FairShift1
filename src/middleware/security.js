/**
 * @file Security & Core Transport Middleware
 *
 * Configures Helmet with strict Content Security Policy (no inline scripts, no inline styles),
 * disables X-Powered-By header, enables response compression, enforces payload limits (20kb),
 * and enables reverse-proxy trust for rate limiting.
 */

import helmet from 'helmet';
import compression from 'compression';
import express from 'express';

/**
 * Attaches core security, compression, and request body parsing middleware to an Express app.
 *
 * @param {import('express').Express} app - Target Express application.
 */
export function applySecurityMiddleware(app) {
  // Trust first proxy hop (essential for accurate rate limiting and secure cookies behind reverse proxies)
  app.set('trust proxy', 1);

  // Helmet with strict Content Security Policy aligned with AGENTS.md
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"]
        }
      },
      hidePoweredBy: true
    })
  );

  // Enable Gzip/Brotli response compression for low-bandwidth environments
  app.use(compression());

  // Strict 20kb JSON payload ceiling to prevent memory denial-of-service
  app.use(express.json({ limit: '20kb' }));
}

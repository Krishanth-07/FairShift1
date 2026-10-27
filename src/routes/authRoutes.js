/**
 * @file Authentication & Health Routes
 *
 * Implements login, logout, me, demo-login, and health check endpoints.
 * Emits identical error responses for unknown user IDs and invalid PINs to prevent
 * user enumeration attacks.
 */

import { Router } from 'express';
import { verifyPin, createSessionToken, sessionCookieOptions } from '../services/auth.js';
import { validateBody } from '../middleware/validate.js';
import { loginLimiter } from '../middleware/rateLimits.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { AppError } from '../middleware/errors.js';

/**
 * Sanitizes a user object for client consumption, omitting PIN hashes and salts.
 *
 * @param {object} user - Raw user document.
 * @returns {object} Safe public user profile.
 */
function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    siteId: user.siteId,
    role: user.role,
    lang: user.lang,
    hourlyRatePaise: user.hourlyRatePaise
  };
}

/**
 * Creates authentication router.
 *
 * @param {object} dependencies
 * @param {object} dependencies.config - Application config.
 * @param {object} dependencies.repo - Memory repository.
 * @param {object} dependencies.clock - Clock instance.
 * @returns {Router} Configured Express router.
 */
export function createAuthRoutes({ config, repo, clock }) {
  const router = Router();
  const isProduction = config.NODE_ENV === 'production';

  // ─── GET /healthz ──────────────────────────────────────────
  router.get('/healthz', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: clock.now()
    });
  });

  // ─── POST /api/auth/login ──────────────────────────────────
  router.post(
    '/api/auth/login',
    loginLimiter,
    validateBody({
      userId: { required: true, type: 'string', min: 1, max: 64 },
      pin: { required: true, type: 'string', min: 4, max: 8 }
    }),
    async (req, res, next) => {
      try {
        const { userId, pin } = req.body;
        const user = repo.getUser(userId);

        // Mitigate user enumeration: constant error and simulated work
        const invalidCredsError = new AppError(
          401,
          'INVALID_CREDENTIALS',
          'errors.auth.invalid_credentials',
          'Invalid user ID or PIN.'
        );

        if (!user || !user.pinHash || !user.pinSalt) {
          // Perform dummy verification against dummy hash to prevent timing discrepancy
          await verifyPin(pin, '0'.repeat(128), '0'.repeat(32));
          throw invalidCredsError;
        }

        const isMatch = await verifyPin(pin, user.pinHash, user.pinSalt);
        if (!isMatch) {
          throw invalidCredsError;
        }

        // Issue session cookie
        const token = createSessionToken(user.id, config.SESSION_SECRET);
        res.cookie('fs_session', token, sessionCookieOptions(isProduction));

        res.json({
          user: sanitizeUser(user)
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ─── POST /api/auth/logout ─────────────────────────────────
  router.post('/api/auth/logout', requireAuth({ config, repo }), (req, res) => {
    res.clearCookie('fs_session', { path: '/' });
    res.json({ success: true });
  });

  // ─── GET /api/auth/me ──────────────────────────────────────
  router.get('/api/auth/me', requireAuth({ config, repo }), (req, res) => {
    res.json({
      user: sanitizeUser(req.user)
    });
  });

  // ─── DEMO_MODE Protected Endpoints ─────────────────────────
  if (config.DEMO_MODE) {
    // GET /api/auth/demo-users: Returns demo roster without sensitive hashes or rates
    router.get('/api/auth/demo-users', (req, res) => {
      const allUsers = repo.getAllUsers();
      const demoUsers = allUsers.map((u) => {
        const site = repo.getSite(u.siteId);
        return {
          id: u.id,
          name: u.name,
          role: u.role,
          siteLabel: site ? site.name : u.siteId,
          language: u.lang || 'en'
        };
      });
      res.json(demoUsers);
    });

    // POST /api/auth/demo-login: Fast login for demo users
    router.post(
      '/api/auth/demo-login',
      validateBody({
        userId: { required: true, type: 'string', min: 1, max: 64 }
      }),
      (req, res, next) => {
        const user = repo.getUser(req.body.userId);
        if (!user) {
          return next(
            new AppError(
              404,
              'USER_NOT_FOUND',
              'errors.auth.user_not_found',
              `Demo user "${req.body.userId}" not found.`
            )
          );
        }

        const token = createSessionToken(user.id, config.SESSION_SECRET);
        res.cookie('fs_session', token, sessionCookieOptions(isProduction));

        res.json({
          user: sanitizeUser(user)
        });
      }
    );
  }

  return router;
}

/**
 * @file Session Authentication & CSRF Protection Middleware
 *
 * Enforces session authentication via httpOnly fs_session cookie and requires
 * the custom `X-Requested-With: fairshift` header on mutating requests (CSRF mitigation).
 */

import { verifySessionToken } from '../services/auth.js';
import { AppError } from './errors.js';

/**
 * Extracts cookies from the Cookie header without external dependencies.
 *
 * @param {string | undefined} header - Raw Cookie header string.
 * @returns {Record<string, string>}
 */
export function parseCookies(header) {
  const cookies = {};
  if (!header || typeof header !== 'string') return cookies;

  const pairs = header.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx !== -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

/**
 * Creates an authentication middleware with optional role enforcement and CSRF validation.
 *
 * @param {object} dependencies
 * @param {object} dependencies.config - Application config containing SESSION_SECRET.
 * @param {object} dependencies.repo - Repository instance with getUser().
 * @param {string} [requiredRole] - Optional required role ('worker' | 'admin').
 * @returns {import('express').RequestHandler}
 */
export function requireAuth({ config, repo, role: requiredRole }) {
  return async (req, res, next) => {
    try {
      // 1. Enforce custom header on mutating requests as CSRF mitigation
      const method = req.method.toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const customHeader = req.headers['x-requested-with'];
        if (!customHeader || customHeader.toLowerCase() !== 'fairshift') {
          throw new AppError(
            403,
            'CSRF_HEADER_MISSING',
            'errors.auth.csrf_missing',
            'State-modifying requests require "X-Requested-With: fairshift" header.'
          );
        }
      }

      // 2. Read session cookie
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies.fs_session;

      if (!token) {
        throw new AppError(
          401,
          'UNAUTHORIZED',
          'errors.auth.unauthorized',
          'Authentication required. Please log in.'
        );
      }

      // 3. Cryptographically verify session token
      const verification = verifySessionToken(token, config.SESSION_SECRET);
      if (!verification.valid || !verification.userId) {
        throw new AppError(
          401,
          'SESSION_EXPIRED',
          'errors.auth.session_expired',
          'Session is invalid or expired. Please log in again.'
        );
      }

      // 4. Load user from repository
      const user = repo.getUser(verification.userId);
      if (!user) {
        throw new AppError(
          401,
          'USER_NOT_FOUND',
          'errors.auth.user_not_found',
          'User associated with this session no longer exists.'
        );
      }

      // 5. Role check
      if (requiredRole && user.role !== requiredRole) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'errors.auth.forbidden',
          `Access requires "${requiredRole}" role.`
        );
      }

      // Attach user to request
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

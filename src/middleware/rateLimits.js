/**
 * @file Rate Limiting Middleware
 *
 * Protects endpoints against brute-force and resource exhaustion attacks using express-rate-limit.
 * Emits uniform JSON error bodies with explainable codes.
 */

import { rateLimit } from 'express-rate-limit';

/**
 * Creates a rate limiter instance returning structured JSON errors.
 *
 * @param {object} options
 * @param {number} options.windowMs - Window duration in milliseconds.
 * @param {number} options.limit - Max requests per IP in the window.
 * @param {string} options.messageKey - Localization key for the rejection.
 * @param {string} options.message - Human-readable English explanation.
 * @returns {import('express').RequestHandler}
 */
function createLimiter({ windowMs, limit, messageKey, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          messageKey,
          message
        }
      });
    }
  });
}

/** General API rate limiter: 300 requests per 15 minutes. */
export const generalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  messageKey: 'errors.rate_limit.general',
  message: 'Too many requests. Please slow down and try again later.'
});

/** Sensitive login rate limiter: 10 attempts per 15 minutes to deter PIN brute force. */
export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  messageKey: 'errors.rate_limit.login',
  message: 'Too many login attempts. Please wait 15 minutes before trying again.'
});

/** Hazard report submission limiter: 20 reports per hour per IP. */
export const reportsLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  messageKey: 'errors.rate_limit.reports',
  message: 'Hazard report limit reached. Please wait before submitting additional reports.'
});

/** Anonymous feedback submission limiter: 10 submissions per hour per IP. */
export const feedbackLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  messageKey: 'errors.rate_limit.feedback',
  message: 'Feedback submission limit reached. Please wait before submitting more feedback.'
});

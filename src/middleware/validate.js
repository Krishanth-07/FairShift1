/**
 * @file Strict Input Validation Middleware
 *
 * Enforces schema contracts on incoming request bodies, explicitly rejecting
 * unexpected/unknown properties with HTTP 400 to prevent parameter pollution.
 */

import { AppError } from './errors.js';

/**
 * Creates a middleware that validates req.body against a schema specification.
 * Rejects unknown keys with HTTP 400.
 *
 * @param {Record<string, {
 *   required?: boolean,
 *   type?: 'string' | 'number' | 'boolean' | 'array' | 'object',
 *   min?: number,
 *   max?: number,
 *   pattern?: RegExp,
 *   enum?: Array<string | number>
 * }>} schema - Validation specification.
 * @returns {import('express').RequestHandler}
 */
export function validateBody(schema) {
  const allowedKeys = new Set(Object.keys(schema));

  return (req, res, next) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return next(
        new AppError(
          400,
          'INVALID_BODY',
          'errors.validation.invalid_body',
          'Request body must be a JSON object.'
        )
      );
    }

    // 1. Detect and reject unknown properties
    for (const key of Object.keys(body)) {
      if (!allowedKeys.has(key)) {
        return next(
          new AppError(
            400,
            'UNKNOWN_FIELD',
            'errors.validation.unknown_field',
            `Unknown field "${key}" is not permitted.`,
            { field: key }
          )
        );
      }
    }

    // 2. Validate declared fields
    for (const [key, rules] of Object.entries(schema)) {
      const val = body[key];

      // Required check
      if (rules.required) {
        if (val === undefined || val === null || val === '') {
          return next(
            new AppError(
              400,
              'MISSING_REQUIRED_FIELD',
              'errors.validation.missing_field',
              `Field "${key}" is required.`,
              { field: key }
            )
          );
        }
      }

      if (val !== undefined && val !== null) {
        // Type check
        if (rules.type) {
          if (rules.type === 'array') {
            if (!Array.isArray(val)) {
              return next(
                new AppError(
                  400,
                  'INVALID_TYPE',
                  'errors.validation.invalid_type',
                  `Field "${key}" must be an array.`,
                  { field: key, expected: 'array' }
                )
              );
            }
          } else if (typeof val !== rules.type) {
            return next(
              new AppError(
                400,
                'INVALID_TYPE',
                'errors.validation.invalid_type',
                `Field "${key}" must be of type ${rules.type}.`,
                { field: key, expected: rules.type }
              )
            );
          }
        }

        // Length or numeric range checks
        if (typeof val === 'string') {
          if (typeof rules.min === 'number' && val.length < rules.min) {
            return next(
              new AppError(
                400,
                'STRING_TOO_SHORT',
                'errors.validation.too_short',
                `Field "${key}" must be at least ${rules.min} characters.`,
                { field: key, min: rules.min }
              )
            );
          }
          if (typeof rules.max === 'number' && val.length > rules.max) {
            return next(
              new AppError(
                400,
                'STRING_TOO_LONG',
                'errors.validation.too_long',
                `Field "${key}" must be at most ${rules.max} characters.`,
                { field: key, max: rules.max }
              )
            );
          }
          if (rules.pattern && !rules.pattern.test(val)) {
            return next(
              new AppError(
                400,
                'PATTERN_MISMATCH',
                'errors.validation.pattern_mismatch',
                `Field "${key}" format is invalid.`,
                { field: key }
              )
            );
          }
        } else if (typeof val === 'number') {
          if (typeof rules.min === 'number' && val < rules.min) {
            return next(
              new AppError(
                400,
                'VALUE_TOO_LOW',
                'errors.validation.too_low',
                `Field "${key}" must be >= ${rules.min}.`,
                { field: key, min: rules.min }
              )
            );
          }
          if (typeof rules.max === 'number' && val > rules.max) {
            return next(
              new AppError(
                400,
                'VALUE_TOO_HIGH',
                'errors.validation.too_high',
                `Field "${key}" must be <= ${rules.max}.`,
                { field: key, max: rules.max }
              )
            );
          }
        }

        // Enum check
        if (rules.enum && !rules.enum.includes(val)) {
          return next(
            new AppError(
              400,
              'INVALID_ENUM',
              'errors.validation.invalid_enum',
              `Field "${key}" must be one of: ${rules.enum.join(', ')}.`,
              { field: key, allowed: rules.enum }
            )
          );
        }
      }
    }

    next();
  };
}

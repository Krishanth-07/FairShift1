/**
 * @file Application Error Types & Central Error Handling
 *
 * Implements structured, explainable errors and ensures that stack traces,
 * database internals, and environmental data are NEVER exposed to client responses.
 */

/**
 * Custom operational application error.
 */
export class AppError extends Error {
  /**
   * @param {number} status - HTTP status code (e.g. 400, 401, 403, 404).
   * @param {string} code - Machine-readable error code.
   * @param {string} messageKey - Localization key.
   * @param {string} message - Human-readable English message.
   * @param {object} [details] - Optional contextual details.
   */
  constructor(status, code, messageKey, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.messageKey = messageKey;
    this.details = details;
  }
}

/**
 * 404 Not Found handler returning uniform JSON error responses.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      messageKey: 'errors.http.not_found',
      message: `Cannot ${req.method} ${req.path}`
    }
  });
}

/**
 * Central Express error handler. Never leaks stack traces or system internals.
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, req, res, next) {
  // Catch express.json() payload size limit violation (20kb)
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        messageKey: 'errors.http.payload_too_large',
        message: 'Request payload exceeds the maximum permitted size of 20kb.'
      }
    });
  }

  // Catch malformed JSON syntax errors
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        messageKey: 'errors.validation.malformed_json',
        message: 'Invalid JSON payload received.'
      }
    });
  }

  // Known operational AppError
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        messageKey: err.messageKey,
        message: err.message,
        details: err.details
      }
    });
  }

  // Unhandled internal server error — strictly sanitize output (no stack trace leak)
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      messageKey: 'errors.http.internal_server_error',
      message: 'An unexpected internal error occurred.'
    }
  });
}

/**
 * @file Environment Configuration Loader
 *
 * Reads process.env once at import time and exports a frozen config object.
 * Missing secrets are generated randomly with a logged warning that sessions
 * will not survive restarts. Secret values are never logged.
 */

import crypto from 'node:crypto';

/**
 * Generates a cryptographically random hex string for ephemeral secrets.
 * @param {number} bytes - Number of random bytes.
 * @returns {string}
 */
function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Reads an env var as a secret, generating a random fallback if missing.
 * @param {string} name - Environment variable name.
 * @param {Array<string>} warnings - Array to collect warning messages.
 * @returns {string}
 */
function readSecret(name, warnings) {
  const val = process.env[name];
  if (val && val.trim().length > 0) return val.trim();
  warnings.push(name);
  return randomSecret();
}

const warnings = [];

const SESSION_SECRET = readSecret('SESSION_SECRET', warnings);
const SITE_SECRET = readSecret('SITE_SECRET', warnings);
const RECEIPT_SECRET = readSecret('RECEIPT_SECRET', warnings);
const FEEDBACK_SECRET = readSecret('FEEDBACK_SECRET', warnings);

// Emit a single consolidated warning for all generated secrets
if (warnings.length > 0) {
  console.warn(
    `[FairShift] Generated random secret(s) for: ${warnings.join(', ')} — sessions reset on restart.`
  );
}

const NODE_ENV = process.env.NODE_ENV || 'development';

// SEED_PIN: generate randomly if missing; print only outside production
let SEED_PIN = process.env.SEED_PIN || '';
if (!SEED_PIN) {
  SEED_PIN = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit numeric
  if (NODE_ENV !== 'production') {
    console.log(`[FairShift] Generated demo SEED_PIN: ${SEED_PIN}`);
  }
}

/** @type {Readonly<object>} Frozen application configuration. */
const config = Object.freeze({
  PORT: parseInt(process.env.PORT, 10) || 8080,
  TZ_OFFSET_MINUTES: parseInt(process.env.TZ_OFFSET_MINUTES, 10) || 330,
  DEMO_MODE: process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1',
  NODE_ENV,
  SESSION_SECRET,
  SITE_SECRET,
  RECEIPT_SECRET,
  FEEDBACK_SECRET,
  SEED_PIN
});

export default config;

/**
 * @file Authentication Service
 *
 * PIN hashing with crypto.scrypt, per-user salt, timingSafeEqual.
 * Session tokens via HMAC-SHA256, base64url encoding, expiry enforcement.
 * No external JWT library; constant-time comparison throughout.
 */

import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const TOKEN_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Hashes a PIN with scrypt using the provided salt.
 *
 * @param {string} pin - 4–8 digit numeric PIN.
 * @param {string} salt - Per-user hex salt.
 * @returns {Promise<string>} Hex-encoded derived key.
 */
export function hashPin(pin, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(pin), salt, SCRYPT_KEYLEN, (err, derived) => {
      if (err) return reject(err);
      resolve(derived.toString('hex'));
    });
  });
}

/**
 * Verifies a PIN against a stored hash using constant-time comparison.
 *
 * @param {string} pin - Candidate PIN.
 * @param {string} storedHash - Hex-encoded stored hash.
 * @param {string} salt - Per-user salt.
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin, storedHash, salt) {
  try {
    const candidateHash = await hashPin(pin, salt);
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Generates a per-user random salt.
 * @returns {string} 16-byte hex salt.
 */
export function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Creates an HMAC-SHA256 session token with embedded userId and expiry.
 *
 * @param {string} userId - User identifier to embed.
 * @param {string} secret - Server session secret.
 * @param {number} [expiryMs=TOKEN_EXPIRY_MS] - Token lifetime in ms.
 * @returns {string} base64url-encoded token string: "payload.signature".
 */
export function createSessionToken(userId, secret, expiryMs = TOKEN_EXPIRY_MS) {
  const payload = {
    sub: userId,
    iat: Date.now(),
    exp: Date.now() + expiryMs
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies and decodes a session token using constant-time signature comparison.
 *
 * @param {string} token - Token string "payload.signature".
 * @param {string} secret - Server session secret.
 * @returns {{ valid: boolean, userId: string|null, reason: string|null }}
 */
export function verifySessionToken(token, secret) {
  if (!token || typeof token !== 'string') {
    return { valid: false, userId: null, reason: 'missing_token' };
  }

  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) {
    return { valid: false, userId: null, reason: 'malformed_token' };
  }

  const payloadB64 = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  // Constant-time signature verification
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(sig, 'base64url');
  const expBuf = Buffer.from(expectedSig, 'base64url');

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, userId: null, reason: 'invalid_signature' };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false, userId: null, reason: 'expired' };
    }
    return { valid: true, userId: payload.sub, reason: null };
  } catch {
    return { valid: false, userId: null, reason: 'corrupt_payload' };
  }
}

/**
 * Constructs the fs_session cookie options.
 *
 * @param {boolean} isProduction - Whether the app is in production mode.
 * @returns {object} Cookie options for express res.cookie().
 */
export function sessionCookieOptions(isProduction) {
  return {
    httpOnly: true,
    sameSite: 'Strict',
    secure: isProduction,
    maxAge: TOKEN_EXPIRY_MS,
    path: '/'
  };
}

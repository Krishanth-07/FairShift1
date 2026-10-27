/**
 * @file Dynamic Rotating Site Code Engine
 *
 * Implements offline-verifiable, rotating 6-digit site codes based on HMAC-SHA256.
 * Binds check-in events to a physical site and deterministic time window without
 * requiring frontline worker devices to maintain active internet connectivity.
 */

import crypto from 'node:crypto';

/**
 * Generates a rotating 6-digit site verification code for a specific timestamp window.
 * Default window is 5 minutes (300,000 ms).
 *
 * @param {string} siteSecret - Secret key assigned to the site/employer.
 * @param {string} siteId - Unique identifier of the job site or hospital ward.
 * @param {number} tsMs - Timestamp in milliseconds.
 * @param {number} [windowMs=300000] - Window duration in milliseconds (default 5 minutes).
 * @returns {string} 6-digit numeric verification code.
 */
export function generateSiteCode(siteSecret, siteId, tsMs, windowMs = 300000) {
  if (!siteSecret || !siteId || typeof tsMs !== 'number') {
    throw new Error('generateSiteCode requires siteSecret, siteId, and numeric timestamp tsMs.');
  }
  const windowNumber = Math.floor(tsMs / windowMs);
  const message = `${siteId}:${windowNumber}`;

  const hmac = crypto.createHmac('sha256', siteSecret).update(message).digest();
  // Extract 31-bit unsigned integer from HMAC digest (TOTP RFC 4226 style truncation)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return String(otp).padStart(6, '0');
}

/**
 * Validates a claimed site code against a claimed timestamp and site within an allowed window tolerance.
 * Supports verifying offline syncs that occurred during past shift windows.
 *
 * @param {string} code - 6-digit code entered or scanned by worker.
 * @param {string} siteSecret - Secret key assigned to the site.
 * @param {string} siteId - Unique identifier of the job site.
 * @param {number} claimedTsMs - Millisecond timestamp claimed on the device when code was recorded.
 * @param {number} [windowMs=300000] - Window duration in milliseconds.
 * @param {number} [tolerance=1] - Number of adjacent windows allowed (+/- tolerance).
 * @returns {boolean} True if the code matches the claimed site and time window.
 */
export function verifySiteCode(code, siteSecret, siteId, claimedTsMs, windowMs = 300000, tolerance = 1) {
  if (!code || typeof code !== 'string' || !siteSecret || !siteId || typeof claimedTsMs !== 'number') {
    return false;
  }
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    return false;
  }

  const currentWindow = Math.floor(claimedTsMs / windowMs);
  const codeBuf = Buffer.from(code, 'utf8');

  // Check windows within +/- tolerance to account for boundary clock drift
  for (let offset = -tolerance; offset <= tolerance; offset += 1) {
    const candidateWindow = currentWindow + offset;
    const candidateCode = generateSiteCode(siteSecret, siteId, candidateWindow * windowMs, windowMs);
    const candidateBuf = Buffer.from(candidateCode, 'utf8');

    if (codeBuf.length === candidateBuf.length && crypto.timingSafeEqual(codeBuf, candidateBuf)) {
      return true;
    }
  }

  return false;
}

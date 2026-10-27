/**
 * @file Tamper-Evident Hash Chain and Cryptographic Receipt Engine
 *
 * Implements deterministic append-only blockchain hashing and HMAC-SHA256
 * digital receipts using Node.js built-in `node:crypto`. Zero external dependencies.
 */

import crypto from 'node:crypto';

/**
 * Standard 64-character hexadecimal null hash for the genesis block.
 */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Serializes arbitrary data structures with strictly sorted keys.
 * Ensures consistent cryptographic hashes regardless of object property insertion order.
 *
 * @param {*} val - Value or object to serialize.
 * @returns {string} Deterministic canonical JSON string.
 */
export function canonicalize(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map((item) => canonicalize(item)).join(',')}]`;
  }
  const keys = Object.keys(val).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(val[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Creates a verified chain record linking to a predecessor block hash.
 *
 * @param {object} params
 * @param {string} params.prevHash - Hex hash of the previous record (or GENESIS_HASH).
 * @param {*} params.payload - Payload data to securely seal into the chain.
 * @returns {{ prevHash: string, payload: *, hash: string }}
 */
export function createRecord({ prevHash = GENESIS_HASH, payload }) {
  if (typeof prevHash !== 'string') {
    throw new Error('prevHash must be a hexadecimal string.');
  }
  const serialized = canonicalize(payload);
  const hash = crypto
    .createHash('sha256')
    .update(prevHash + serialized)
    .digest('hex');

  return {
    prevHash,
    payload,
    hash
  };
}

/**
 * Verifies an ordered sequence of chain records, ensuring link integrity and payload consistency.
 *
 * @param {Array<{ prevHash: string, payload: *, hash: string }>} records - Ordered records array.
 * @returns {{ valid: boolean, brokenAtIndex: number, reason: string | null }}
 */
export function verifyChain(records = []) {
  if (!Array.isArray(records)) {
    throw new Error('verifyChain requires an array of records.');
  }
  if (records.length === 0) {
    return { valid: true, brokenAtIndex: -1, reason: null };
  }

  for (let i = 0; i < records.length; i += 1) {
    const current = records[i];

    // Genesis record must explicitly anchor to the GENESIS_HASH
    if (i === 0) {
      if (current.prevHash !== GENESIS_HASH) {
        return {
          valid: false,
          brokenAtIndex: 0,
          reason: `Genesis record must link to GENESIS_HASH, but found "${current.prevHash}".`
        };
      }
    } else {
      const predecessor = records[i - 1];
      if (current.prevHash !== predecessor.hash) {
        return {
          valid: false,
          brokenAtIndex: i,
          reason: `Chain broken at index ${i}: prevHash does not match predecessor hash.`
        };
      }
    }

    // Recalculate hash over canonicalized payload to detect tampering
    const expectedHash = crypto
      .createHash('sha256')
      .update(current.prevHash + canonicalize(current.payload))
      .digest('hex');

    if (current.hash !== expectedHash) {
      return {
        valid: false,
        brokenAtIndex: i,
        reason: `Hash mismatch at index ${i}: expected "${expectedHash}", received "${current.hash}".`
      };
    }
  }

  return { valid: true, brokenAtIndex: -1, reason: null };
}

/**
 * Generates an HMAC-SHA256 signature for a record using a server secret.
 * Serves as an unforgeable digital receipt provided to frontline workers.
 *
 * @param {object} record - Record data or payload to sign.
 * @param {string} secret - Server secret key.
 * @returns {string} Hexadecimal HMAC signature.
 */
export function signReceipt(record, secret) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('signReceipt requires a non-empty string secret.');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalize(record))
    .digest('hex');
}

/**
 * Cryptographically verifies a digital receipt signature using constant-time comparison
 * to eliminate timing side-channel attacks.
 *
 * @param {object} record - Record data that was signed.
 * @param {string} signature - Hexadecimal signature string to verify.
 * @param {string} secret - Server secret key.
 * @returns {boolean} True if the signature is authentic and valid.
 */
export function verifyReceipt(record, signature, secret) {
  if (!signature || typeof signature !== 'string' || !secret) {
    return false;
  }
  try {
    const expected = signReceipt(record, secret);
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

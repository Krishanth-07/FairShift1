import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSiteCode, verifySiteCode } from '../src/engine/siteCode.js';

describe('Pure Engine: Dynamic Rotating Site Codes', () => {
  const SECRET = 'site-secret-alpha-key-4321';
  const SITE_ID = 'site_construct_bangalore_01';
  const WINDOW_MS = 300000; // 5-minute window
  const BASE_TIME = 1793080000000; // Fixed timestamp reference

  describe('generateSiteCode()', () => {
    it('should generate a 6-digit numeric string', () => {
      const code = generateSiteCode(SECRET, SITE_ID, BASE_TIME, WINDOW_MS);
      assert.equal(typeof code, 'string');
      assert.equal(code.length, 6);
      assert.match(code, /^\d{6}$/);
    });

    it('should generate identical code for any timestamp in the same window', () => {
      const codeStart = generateSiteCode(SECRET, SITE_ID, BASE_TIME, WINDOW_MS);
      const codeMid = generateSiteCode(SECRET, SITE_ID, BASE_TIME + 120000, WINDOW_MS); // +2 min
      assert.equal(codeStart, codeMid);
    });

    it('should generate distinct codes for different time windows', () => {
      const code1 = generateSiteCode(SECRET, SITE_ID, BASE_TIME, WINDOW_MS);
      const code2 = generateSiteCode(SECRET, SITE_ID, BASE_TIME + WINDOW_MS, WINDOW_MS);
      // Different windows produce different HMAC hashes
      assert.notEqual(code1, code2);
    });
  });

  describe('verifySiteCode()', () => {
    it('should verify code in the exact same time window', () => {
      const code = generateSiteCode(SECRET, SITE_ID, BASE_TIME, WINDOW_MS);
      const isValid = verifySiteCode(code, SECRET, SITE_ID, BASE_TIME, WINDOW_MS, 1);
      assert.equal(isValid, true);
    });

    it('should verify code in immediately adjacent windows (+/- 1 tolerance)', () => {
      // Code was generated in window W
      const code = generateSiteCode(SECRET, SITE_ID, BASE_TIME, WINDOW_MS);

      // Claimed timestamp is in next window W+1 (+300s)
      const isNextValid = verifySiteCode(code, SECRET, SITE_ID, BASE_TIME + WINDOW_MS, WINDOW_MS, 1);
      assert.equal(isNextValid, true);

      // Claimed timestamp is in previous window W-1 (-300s)
      const isPrevValid = verifySiteCode(code, SECRET, SITE_ID, BASE_TIME - WINDOW_MS, WINDOW_MS, 1);
      assert.equal(isPrevValid, true);
    });

    it('should reject expired code beyond tolerance window', () => {
      // Code generated in window W
      const code = generateSiteCode(SECRET, SITE_ID, BASE_TIME, WINDOW_MS);

      // Claimed time is 3 windows later (+15 minutes)
      const isExpired = verifySiteCode(code, SECRET, SITE_ID, BASE_TIME + (WINDOW_MS * 3), WINDOW_MS, 1);
      assert.equal(isExpired, false);
    });

    it('should reject valid code presented for wrong siteId', () => {
      const code = generateSiteCode(SECRET, SITE_ID, BASE_TIME, WINDOW_MS);
      const isWrongSite = verifySiteCode(code, SECRET, 'site_mumbai_ward_4', BASE_TIME, WINDOW_MS, 1);
      assert.equal(isWrongSite, false);
    });

    it('should reject code tested against incorrect secret', () => {
      const code = generateSiteCode(SECRET, SITE_ID, BASE_TIME, WINDOW_MS);
      const isWrongSecret = verifySiteCode(code, 'wrong-secret', SITE_ID, BASE_TIME, WINDOW_MS, 1);
      assert.equal(isWrongSecret, false);
    });

    it('should gracefully reject malformed code strings', () => {
      assert.equal(verifySiteCode('12345', SECRET, SITE_ID, BASE_TIME, WINDOW_MS), false); // 5 digits
      assert.equal(verifySiteCode('abcdef', SECRET, SITE_ID, BASE_TIME, WINDOW_MS), false); // non-numeric
      assert.equal(verifySiteCode('', SECRET, SITE_ID, BASE_TIME, WINDOW_MS), false);
      assert.equal(verifySiteCode(null, SECRET, SITE_ID, BASE_TIME, WINDOW_MS), false);
    });
  });
});

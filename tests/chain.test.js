import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENESIS_HASH,
  canonicalize,
  createRecord,
  verifyChain,
  signReceipt,
  verifyReceipt
} from '../src/engine/chain.js';

describe('Pure Engine: Tamper-Evident Hash Chain & Receipts', () => {
  const SECRET = 'test-secret-salt-key-9988';

  describe('canonicalize()', () => {
    it('should serialize objects with different property orders into identical JSON strings', () => {
      const obj1 = { z: 1, a: 'hello', m: { y: 2, b: 3 } };
      const obj2 = { a: 'hello', m: { b: 3, y: 2 }, z: 1 };

      assert.equal(canonicalize(obj1), canonicalize(obj2));
      assert.equal(canonicalize(obj1), '{"a":"hello","m":{"b":3,"y":2},"z":1}');
    });

    it('should serialize primitives, null, and arrays consistently', () => {
      assert.equal(canonicalize(null), 'null');
      assert.equal(canonicalize(42), '42');
      assert.equal(canonicalize([3, 2, 1]), '[3,2,1]');
    });
  });

  describe('createRecord() & verifyChain()', () => {
    it('should verify a valid sequential chain anchored to GENESIS_HASH', () => {
      const rec0 = createRecord({
        prevHash: GENESIS_HASH,
        payload: { workerId: 'w1', action: 'check_in', ts: '2026-10-27T08:00:00Z' }
      });

      const rec1 = createRecord({
        prevHash: rec0.hash,
        payload: { workerId: 'w1', action: 'check_out', ts: '2026-10-27T16:30:00Z' }
      });

      const rec2 = createRecord({
        prevHash: rec1.hash,
        payload: { workerId: 'w2', action: 'check_in', ts: '2026-10-27T16:35:00Z' }
      });

      const chain = [rec0, rec1, rec2];
      const result = verifyChain(chain);

      assert.equal(result.valid, true);
      assert.equal(result.brokenAtIndex, -1);
      assert.equal(result.reason, null);
    });

    it('should detect when record payload is tampered in the middle and report brokenAtIndex', () => {
      const rec0 = createRecord({
        prevHash: GENESIS_HASH,
        payload: { workerId: 'w1', hours: 8 }
      });
      const rec1 = createRecord({
        prevHash: rec0.hash,
        payload: { workerId: 'w2', hours: 8 }
      });
      const rec2 = createRecord({
        prevHash: rec1.hash,
        payload: { workerId: 'w3', hours: 8 }
      });

      // Tamper with record 1 payload (e.g., attempt to alter recorded hours)
      const tamperedRec1 = {
        ...rec1,
        payload: { workerId: 'w2', hours: 14 }
      };

      const chain = [rec0, tamperedRec1, rec2];
      const result = verifyChain(chain);

      assert.equal(result.valid, false);
      assert.equal(result.brokenAtIndex, 1, 'Tampered block must be reported at index 1');
      assert.match(result.reason, /Hash mismatch at index 1/);
    });

    it('should detect when chain linkage is broken between blocks', () => {
      const rec0 = createRecord({
        prevHash: GENESIS_HASH,
        payload: { test: 1 }
      });
      const rec1 = createRecord({
        prevHash: 'f'.repeat(64), // Invalid linkage
        payload: { test: 2 }
      });

      const chain = [rec0, rec1];
      const result = verifyChain(chain);

      assert.equal(result.valid, false);
      assert.equal(result.brokenAtIndex, 1);
      assert.match(result.reason, /prevHash does not match predecessor/);
    });

    it('should flag genesis block not anchored to GENESIS_HASH', () => {
      const badGenesis = createRecord({
        prevHash: 'e'.repeat(64),
        payload: { test: 0 }
      });
      const result = verifyChain([badGenesis]);

      assert.equal(result.valid, false);
      assert.equal(result.brokenAtIndex, 0);
      assert.match(result.reason, /Genesis record must link to GENESIS_HASH/);
    });
  });

  describe('signReceipt() & verifyReceipt()', () => {
    it('should authenticate authentic digital receipt signed with secret', () => {
      const receiptPayload = {
        workerId: 'worker_101',
        shiftDate: '2026-10-27',
        verifiedHours: 8.5
      };

      const signature = signReceipt(receiptPayload, SECRET);
      const isValid = verifyReceipt(receiptPayload, signature, SECRET);

      assert.equal(typeof signature, 'string');
      assert.equal(signature.length, 64);
      assert.equal(isValid, true);
    });

    it('should reject forged receipts or modified payloads', () => {
      const receiptPayload = {
        workerId: 'worker_101',
        shiftDate: '2026-10-27',
        verifiedHours: 8.5
      };
      const signature = signReceipt(receiptPayload, SECRET);

      // Malicious modification of hours worked
      const forgedPayload = {
        ...receiptPayload,
        verifiedHours: 12.0
      };

      assert.equal(verifyReceipt(forgedPayload, signature, SECRET), false);
    });

    it('should reject receipts verified against an incorrect secret key', () => {
      const receiptPayload = { workerId: 'worker_101' };
      const signature = signReceipt(receiptPayload, SECRET);

      assert.equal(verifyReceipt(receiptPayload, signature, 'wrong-secret'), false);
    });

    it('should return false on corrupted or malformed signatures', () => {
      const receiptPayload = { workerId: 'worker_101' };
      assert.equal(verifyReceipt(receiptPayload, 'invalid-hex', SECRET), false);
      assert.equal(verifyReceipt(receiptPayload, '', SECRET), false);
      assert.equal(verifyReceipt(receiptPayload, null, SECRET), false);
    });
  });
});

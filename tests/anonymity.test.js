import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_GROUP_SIZE,
  toDateOnly,
  assertAnonymous,
  aggregateFeedback
} from '../src/engine/anonymity.js';

describe('Pure Engine: Anonymous Feedback & k-Anonymity', () => {
  describe('toDateOnly()', () => {
    it('should strip time from ISO timestamp', () => {
      assert.equal(toDateOnly('2026-10-27T14:30:00.000Z'), '2026-10-27');
    });

    it('should pass through date-only strings', () => {
      assert.equal(toDateOnly('2026-10-27'), '2026-10-27');
    });
  });

  describe('assertAnonymous()', () => {
    it('should accept a clean anonymous entry', () => {
      assert.doesNotThrow(() => assertAnonymous({
        rating: 4,
        tags: ['fair schedule'],
        timestamp: '2026-10-27'
      }));
    });

    it('should reject entry with workerId', () => {
      assert.throws(
        () => assertAnonymous({ workerId: 'w123', rating: 3 }),
        /identifying field "workerId"/
      );
    });

    it('should reject entry with email', () => {
      assert.throws(
        () => assertAnonymous({ email: 'a@b.com', rating: 3 }),
        /identifying field "email"/
      );
    });

    it('should reject entry with phone', () => {
      assert.throws(
        () => assertAnonymous({ phone: '9876543210', rating: 3 }),
        /identifying field "phone"/
      );
    });

    it('should reject entry with ip address', () => {
      assert.throws(
        () => assertAnonymous({ ip: '192.168.1.1', rating: 3 }),
        /identifying field "ip"/
      );
    });

    it('should reject entry with deviceId', () => {
      assert.throws(
        () => assertAnonymous({ deviceId: 'dev-abc', rating: 3 }),
        /identifying field "deviceId"/
      );
    });

    it('should reject timestamp with time component', () => {
      assert.throws(
        () => assertAnonymous({ timestamp: '2026-10-27T14:30:00.000Z', rating: 4 }),
        /date-only/
      );
    });

    it('should accept timestamp that is date-only', () => {
      assert.doesNotThrow(() => assertAnonymous({ timestamp: '2026-10-27', rating: 4 }));
    });
  });

  describe('aggregateFeedback()', () => {
    it('should hide results when group has fewer than MIN_GROUP_SIZE entries (4 entries)', () => {
      const entries = [
        { rating: 4, tags: ['good'] },
        { rating: 3, tags: ['ok'] },
        { rating: 5, tags: ['good'] },
        { rating: 2, tags: ['bad'] }
      ];
      const result = aggregateFeedback(entries);
      assert.equal(result.visible, false);
      assert.equal(result.count, 4);
      assert.equal(result.averageRating, undefined);
      assert.equal(result.themes, undefined);
    });

    it('should reveal results when group has exactly MIN_GROUP_SIZE entries (5 entries)', () => {
      const entries = [
        { rating: 4, tags: ['safety'] },
        { rating: 3, tags: ['safety', 'schedule'] },
        { rating: 5, tags: ['pay'] },
        { rating: 2, tags: ['schedule'] },
        { rating: 1, tags: ['pay', 'safety'] }
      ];
      const result = aggregateFeedback(entries);
      assert.equal(result.visible, true);
      assert.equal(result.count, 5);
      assert.equal(result.averageRating, 3); // (4+3+5+2+1)/5 = 3.0
      assert.ok(Array.isArray(result.themes));
      assert.ok(result.themes.length > 0);

      // Safety appears 3 times, should be top theme
      assert.equal(result.themes[0].label, 'safety');
      assert.equal(result.themes[0].count, 3);
    });

    it('should respect custom minGroup parameter', () => {
      const entries = [{ rating: 4 }, { rating: 3 }];
      const hidden = aggregateFeedback(entries, 3);
      assert.equal(hidden.visible, false);

      const shown = aggregateFeedback(entries, 2);
      assert.equal(shown.visible, true);
    });

    it('should confirm MIN_GROUP_SIZE constant is 5', () => {
      assert.equal(MIN_GROUP_SIZE, 5);
    });
  });
});

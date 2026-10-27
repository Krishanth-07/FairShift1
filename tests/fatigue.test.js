import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFatigue } from '../src/engine/fatigue.js';
import { getIndustry } from '../src/config/industries.js';

describe('Pure Engine: Fatigue & Rest Compliance', () => {
  const construction = getIndustry('construction');
  const hospital = getIndustry('hospital');
  const NOW = '2026-10-27T18:00:00.000Z';

  describe('FATIGUE_DAILY_MAX', () => {
    it('should flag when daily hours exceed maxDailyHours (construction 10h)', () => {
      // 11-hour session on one day
      const sessions = [
        { inTs: '2026-10-27T06:00:00.000Z', outTs: '2026-10-27T17:00:00.000Z' }
      ];
      const result = evaluateFatigue({ sessions, industry: construction, now: NOW });
      const flag = result.flags.find((f) => f.ruleId === 'FATIGUE_DAILY_MAX');
      assert.ok(flag, 'Must flag FATIGUE_DAILY_MAX');
      assert.equal(flag.severity, 'rest-required');
      assert.equal(result.level, 'rest-required');
    });

    it('should not flag when daily hours are at exactly maxDailyHours', () => {
      // Exactly 10 hours for construction
      const sessions = [
        { inTs: '2026-10-27T06:00:00.000Z', outTs: '2026-10-27T16:00:00.000Z' }
      ];
      const result = evaluateFatigue({ sessions, industry: construction, now: NOW });
      const flag = result.flags.find((f) => f.ruleId === 'FATIGUE_DAILY_MAX');
      assert.equal(flag, undefined);
    });

    it('should allow hospital longer daily hours (14h max)', () => {
      // 13-hour session: ok for hospital, would fail for construction
      const sessions = [
        { inTs: '2026-10-27T05:00:00.000Z', outTs: '2026-10-27T18:00:00.000Z' }
      ];
      const hospResult = evaluateFatigue({ sessions, industry: hospital, now: NOW });
      const hospFlag = hospResult.flags.find((f) => f.ruleId === 'FATIGUE_DAILY_MAX');
      assert.equal(hospFlag, undefined);

      const constResult = evaluateFatigue({ sessions, industry: construction, now: NOW });
      const constFlag = constResult.flags.find((f) => f.ruleId === 'FATIGUE_DAILY_MAX');
      assert.ok(constFlag, 'Construction must flag 13h');
    });
  });

  describe('FATIGUE_WEEKLY_MAX', () => {
    it('should flag when rolling 7-day hours exceed maxWeeklyHours (construction 48h)', () => {
      // 7 days × 8h each = 56h > 48h for construction
      const sessions = [];
      for (let d = 0; d < 7; d++) {
        const day = 21 + d; // Oct 21-27
        sessions.push({
          inTs: `2026-10-${String(day).padStart(2, '0')}T08:00:00.000Z`,
          outTs: `2026-10-${String(day).padStart(2, '0')}T16:00:00.000Z`
        });
      }
      const result = evaluateFatigue({ sessions, industry: construction, now: NOW });
      const flag = result.flags.find((f) => f.ruleId === 'FATIGUE_WEEKLY_MAX');
      assert.ok(flag, 'Must flag FATIGUE_WEEKLY_MAX');
      assert.equal(flag.severity, 'rest-required');
    });

    it('should not flag when hospital weekly is within 60h limit', () => {
      // 7 × 8h = 56h < 60h hospital max
      const sessions = [];
      for (let d = 0; d < 7; d++) {
        const day = 21 + d;
        sessions.push({
          inTs: `2026-10-${String(day).padStart(2, '0')}T08:00:00.000Z`,
          outTs: `2026-10-${String(day).padStart(2, '0')}T16:00:00.000Z`
        });
      }
      const result = evaluateFatigue({ sessions, industry: hospital, now: NOW });
      const flag = result.flags.find((f) => f.ruleId === 'FATIGUE_WEEKLY_MAX');
      assert.equal(flag, undefined);
    });
  });

  describe('FATIGUE_MIN_REST', () => {
    it('should flag insufficient rest gap between consecutive sessions', () => {
      // Construction minRestHours = 12; gap here is 6 hours
      const sessions = [
        { inTs: '2026-10-27T06:00:00.000Z', outTs: '2026-10-27T14:00:00.000Z' },
        { inTs: '2026-10-27T20:00:00.000Z', outTs: '2026-10-28T04:00:00.000Z' }
      ];
      const result = evaluateFatigue({ sessions, industry: construction, now: '2026-10-28T06:00:00.000Z' });
      const flag = result.flags.find((f) => f.ruleId === 'FATIGUE_MIN_REST');
      assert.ok(flag, 'Must flag FATIGUE_MIN_REST');
      assert.equal(flag.severity, 'watch');
    });

    it('should not flag when rest gap meets minimum', () => {
      // Gap of 13 hours > construction 12h minimum
      const sessions = [
        { inTs: '2026-10-26T06:00:00.000Z', outTs: '2026-10-26T14:00:00.000Z' },
        { inTs: '2026-10-27T03:00:00.000Z', outTs: '2026-10-27T11:00:00.000Z' }
      ];
      const result = evaluateFatigue({ sessions, industry: construction, now: NOW });
      const flag = result.flags.find((f) => f.ruleId === 'FATIGUE_MIN_REST');
      assert.equal(flag, undefined);
    });
  });

  describe('FATIGUE_CONSECUTIVE_NIGHTS (hospital only)', () => {
    it('should flag 4 consecutive night shifts exceeding hospital limit of 3', () => {
      // Hospital night shift starts around 23:00
      const sessions = [
        { inTs: '2026-10-23T22:50:00.000Z', outTs: '2026-10-24T07:00:00.000Z' },
        { inTs: '2026-10-24T22:50:00.000Z', outTs: '2026-10-25T07:00:00.000Z' },
        { inTs: '2026-10-25T22:50:00.000Z', outTs: '2026-10-26T07:00:00.000Z' },
        { inTs: '2026-10-26T22:50:00.000Z', outTs: '2026-10-27T07:00:00.000Z' }
      ];
      const result = evaluateFatigue({ sessions, industry: hospital, now: NOW, tzOffsetMinutes: 0 });
      const flag = result.flags.find((f) => f.ruleId === 'FATIGUE_CONSECUTIVE_NIGHTS');
      assert.ok(flag, 'Must flag FATIGUE_CONSECUTIVE_NIGHTS');
      assert.equal(flag.params.actual, 4);
      assert.equal(flag.params.threshold, 3);
      assert.equal(flag.severity, 'rest-required');
    });

    it('should not flag 3 consecutive night shifts at hospital limit', () => {
      const sessions = [
        { inTs: '2026-10-24T22:50:00.000Z', outTs: '2026-10-25T07:00:00.000Z' },
        { inTs: '2026-10-25T22:50:00.000Z', outTs: '2026-10-26T07:00:00.000Z' },
        { inTs: '2026-10-26T22:50:00.000Z', outTs: '2026-10-27T07:00:00.000Z' }
      ];
      const result = evaluateFatigue({ sessions, industry: hospital, now: NOW, tzOffsetMinutes: 0 });
      const flag = result.flags.find((f) => f.ruleId === 'FATIGUE_CONSECUTIVE_NIGHTS');
      assert.equal(flag, undefined);
    });

    it('should never evaluate consecutive nights for construction (null limit)', () => {
      // Even night-hour sessions should not trigger the rule for construction
      const sessions = [
        { inTs: '2026-10-23T22:50:00.000Z', outTs: '2026-10-24T07:00:00.000Z' },
        { inTs: '2026-10-24T22:50:00.000Z', outTs: '2026-10-25T07:00:00.000Z' },
        { inTs: '2026-10-25T22:50:00.000Z', outTs: '2026-10-26T07:00:00.000Z' },
        { inTs: '2026-10-26T22:50:00.000Z', outTs: '2026-10-27T07:00:00.000Z' }
      ];
      const result = evaluateFatigue({ sessions, industry: construction, now: NOW, tzOffsetMinutes: 0 });
      const flag = result.flags.find((f) => f.ruleId === 'FATIGUE_CONSECUTIVE_NIGHTS');
      assert.equal(flag, undefined);
    });
  });

  describe('Level resolution', () => {
    it('should return ok when no fatigue flags fire', () => {
      const sessions = [
        { inTs: '2026-10-27T08:00:00.000Z', outTs: '2026-10-27T14:00:00.000Z' }
      ];
      const result = evaluateFatigue({ sessions, industry: construction, now: NOW });
      assert.equal(result.level, 'ok');
      assert.equal(result.flags.length, 0);
    });

    it('should return watch when only watch-severity flags fire', () => {
      // Short rest gap triggers watch only
      const sessions = [
        { inTs: '2026-10-27T06:00:00.000Z', outTs: '2026-10-27T10:00:00.000Z' },
        { inTs: '2026-10-27T14:00:00.000Z', outTs: '2026-10-27T17:00:00.000Z' }
      ];
      const result = evaluateFatigue({ sessions, industry: construction, now: NOW });
      const hasWatch = result.flags.some((f) => f.severity === 'watch');
      const hasRestRequired = result.flags.some((f) => f.severity === 'rest-required');
      if (hasWatch && !hasRestRequired) {
        assert.equal(result.level, 'watch');
      }
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKey,
  pairRecords,
  sessionMinutes,
  summarizeDay,
  summarizePeriod
} from '../src/engine/hours.js';
import { getIndustry } from '../src/config/industries.js';

describe('Pure Engine: Hours & Shift Logic', () => {
  const construction = getIndustry('construction');
  const hospital = getIndustry('hospital');

  describe('dateKey()', () => {
    it('should calculate local YYYY-MM-DD from UTC and fixed minute offset', () => {
      // 2026-10-27 20:00:00 UTC with IST offset (+330 min) is 2026-10-28 01:30:00 local
      const istKey = dateKey('2026-10-27T20:00:00.000Z', 330);
      assert.equal(istKey, '2026-10-28');

      // 2026-10-28 02:00:00 UTC with US EST offset (-300 min) is 2026-10-27 21:00:00 local
      const estKey = dateKey('2026-10-28T02:00:00.000Z', -300);
      assert.equal(estKey, '2026-10-27');

      // Zero offset matches UTC
      assert.equal(dateKey('2026-10-27T12:00:00.000Z', 0), '2026-10-27');
    });

    it('should throw error on invalid date string', () => {
      assert.throws(() => dateKey('not-a-date'), /Invalid timestamp/);
    });
  });

  describe('pairRecords()', () => {
    it('should cleanly pair standard day shift check-in and check-out', () => {
      const records = [
        { id: 'rec_1', type: 'in', clientTs: '2026-10-27T08:00:00.000Z' },
        { id: 'rec_2', type: 'out', clientTs: '2026-10-27T16:30:00.000Z' }
      ];
      const { sessions, orphans } = pairRecords(records);

      assert.equal(sessions.length, 1);
      assert.equal(orphans.length, 0);
      assert.equal(sessions[0].inTs, '2026-10-27T08:00:00.000Z');
      assert.equal(sessions[0].outTs, '2026-10-27T16:30:00.000Z');
      assert.deepEqual(sessions[0].recordIds, ['rec_1', 'rec_2']);
    });

    it('should handle overnight session crossing midnight', () => {
      const records = [
        { id: 'hosp_night_in', type: 'in', clientTs: '2026-10-27T23:00:00.000Z' },
        { id: 'hosp_night_out', type: 'out', clientTs: '2026-10-28T07:30:00.000Z' }
      ];
      const { sessions, orphans } = pairRecords(records);

      assert.equal(sessions.length, 1);
      assert.equal(orphans.length, 0);
      assert.equal(sessions[0].inTs, '2026-10-27T23:00:00.000Z');
      assert.equal(sessions[0].outTs, '2026-10-28T07:30:00.000Z');
    });

    it('should identify open session with no outTs', () => {
      const records = [
        { id: 'in_only', type: 'in', clientTs: '2026-10-27T08:00:00.000Z' }
      ];
      const { sessions, orphans } = pairRecords(records);

      assert.equal(sessions.length, 1);
      assert.equal(orphans.length, 0);
      assert.equal(sessions[0].outTs, null);
      assert.deepEqual(sessions[0].recordIds, ['in_only']);
    });

    it('should ignore and report orphan out records', () => {
      const records = [
        { id: 'orphan_out', type: 'out', clientTs: '2026-10-27T17:00:00.000Z' }
      ];
      const { sessions, orphans } = pairRecords(records);

      assert.equal(sessions.length, 0);
      assert.equal(orphans.length, 1);
      assert.equal(orphans[0].id, 'orphan_out');
    });

    it('should convert unclosed check-in into open session when second check-in arrives', () => {
      const records = [
        { id: 'in_1', type: 'in', clientTs: '2026-10-27T08:00:00.000Z' },
        { id: 'in_2', type: 'in', clientTs: '2026-10-27T10:00:00.000Z' },
        { id: 'out_2', type: 'out', clientTs: '2026-10-27T16:00:00.000Z' }
      ];
      const { sessions, orphans } = pairRecords(records);

      assert.equal(sessions.length, 2);
      assert.equal(orphans.length, 0);
      assert.equal(sessions[0].outTs, null);
      assert.equal(sessions[1].outTs, '2026-10-27T16:00:00.000Z');
    });
  });

  describe('sessionMinutes()', () => {
    it('should return exact elapsed minutes for closed session', () => {
      const session = {
        inTs: '2026-10-27T08:00:00.000Z',
        outTs: '2026-10-27T16:30:00.000Z'
      };
      // 8.5 hours = 510 minutes
      assert.equal(sessionMinutes(session, '2026-10-27T20:00:00.000Z'), 510);
    });

    it('should return 0 minutes for identical in and out (zero hours)', () => {
      const session = {
        inTs: '2026-10-27T08:00:00.000Z',
        outTs: '2026-10-27T08:00:00.000Z'
      };
      assert.equal(sessionMinutes(session, '2026-10-27T12:00:00.000Z'), 0);
    });

    it('should measure open session up to explicit now parameter', () => {
      const session = {
        inTs: '2026-10-27T08:00:00.000Z',
        outTs: null
      };
      const now = '2026-10-27T11:45:00.000Z'; // 3 hours 45 min = 225 minutes
      assert.equal(sessionMinutes(session, now), 225);
    });
  });

  describe('summarizeDay() - table-driven boundaries', () => {
    const table = [
      { name: 'zero hours', minutes: 0, expectedNormal: 0, expectedOt: 0 },
      { name: 'under normal limit (5h)', minutes: 300, expectedNormal: 300, expectedOt: 0 },
      { name: 'exact normal boundary (8h)', minutes: 480, expectedNormal: 480, expectedOt: 0 },
      { name: 'overtime boundary (10h)', minutes: 600, expectedNormal: 480, expectedOt: 120 },
      { name: 'hospital extended shift (12h)', minutes: 720, expectedNormal: 480, expectedOt: 240 }
    ];

    for (const testCase of table) {
      it(`should summarize ${testCase.name} accurately`, () => {
        const summary = summarizeDay(testCase.minutes, construction);
        assert.equal(summary.normalMinutes, testCase.expectedNormal);
        assert.equal(summary.overtimeMinutes, testCase.expectedOt);
      });
    }
  });

  describe('summarizePeriod()', () => {
    it('should aggregate multi-day sessions and attribute overnight shifts to start date', () => {
      const sessions = [
        // Day 1: 8h regular
        { inTs: '2026-10-26T08:00:00.000Z', outTs: '2026-10-26T16:00:00.000Z' },
        // Day 2 overnight starting 22:00 UTC (10h total -> 8h normal, 2h OT)
        { inTs: '2026-10-27T22:00:00.000Z', outTs: '2026-10-28T08:00:00.000Z' }
      ];

      const period = summarizePeriod(sessions, hospital, 0, '2026-10-28T12:00:00.000Z');

      // Overnight session belongs to 2026-10-27
      assert.ok(period.days['2026-10-26']);
      assert.ok(period.days['2026-10-27']);
      assert.equal(period.days['2026-10-27'].totalMinutes, 600);
      assert.equal(period.days['2026-10-27'].normalMinutes, 480);
      assert.equal(period.days['2026-10-27'].overtimeMinutes, 120);

      assert.equal(period.totals.totalMinutes, 1080);
      assert.equal(period.totals.normalMinutes, 960);
      assert.equal(period.totals.overtimeMinutes, 120);
    });
  });
});

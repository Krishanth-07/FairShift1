import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectAnomalies, detectCloneCheckins } from '../src/engine/anomaly.js';
import { getIndustry } from '../src/config/industries.js';

describe('Pure Engine: Operational Anomaly & Roster Checks', () => {
  const construction = getIndustry('construction');
  const hospital = getIndustry('hospital');
  const SERVER_NOW = '2026-10-27T18:00:00.000Z';

  describe('DUPLICATE_IN Rule', () => {
    it('should flag consecutive check-ins without an intervening check-out (positive)', () => {
      const records = [
        { id: 'r1', type: 'in', clientTs: '2026-10-27T08:00:00.000Z' },
        { id: 'r2', type: 'in', clientTs: '2026-10-27T09:00:00.000Z' },
        { id: 'r3', type: 'out', clientTs: '2026-10-27T16:00:00.000Z' }
      ];

      const anomalies = detectAnomalies({
        records,
        sessions: [],
        serverNowIso: SERVER_NOW,
        industry: construction
      });

      const dupFlag = anomalies.find((a) => a.ruleId === 'DUPLICATE_IN');
      assert.ok(dupFlag, 'Must flag DUPLICATE_IN anomaly');
      assert.equal(dupFlag.severity, 'warn');
      assert.deepEqual(dupFlag.recordIds, ['r1', 'r2']);
      assert.match(dupFlag.message, /Consecutive check-in events recorded/);
    });

    it('should NOT flag properly paired check-in and check-out sequences (negative)', () => {
      const records = [
        { id: 'r1', type: 'in', clientTs: '2026-10-27T08:00:00.000Z' },
        { id: 'r2', type: 'out', clientTs: '2026-10-27T12:00:00.000Z' },
        { id: 'r3', type: 'in', clientTs: '2026-10-27T13:00:00.000Z' },
        { id: 'r4', type: 'out', clientTs: '2026-10-27T17:00:00.000Z' }
      ];

      const anomalies = detectAnomalies({
        records,
        sessions: [],
        serverNowIso: SERVER_NOW,
        industry: construction
      });

      const dupFlag = anomalies.find((a) => a.ruleId === 'DUPLICATE_IN');
      assert.equal(dupFlag, undefined);
    });
  });

  describe('IMPOSSIBLE_SESSION Rule', () => {
    it('should flag continuous sessions exceeding 24 hours (positive)', () => {
      const sessions = [
        {
          inTs: '2026-10-25T08:00:00.000Z',
          outTs: '2026-10-26T10:00:00.000Z', // 26 hours = 1560 minutes
          recordIds: ['s1_in', 's1_out']
        }
      ];

      const anomalies = detectAnomalies({
        records: [],
        sessions,
        serverNowIso: SERVER_NOW,
        industry: hospital
      });

      const flag = anomalies.find((a) => a.ruleId === 'IMPOSSIBLE_SESSION');
      assert.ok(flag, 'Must flag IMPOSSIBLE_SESSION');
      assert.equal(flag.severity, 'warn');
      assert.equal(flag.params.durationHours, 26);
    });

    it('should NOT flag normal long sessions within 24h limits (negative)', () => {
      const sessions = [
        {
          inTs: '2026-10-27T07:00:00.000Z',
          outTs: '2026-10-27T21:00:00.000Z', // 14 hours
          recordIds: ['s1_in', 's1_out']
        }
      ];

      const anomalies = detectAnomalies({
        records: [],
        sessions,
        serverNowIso: SERVER_NOW,
        industry: hospital
      });

      const flag = anomalies.find((a) => a.ruleId === 'IMPOSSIBLE_SESSION');
      assert.equal(flag, undefined);
    });
  });

  describe('LATE_SYNC Rule', () => {
    it('should flag offline record synchronized beyond lateSyncWarnHours (positive)', () => {
      // Construction warn threshold is 24 hours
      // Client punch was 30 hours ago
      const clientTs = '2026-10-26T12:00:00.000Z'; // 30 hours before SERVER_NOW (18:00 on Oct 27)
      const records = [
        { id: 'offline_rec_1', type: 'in', clientTs }
      ];

      const anomalies = detectAnomalies({
        records,
        sessions: [],
        serverNowIso: SERVER_NOW,
        industry: construction
      });

      const flag = anomalies.find((a) => a.ruleId === 'LATE_SYNC');
      assert.ok(flag, 'Must flag LATE_SYNC');
      assert.equal(flag.severity, 'info');
      assert.equal(flag.params.thresholdHours, 24);
      assert.equal(flag.params.delayHours, 30);
    });

    it('should NOT flag records synchronized promptly within threshold (negative)', () => {
      // 2 hours ago
      const clientTs = '2026-10-27T16:00:00.000Z';
      const records = [
        { id: 'timely_rec', type: 'in', clientTs }
      ];

      const anomalies = detectAnomalies({
        records,
        sessions: [],
        serverNowIso: SERVER_NOW,
        industry: construction
      });

      const flag = anomalies.find((a) => a.ruleId === 'LATE_SYNC');
      assert.equal(flag, undefined);
    });
  });

  describe('OVERTIME_SPIKE Rule', () => {
    it('should flag sudden overtime surge doubling historical baseline (positive)', () => {
      // Worker historically does 30m OT per day (8.5h sessions).
      // On day 4, worker logs 11h (180m OT).
      const sessions = [
        { inTs: '2026-10-20T08:00:00.000Z', outTs: '2026-10-20T16:30:00.000Z', recordIds: ['s1'] }, // 30m OT
        { inTs: '2026-10-21T08:00:00.000Z', outTs: '2026-10-21T16:30:00.000Z', recordIds: ['s2'] }, // 30m OT
        { inTs: '2026-10-22T08:00:00.000Z', outTs: '2026-10-22T16:30:00.000Z', recordIds: ['s3'] }, // 30m OT
        { inTs: '2026-10-23T08:00:00.000Z', outTs: '2026-10-23T19:00:00.000Z', recordIds: ['s4'] }  // 180m OT
      ];

      const anomalies = detectAnomalies({
        records: [],
        sessions,
        serverNowIso: SERVER_NOW,
        industry: construction,
        tzOffsetMinutes: 0
      });

      const flag = anomalies.find((a) => a.ruleId === 'OVERTIME_SPIKE');
      assert.ok(flag, 'Must flag OVERTIME_SPIKE');
      assert.equal(flag.severity, 'warn');
      assert.equal(flag.params.actualMinutes, 180);
      assert.equal(flag.params.averageMinutes, 30);
    });

    it('should NOT flag consistent regular overtime patterns (negative)', () => {
      // Consistent 60m overtime every day
      const sessions = [
        { inTs: '2026-10-20T08:00:00.000Z', outTs: '2026-10-20T17:00:00.000Z', recordIds: ['s1'] },
        { inTs: '2026-10-21T08:00:00.000Z', outTs: '2026-10-21T17:00:00.000Z', recordIds: ['s2'] },
        { inTs: '2026-10-22T08:00:00.000Z', outTs: '2026-10-22T17:00:00.000Z', recordIds: ['s3'] }
      ];

      const anomalies = detectAnomalies({
        records: [],
        sessions,
        serverNowIso: SERVER_NOW,
        industry: construction,
        tzOffsetMinutes: 0
      });

      const flag = anomalies.find((a) => a.ruleId === 'OVERTIME_SPIKE');
      assert.equal(flag, undefined);
    });
  });

  describe('NIGHT_ROSTER_MISMATCH Rule', () => {
    it('should flag check-in more than 2 hours away from any configured shift (positive)', () => {
      // Construction shifts: 07:00 and 15:30.
      // Punch at 02:30 UTC with tzOffset 0 is >4 hours from either shift.
      const records = [
        { id: 'weird_punch', type: 'in', clientTs: '2026-10-27T02:30:00.000Z' }
      ];

      const anomalies = detectAnomalies({
        records,
        sessions: [],
        serverNowIso: SERVER_NOW,
        industry: construction,
        tzOffsetMinutes: 0
      });

      const flag = anomalies.find((a) => a.ruleId === 'NIGHT_ROSTER_MISMATCH');
      assert.ok(flag, 'Must flag NIGHT_ROSTER_MISMATCH');
      assert.equal(flag.severity, 'info');
      assert.equal(flag.params.punchTime, '02:30');
    });

    it('should NOT flag check-in close to a rostered shift start (negative)', () => {
      // Construction shift begins at 07:00; worker punches in at 07:15
      const records = [
        { id: 'normal_punch', type: 'in', clientTs: '2026-10-27T07:15:00.000Z' }
      ];

      const anomalies = detectAnomalies({
        records,
        sessions: [],
        serverNowIso: SERVER_NOW,
        industry: construction,
        tzOffsetMinutes: 0
      });

      const flag = anomalies.find((a) => a.ruleId === 'NIGHT_ROSTER_MISMATCH');
      assert.equal(flag, undefined);
    });

    it('should correctly recognise hospital night shift at 23:00', () => {
      // Hospital night shift begins at 23:00; worker punches in at 22:45
      const records = [
        { id: 'hosp_night_punch', type: 'in', clientTs: '2026-10-27T22:45:00.000Z' }
      ];

      const anomalies = detectAnomalies({
        records,
        sessions: [],
        serverNowIso: SERVER_NOW,
        industry: hospital,
        tzOffsetMinutes: 0
      });

      const flag = anomalies.find((a) => a.ruleId === 'NIGHT_ROSTER_MISMATCH');
      assert.equal(flag, undefined);
    });
  });

  describe('detectCloneCheckins()', () => {
    it('should flag when 3+ distinct workers check in within the same minute at the same site (positive)', () => {
      const records = [
        { id: 'rec_a', type: 'in', siteId: 'site_10', workerId: 'worker_A', clientTs: '2026-10-27T08:00:10.000Z' },
        { id: 'rec_b', type: 'in', siteId: 'site_10', workerId: 'worker_B', clientTs: '2026-10-27T08:00:25.000Z' },
        { id: 'rec_c', type: 'in', siteId: 'site_10', workerId: 'worker_C', clientTs: '2026-10-27T08:00:55.000Z' }
      ];

      const flags = detectCloneCheckins(records);

      assert.equal(flags.length, 1);
      assert.equal(flags[0].ruleId, 'CLONE_CHECKIN_CLUSTER');
      assert.equal(flags[0].params.workerCount, 3);
      assert.deepEqual(flags[0].recordIds, ['rec_a', 'rec_b', 'rec_c']);
      assert.match(flags[0].message, /Flagged for roster verification/);
    });

    it('should NOT flag when fewer than 3 workers check in within the minute (negative)', () => {
      const records = [
        { id: 'rec_a', type: 'in', siteId: 'site_10', workerId: 'worker_A', clientTs: '2026-10-27T08:00:10.000Z' },
        { id: 'rec_b', type: 'in', siteId: 'site_10', workerId: 'worker_B', clientTs: '2026-10-27T08:00:25.000Z' }
      ];

      const flags = detectCloneCheckins(records);
      assert.equal(flags.length, 0);
    });

    it('should NOT flag 3 check-ins split across different minutes or sites (negative)', () => {
      const records = [
        { id: 'rec_a', type: 'in', siteId: 'site_10', workerId: 'worker_A', clientTs: '2026-10-27T08:00:10.000Z' },
        { id: 'rec_b', type: 'in', siteId: 'site_10', workerId: 'worker_B', clientTs: '2026-10-27T08:02:25.000Z' }, // different minute
        { id: 'rec_c', type: 'in', siteId: 'site_99', workerId: 'worker_C', clientTs: '2026-10-27T08:00:55.000Z' }  // different site
      ];

      const flags = detectCloneCheckins(records);
      assert.equal(flags.length, 0);
    });
  });

  describe('Neutral Language Enforcement', () => {
    it('should ensure anomaly messages are neutral operational flags without accusations', () => {
      const records = [
        { id: 'r1', type: 'in', clientTs: '2026-10-27T08:00:00.000Z' },
        { id: 'r2', type: 'in', clientTs: '2026-10-27T08:00:05.000Z' }
      ];
      const anomalies = detectAnomalies({
        records,
        sessions: [],
        serverNowIso: SERVER_NOW,
        industry: construction
      });

      const accusatoryWords = ['fraud', 'cheat', 'guilty', 'fake', 'stole', 'crime', 'illegal', 'punish'];
      for (const item of anomalies) {
        const lowerMsg = item.message.toLowerCase();
        for (const word of accusatoryWords) {
          assert.equal(
            lowerMsg.includes(word),
            false,
            `Message "${item.message}" should not contain accusatory word "${word}".`
          );
        }
      }
    });
  });
});

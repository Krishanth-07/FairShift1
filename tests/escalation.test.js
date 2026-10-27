import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEscalation } from '../src/engine/escalation.js';
import { getIndustry } from '../src/config/industries.js';

describe('Pure Engine: Hazard Report Escalation', () => {
  const construction = getIndustry('construction');
  const hospital = getIndustry('hospital');

  describe('Construction escalation deadlines', () => {
    it('should escalate critical report after 2-hour deadline', () => {
      const result = evaluateEscalation({
        severity: 'critical',
        createdAtIso: '2026-10-27T10:00:00.000Z',
        status: 'open',
        nowIso: '2026-10-27T13:00:00.000Z', // 3 hours later
        industry: construction
      });
      assert.equal(result.escalated, true);
      assert.equal(result.hoursOpen, 3);
      assert.equal(result.hoursOverdue, 1);
    });

    it('should not escalate critical report before deadline', () => {
      const result = evaluateEscalation({
        severity: 'critical',
        createdAtIso: '2026-10-27T10:00:00.000Z',
        status: 'open',
        nowIso: '2026-10-27T11:30:00.000Z', // 1.5 hours later (< 2h deadline)
        industry: construction
      });
      assert.equal(result.escalated, false);
      assert.equal(result.hoursOverdue, 0);
    });

    it('should not escalate resolved report even past deadline', () => {
      const result = evaluateEscalation({
        severity: 'critical',
        createdAtIso: '2026-10-27T10:00:00.000Z',
        status: 'resolved',
        nowIso: '2026-10-27T20:00:00.000Z', // 10 hours later
        industry: construction
      });
      assert.equal(result.escalated, false);
      assert.equal(result.hoursOverdue, 0);
    });

    it('should calculate correct deadlineAtIso for low severity', () => {
      const result = evaluateEscalation({
        severity: 'low',
        createdAtIso: '2026-10-27T10:00:00.000Z',
        status: 'open',
        nowIso: '2026-10-27T12:00:00.000Z',
        industry: construction
      });
      // Construction low deadline = 72 hours
      assert.equal(result.deadlineAtIso, '2026-10-30T10:00:00.000Z');
      assert.equal(result.escalated, false);
    });
  });

  describe('Hospital escalation deadlines', () => {
    it('should escalate hospital critical after 1-hour deadline (tighter than construction)', () => {
      const result = evaluateEscalation({
        severity: 'critical',
        createdAtIso: '2026-10-27T10:00:00.000Z',
        status: 'open',
        nowIso: '2026-10-27T11:30:00.000Z', // 1.5 hours > 1h hospital critical deadline
        industry: hospital
      });
      assert.equal(result.escalated, true);
      assert.equal(result.hoursOverdue, 0.5);
    });

    it('should use different medium deadline for hospital (12h) vs construction (24h)', () => {
      const now = '2026-10-28T06:00:00.000Z'; // 20 hours after creation
      const created = '2026-10-27T10:00:00.000Z';

      const hospResult = evaluateEscalation({
        severity: 'medium', createdAtIso: created, status: 'open', nowIso: now, industry: hospital
      });
      const constResult = evaluateEscalation({
        severity: 'medium', createdAtIso: created, status: 'open', nowIso: now, industry: construction
      });

      // Hospital 12h deadline → escalated at 20h; construction 24h → not escalated
      assert.equal(hospResult.escalated, true);
      assert.equal(constResult.escalated, false);
    });
  });
});

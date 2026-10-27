import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advise } from '../src/engine/advocate.js';
import { getIndustry } from '../src/config/industries.js';

describe('Pure Engine: Worker Advocate Advisory', () => {
  const construction = getIndustry('construction');

  it('should prioritize rest-required above all other signals', () => {
    const result = advise({
      industry: construction,
      fatigue: {
        level: 'rest-required',
        flags: [{ ruleId: 'FATIGUE_DAILY_MAX', severity: 'rest-required', messageKey: 'test', params: {}, message: 'Too many hours' }]
      },
      reconciliation: { status: 'underpaid', reasons: [{ ruleId: 'PAY', message: 'Underpaid' }] },
      escalatedReports: [{ escalated: true }],
      anomalies: [{ ruleId: 'ANOMALY' }]
    });
    assert.equal(result.primary.id, 'rest_required');
    assert.equal(result.primary.severity, 'critical');
    assert.equal(result.reasons.length, 1);
    assert.equal(result.reasons[0].ruleId, 'FATIGUE_DAILY_MAX');
  });

  it('should prioritize underpaid over escalated hazard when no rest-required', () => {
    const result = advise({
      industry: construction,
      fatigue: { level: 'ok', flags: [] },
      reconciliation: { status: 'underpaid', reasons: [{ ruleId: 'PAY_RECONCILE_UNDERPAID', message: 'Owed money' }] },
      escalatedReports: [{ escalated: true }],
      anomalies: [{ ruleId: 'ANOMALY' }]
    });
    assert.equal(result.primary.id, 'underpaid');
    assert.equal(result.primary.severity, 'high');
  });

  it('should prioritize escalated hazard over informational anomalies', () => {
    const result = advise({
      industry: construction,
      fatigue: { level: 'ok', flags: [] },
      reconciliation: { status: 'match', reasons: [] },
      escalatedReports: [{ escalated: true }, { escalated: false }],
      anomalies: [{ ruleId: 'ANOMALY' }]
    });
    assert.equal(result.primary.id, 'escalated_hazard');
    assert.equal(result.primary.severity, 'high');
    assert.equal(result.reasons[0].params.count, 1);
  });

  it('should show fatigue watch when no higher-priority signals exist', () => {
    const result = advise({
      industry: construction,
      fatigue: {
        level: 'watch',
        flags: [{ ruleId: 'FATIGUE_MIN_REST', severity: 'watch', messageKey: 'test', params: {}, message: 'Short rest' }]
      },
      reconciliation: { status: 'match', reasons: [] },
      escalatedReports: [],
      anomalies: []
    });
    assert.equal(result.primary.id, 'fatigue_watch');
    assert.equal(result.primary.severity, 'medium');
  });

  it('should show informational anomalies when nothing else is active', () => {
    const result = advise({
      industry: construction,
      fatigue: { level: 'ok', flags: [] },
      reconciliation: { status: 'match', reasons: [] },
      escalatedReports: [],
      anomalies: [{ ruleId: 'LATE_SYNC', message: 'Late sync detected' }]
    });
    assert.equal(result.primary.id, 'anomalies_info');
    assert.equal(result.primary.severity, 'info');
  });

  it('should return all-clear when everything is nominal', () => {
    const result = advise({
      industry: construction,
      fatigue: { level: 'ok', flags: [] },
      reconciliation: { status: 'match', reasons: [] },
      escalatedReports: [],
      anomalies: []
    });
    assert.equal(result.primary.id, 'all_clear');
    assert.equal(result.primary.severity, 'info');
    assert.equal(result.primary.icon, '✅');
    assert.equal(result.reasons.length, 0);
  });

  it('should not count non-escalated reports as escalated hazards', () => {
    const result = advise({
      industry: construction,
      fatigue: { level: 'ok', flags: [] },
      reconciliation: null,
      escalatedReports: [{ escalated: false }, { escalated: false }],
      anomalies: []
    });
    assert.equal(result.primary.id, 'all_clear');
  });
});

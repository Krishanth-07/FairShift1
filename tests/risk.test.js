import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeRetentionRisk } from '../src/engine/risk.js';

describe('Pure Engine: Worker Retention Risk Scoring', () => {
  it('should return zero score and low level for a worker with no issues', () => {
    const result = computeRetentionRisk({
      fatigueFlags30d: 0,
      disputedDays30d: 0,
      payMismatches90d: 0,
      overtimeShare30d: 0
    });
    assert.equal(result.score, 0);
    assert.equal(result.level, 'low');
    assert.equal(result.reasons.length, 0);
  });

  it('should accumulate fatigue risk points (6 per flag, max 30)', () => {
    const result = computeRetentionRisk({
      fatigueFlags30d: 3,
      disputedDays30d: 0,
      payMismatches90d: 0,
      overtimeShare30d: 0
    });
    assert.equal(result.score, 18); // 3 × 6 = 18
    assert.equal(result.reasons[0].factor, 'fatigue');
    assert.equal(result.reasons[0].points, 18);
  });

  it('should cap fatigue points at 30', () => {
    const result = computeRetentionRisk({
      fatigueFlags30d: 10,
      disputedDays30d: 0,
      payMismatches90d: 0,
      overtimeShare30d: 0
    });
    const fatigueReason = result.reasons.find((r) => r.factor === 'fatigue');
    assert.equal(fatigueReason.points, 30);
  });

  it('should score medium level for moderate issues', () => {
    const result = computeRetentionRisk({
      fatigueFlags30d: 2,  // 12 points
      disputedDays30d: 1,  // 5 points
      payMismatches90d: 2, // 10 points
      overtimeShare30d: 0.1 // 4 points
    });
    assert.equal(result.score, 31);
    assert.equal(result.level, 'medium');
  });

  it('should score critical for heavily stressed worker', () => {
    const result = computeRetentionRisk({
      fatigueFlags30d: 5,   // 30 (capped)
      disputedDays30d: 5,   // 25 (capped)
      payMismatches90d: 5,  // 25 (capped)
      overtimeShare30d: 0.6 // 20 (capped at 50%+)
    });
    assert.equal(result.score, 100);
    assert.equal(result.level, 'critical');
    assert.equal(result.reasons.length, 4);
  });

  it('should clamp score at 100 even with extreme inputs', () => {
    const result = computeRetentionRisk({
      fatigueFlags30d: 100,
      disputedDays30d: 100,
      payMismatches90d: 100,
      overtimeShare30d: 1.0
    });
    assert.equal(result.score, 100);
  });

  it('should compute overtime points proportionally', () => {
    const result = computeRetentionRisk({
      fatigueFlags30d: 0,
      disputedDays30d: 0,
      payMismatches90d: 0,
      overtimeShare30d: 0.25 // 25% → round(0.25 * 40) = 10 points
    });
    assert.equal(result.score, 10);
    assert.equal(result.reasons[0].factor, 'overtime');
    assert.equal(result.reasons[0].points, 10);
  });
});

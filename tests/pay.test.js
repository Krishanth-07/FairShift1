import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePay, reconcile } from '../src/engine/pay.js';

describe('Pure Engine: Wage Computation & Reconciliation', () => {
  const HOURLY_RATE = 10000; // ₹100.00 / hour = 10,000 paise

  describe('computePay()', () => {
    it('should calculate standard normal shift in integer paise', () => {
      // 8 hours = 480 minutes @ 10,000 paise/hr = 80,000 paise (₹800.00)
      const pay = computePay({
        hourlyRatePaise: HOURLY_RATE,
        normalMinutes: 480,
        overtimeMinutes: 0,
        overtimeMultiplier: 1.5
      });

      assert.equal(pay.totalPaise, 80000);
      assert.equal(pay.lines[0].amountPaise, 80000);
      assert.equal(pay.lines[1].amountPaise, 0);
      assert.equal(Number.isInteger(pay.totalPaise), true);
    });

    it('should correctly split overtime with 1.5x multiplier', () => {
      // 8h normal (80,000) + 2h OT (120m @ 1.5x = 120 * 15,000 / 60 = 30,000) = 110,000 paise
      const pay = computePay({
        hourlyRatePaise: HOURLY_RATE,
        normalMinutes: 480,
        overtimeMinutes: 120,
        overtimeMultiplier: 1.5
      });

      assert.equal(pay.totalPaise, 110000);
      assert.equal(pay.lines[0].amountPaise, 80000);
      assert.equal(pay.lines[1].amountPaise, 30000);
    });

    it('should correctly calculate hospital 2.0x overtime multiplier', () => {
      // 8h normal (80,000) + 2h OT (120m @ 2.0x = 120 * 20,000 / 60 = 40,000) = 120,000 paise
      const pay = computePay({
        hourlyRatePaise: HOURLY_RATE,
        normalMinutes: 480,
        overtimeMinutes: 120,
        overtimeMultiplier: 2.0
      });

      assert.equal(pay.totalPaise, 120000);
      assert.equal(pay.lines[1].amountPaise, 40000);
    });

    it('should round paise to nearest integer without floating point leakage', () => {
      // 17 minutes @ 10,000 paise/hr: (17 * 10000) / 60 = 2833.333... -> 2833 paise
      const pay = computePay({
        hourlyRatePaise: HOURLY_RATE,
        normalMinutes: 17,
        overtimeMinutes: 0
      });

      assert.equal(pay.totalPaise, 2833);
      assert.equal(Number.isInteger(pay.totalPaise), true);
    });

    it('should handle zero hours cleanly', () => {
      const pay = computePay({
        hourlyRatePaise: HOURLY_RATE,
        normalMinutes: 0,
        overtimeMinutes: 0
      });
      assert.equal(pay.totalPaise, 0);
    });
  });

  describe('reconcile()', () => {
    it('should report exact match when logged equals payroll', () => {
      const result = reconcile({
        logged: { normalMinutes: 480, overtimeMinutes: 60 },
        payroll: { normalMinutes: 480, overtimeMinutes: 60 },
        hourlyRatePaise: HOURLY_RATE,
        overtimeMultiplier: 1.5,
        toleranceMinutes: 15
      });

      assert.equal(result.status, 'match');
      assert.equal(result.owedPaise, 0);
      assert.equal(result.diffNormalMinutes, 0);
      assert.equal(result.diffOvertimeMinutes, 0);
      assert.equal(result.reasons[0].ruleId, 'PAY_RECONCILE_MATCH');
    });

    it('should report match when discrepancy is within configured tolerance', () => {
      // 10 minutes variance is within 15 minutes tolerance
      const result = reconcile({
        logged: { normalMinutes: 480, overtimeMinutes: 10 },
        payroll: { normalMinutes: 480, overtimeMinutes: 0 },
        hourlyRatePaise: HOURLY_RATE,
        overtimeMultiplier: 1.5,
        toleranceMinutes: 15
      });

      assert.equal(result.status, 'match');
      assert.equal(result.reasons[0].ruleId, 'PAY_RECONCILE_MATCH');
      assert.match(result.reasons[0].message, /within allowed tolerance/);
    });

    it('should flag underpayment when logged exceeds payroll past tolerance', () => {
      // Logged 2h overtime (120m), payroll recorded 0m
      const result = reconcile({
        logged: { normalMinutes: 480, overtimeMinutes: 120 },
        payroll: { normalMinutes: 480, overtimeMinutes: 0 },
        hourlyRatePaise: HOURLY_RATE,
        overtimeMultiplier: 1.5,
        toleranceMinutes: 15
      });

      assert.equal(result.status, 'underpaid');
      assert.equal(result.owedPaise, 30000); // Worker is owed ₹300 (30,000 paise)
      assert.equal(result.diffOvertimeMinutes, 120);
      assert.equal(result.reasons[0].ruleId, 'PAY_RECONCILE_UNDERPAID');
    });

    it('should flag overpayment when payroll exceeds logged hours', () => {
      // Payroll paid for 8h (480m), worker logged 6h (360m)
      const result = reconcile({
        logged: { normalMinutes: 360, overtimeMinutes: 0 },
        payroll: { normalMinutes: 480, overtimeMinutes: 0 },
        hourlyRatePaise: HOURLY_RATE,
        overtimeMultiplier: 1.5,
        toleranceMinutes: 15
      });

      assert.equal(result.status, 'overpaid');
      assert.equal(result.owedPaise, -20000); // 120 mins @ 10,000 / 60 = 20,000 paise
      assert.equal(result.diffNormalMinutes, -120);
      assert.equal(result.reasons[0].ruleId, 'PAY_RECONCILE_OVERPAID');
    });
  });
});

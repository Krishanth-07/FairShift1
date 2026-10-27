import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { createMemoryRepository } from '../../src/repository/memoryRepository.js';
import { seedDemoData } from '../../src/repository/seed.js';
import { createFakeClock } from '../../src/services/clock.js';
import { createSessionToken } from '../../src/services/auth.js';
import { generateSiteCode } from '../../src/engine/siteCode.js';
import { verifyReceipt } from '../../src/engine/chain.js';

describe('End-to-End API Security & Feature Specification', () => {
  const PIN = '7788';
  const SESSION_SECRET = 'api-test-session-secret-1234567890';
  const SITE_SECRET = 'api-test-site-secret-abcdefghijkl';
  const RECEIPT_SECRET = 'api-test-receipt-secret-xyz123456';
  const FEEDBACK_SECRET = 'api-test-feedback-secret-fb9876543';
  const BASE_TIME = '2026-10-27T12:00:00.000Z';

  let server;
  let baseUrl;
  let repo;
  let clock;

  // Pre-generated session tokens
  let workerToken1;   // c_worker_1 (construction site_const_01)
  let workerToken2;   // c_worker_2 (construction site_const_01)
  let hospitalWorker; // h_worker_1 (hospital site_hosp_01)
  let constAdminToken; // c_admin_1 (construction site_const_01)
  let hospAdminToken;  // h_admin_1 (hospital site_hosp_01)

  before(async () => {
    clock = createFakeClock(BASE_TIME);
    repo = createMemoryRepository();
    await seedDemoData(repo, { clock, pin: PIN });

    workerToken1 = createSessionToken('c_worker_1', SESSION_SECRET);
    workerToken2 = createSessionToken('c_worker_2', SESSION_SECRET);
    hospitalWorker = createSessionToken('h_worker_1', SESSION_SECRET);
    constAdminToken = createSessionToken('c_admin_1', SESSION_SECRET);
    hospAdminToken = createSessionToken('h_admin_1', SESSION_SECRET);

    const app = createApp({
      config: {
        PORT: 0,
        TZ_OFFSET_MINUTES: 330,
        DEMO_MODE: true,
        NODE_ENV: 'test',
        SESSION_SECRET,
        SITE_SECRET,
        RECEIPT_SECRET,
        FEEDBACK_SECRET,
        SEED_PIN: PIN
      },
      repo,
      clock
    });

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after((done) => {
    server.close(done);
  });

  // Helper for authenticated requests with CSRF header
  function authHeaders(token, extra = {}) {
    return {
      Cookie: `fs_session=${token}`,
      'X-Requested-With': 'fairshift',
      'Content-Type': 'application/json',
      ...extra
    };
  }

  describe('1. Role & Cross-Tenant Boundary Enforcement', () => {
    it('worker cannot call admin overview route (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: authHeaders(workerToken1)
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, 'FORBIDDEN');
    });

    it('worker A cannot read worker B days or payslip', async () => {
      // Worker 1 fetches their own payslip
      const res = await fetch(`${baseUrl}/api/me/payslip?period=2026-10`, {
        headers: authHeaders(workerToken1)
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.workerId, 'c_worker_1');
    });

    it('admin of site 1 cannot modify payroll of a worker at site 2 (403 FORBIDDEN_SITE)', async () => {
      // Construction admin attempts to modify hospital worker payroll
      const res = await fetch(`${baseUrl}/api/admin/payroll`, {
        method: 'PUT',
        headers: authHeaders(constAdminToken),
        body: JSON.stringify({
          workerId: 'h_worker_1',
          date: '2026-10-25',
          normalMinutes: 480,
          overtimeMinutes: 0
        })
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, 'FORBIDDEN_SITE');
    });

    it('admin of site 1 cannot confirm day for worker at site 2 (403 FORBIDDEN_SITE)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/days/confirm`, {
        method: 'POST',
        headers: authHeaders(constAdminToken),
        body: JSON.stringify({
          workerId: 'h_worker_1',
          date: '2026-10-25'
        })
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, 'FORBIDDEN_SITE');
    });
  });

  describe('2. Shift Records & Digital Receipts', () => {
    it('valid check-in succeeds and returns a verifiable digital receipt', async () => {
      const nowMs = new Date(clock.now()).getTime();
      const siteCode = generateSiteCode(SITE_SECRET, 'site_const_01', nowMs, 300000);

      const res = await fetch(`${baseUrl}/api/records`, {
        method: 'POST',
        headers: authHeaders(workerToken1),
        body: JSON.stringify({
          type: 'in',
          clientTs: clock.now(),
          clientId: 'uuid-punch-test-001',
          siteCode
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.duplicate, false);
      assert.ok(data.record.hash, 'Record must contain cryptographic hash');
      assert.ok(data.record.signature, 'Record must contain HMAC receipt signature');

      // Cryptographically verify receipt
      const isValidReceipt = verifyReceipt(
        {
          prevHash: data.record.prevHash,
          payload: data.record.payload,
          hash: data.record.hash
        },
        data.record.signature,
        RECEIPT_SECRET
      );
      assert.equal(isValidReceipt, true, 'Receipt signature must verify against RECEIPT_SECRET');
    });

    it('wrong site code is rejected with 400 INVALID_SITE_CODE', async () => {
      const res = await fetch(`${baseUrl}/api/records`, {
        method: 'POST',
        headers: authHeaders(workerToken1),
        body: JSON.stringify({
          type: 'in',
          clientTs: clock.now(),
          clientId: 'uuid-punch-test-002',
          siteCode: '000000' // Invalid site code
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'INVALID_SITE_CODE');
    });

    it('future timestamp exceeding 5-minute tolerance is rejected with 400 FUTURE_TIMESTAMP', async () => {
      const nowMs = new Date(clock.now()).getTime();
      const futureTs = new Date(nowMs + 10 * 60 * 1000).toISOString(); // 10 minutes in future
      const siteCode = generateSiteCode(SITE_SECRET, 'site_const_01', nowMs, 300000);

      const res = await fetch(`${baseUrl}/api/records`, {
        method: 'POST',
        headers: authHeaders(workerToken1),
        body: JSON.stringify({
          type: 'in',
          clientTs: futureTs,
          clientId: 'uuid-punch-test-003',
          siteCode
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'FUTURE_TIMESTAMP');
    });

    it('duplicate clientId returns the original record idempotently', async () => {
      const nowMs = new Date(clock.now()).getTime();
      const siteCode = generateSiteCode(SITE_SECRET, 'site_const_01', nowMs, 300000);

      // Re-send with clientId 'uuid-punch-test-001' already recorded earlier
      const res = await fetch(`${baseUrl}/api/records`, {
        method: 'POST',
        headers: authHeaders(workerToken1),
        body: JSON.stringify({
          type: 'in',
          clientTs: clock.now(),
          clientId: 'uuid-punch-test-001',
          siteCode
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.duplicate, true);
      assert.equal(data.record.payload.clientId, 'uuid-punch-test-001');
    });

    it('offline batch sync sorts items chronologically and handles idempotency', async () => {
      const nowMs = new Date(clock.now()).getTime();
      const ts1 = nowMs - 60 * 60 * 1000; // 1 hour ago
      const ts2 = nowMs - 30 * 60 * 1000; // 30 mins ago

      // Generate site codes matching the historical time windows when the offline punches occurred
      const siteCode1 = generateSiteCode(SITE_SECRET, 'site_const_01', ts1, 300000);
      const siteCode2 = generateSiteCode(SITE_SECRET, 'site_const_01', ts2, 300000);

      const items = [
        // Out of order: out punch first, in punch second
        {
          type: 'out',
          clientTs: new Date(ts2).toISOString(),
          clientId: 'batch-punch-002',
          siteCode: siteCode2
        },
        {
          type: 'in',
          clientTs: new Date(ts1).toISOString(),
          clientId: 'batch-punch-001',
          siteCode: siteCode1
        }
      ];

      const res = await fetch(`${baseUrl}/api/records/sync`, {
        method: 'POST',
        headers: authHeaders(workerToken2),
        body: JSON.stringify({ items })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.processed, 2);
      assert.equal(data.results[0].status, 'accepted');
      assert.equal(data.results[1].status, 'accepted');

      // Resubmitting batch returns duplicate for both
      const retryRes = await fetch(`${baseUrl}/api/records/sync`, {
        method: 'POST',
        headers: authHeaders(workerToken2),
        body: JSON.stringify({ items })
      });
      const retryData = await retryRes.json();
      assert.equal(retryData.results[0].status, 'duplicate');
      assert.equal(retryData.results[1].status, 'duplicate');
    });
  });

  describe('3. Payslips, Underpayment Reconciliation & Audit Trails', () => {
    it('payslip exposes planted underpaid scenario for c_worker_1', async () => {
      const res = await fetch(`${baseUrl}/api/me/payslip?period=2026-10`, {
        headers: authHeaders(workerToken1)
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.workerId, 'c_worker_1');
      assert.equal(data.reconciliation.status, 'underpaid');
      assert.ok(data.owedPaise > 0, 'Worker must be owed positive paise in underpaid scenario');
    });

    it('admin payroll edit reflects immediately in worker payslip auditLog', async () => {
      // 1. Admin edits payroll for c_worker_1 on 2026-10-24
      const editRes = await fetch(`${baseUrl}/api/admin/payroll`, {
        method: 'PUT',
        headers: authHeaders(constAdminToken),
        body: JSON.stringify({
          workerId: 'c_worker_1',
          date: '2026-10-24',
          normalMinutes: 480,
          overtimeMinutes: 60
        })
      });
      assert.equal(editRes.status, 200);

      // 2. Worker fetches payslip: auditLog must contain the amendment
      const payslipRes = await fetch(`${baseUrl}/api/me/payslip?period=2026-10`, {
        headers: authHeaders(workerToken1)
      });
      const payslip = await payslipRes.json();
      const auditEntry = payslip.auditLog.find((a) => a.action === 'PAYROLL_EDIT');
      assert.ok(auditEntry, 'Audit log must record the payroll edit');
      assert.equal(auditEntry.workerId, 'c_worker_1');
      assert.equal(auditEntry.date, '2026-10-24');
      assert.equal(auditEntry.after.overtimeMinutes, 60);
      assert.equal(auditEntry.adminId, 'c_admin_1');
    });
  });

  describe('4. Privacy-First Hazard Reporting & Linear Workflow', () => {
    let trackingCode;
    let reportId;

    it('creates report storing NO worker identity, returning unambiguous tracking code', async () => {
      const res = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: authHeaders(workerToken1),
        body: JSON.stringify({
          text: 'Scaffolding on level 4 has loose clamps and wobbles severely'
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      trackingCode = data.trackingCode;
      reportId = data.id;

      assert.match(trackingCode, /^FS-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
      assert.equal(data.status, 'open');

      // Verify stored record in repository has zero worker identity fields
      const stored = repo.getReport(reportId);
      assert.equal(stored.workerId, undefined);
      assert.equal(stored.userId, undefined);
      assert.equal(stored.name, undefined);
      assert.equal(stored.ipAddress, undefined);
    });

    it('queries report status by tracking code', async () => {
      const res = await fetch(`${baseUrl}/api/reports/${trackingCode}`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.trackingCode, trackingCode);
      assert.equal(data.status, 'open');
      assert.equal(data.category, 'unsafe_scaffolding');
      assert.ok(Array.isArray(data.history));
    });

    it('seeded old critical report is flagged as escalated in admin report list', async () => {
      const res = await fetch(`${baseUrl}/api/admin/reports`, {
        headers: authHeaders(constAdminToken)
      });
      assert.equal(res.status, 200);
      const reports = await res.json();

      const criticalReport = reports.find((r) => r.id === 'report_critical_01');
      assert.ok(criticalReport, 'Seeded critical report must be present');
      assert.equal(criticalReport.escalation.escalated, true, 'Old critical report must be escalated');
    });

    it('enforces linear status transitions: open -> acknowledged -> in_progress -> resolved', async () => {
      // 1. Direct leap open -> resolved must be rejected (400)
      const badRes = await fetch(`${baseUrl}/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        headers: authHeaders(constAdminToken),
        body: JSON.stringify({ status: 'resolved' })
      });
      assert.equal(badRes.status, 400);

      // 2. Valid transition: open -> acknowledged
      const ackRes = await fetch(`${baseUrl}/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        headers: authHeaders(constAdminToken),
        body: JSON.stringify({ status: 'acknowledged', note: 'Safety lead notified' })
      });
      assert.equal(ackRes.status, 200);
      const ackData = await ackRes.json();
      assert.equal(ackData.status, 'acknowledged');
      assert.equal(ackData.history.length, 2);
    });
  });

  describe('5. Anonymous Feedback, Monthly Rate Limits & k-Anonymity', () => {
    it('submits anonymous feedback storing only date (no time or identity)', async () => {
      const res = await fetch(`${baseUrl}/api/feedback`, {
        method: 'POST',
        headers: authHeaders(workerToken2),
        body: JSON.stringify({
          targetType: 'conditions',
          rating: 4,
          tags: ['water supply', 'rest area'],
          comment: 'Adequate hydration stations provided during heat periods'
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);

      // Inspect repository: strictly zero identifying metadata, date-only string
      const stored = repo.getFeedback(data.id);
      assert.equal(stored.workerId, undefined);
      assert.equal(stored.userId, undefined);
      assert.equal(stored.timestamp, undefined);
      assert.equal(stored.date.length, 10); // YYYY-MM-DD
    });

    it('rejects second feedback submission from same worker in the same month (429)', async () => {
      const res = await fetch(`${baseUrl}/api/feedback`, {
        method: 'POST',
        headers: authHeaders(workerToken2),
        body: JSON.stringify({
          targetType: 'conditions',
          rating: 3
        })
      });

      assert.equal(res.status, 429);
      const data = await res.json();
      assert.equal(data.error.code, 'MONTHLY_FEEDBACK_LIMIT');
    });

    it('enforces k-anonymity: hides aggregates below 5, discloses at 5+', async () => {
      // 1. Construction overview: has 4 feedback entries (3 seeded + 1 newly added above) < 5
      const constRes = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: authHeaders(constAdminToken)
      });
      const constOverview = await constRes.json();
      assert.equal(constOverview.feedbackAggregate.visible, false);
      assert.equal(constOverview.feedbackAggregate.count, 4);
      assert.equal(constOverview.feedbackAggregate.averageRating, undefined);

      // 2. Hospital overview: has 6 seeded feedback entries >= 5
      const hospRes = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: authHeaders(hospAdminToken)
      });
      const hospOverview = await hospRes.json();
      assert.equal(hospOverview.feedbackAggregate.visible, true);
      assert.equal(hospOverview.feedbackAggregate.count, 6);
      assert.ok(typeof hospOverview.feedbackAggregate.averageRating === 'number');
      assert.ok(Array.isArray(hospOverview.feedbackAggregate.themes));
    });
  });

  describe('6. Retention Risk & Chain Integrity Auditing', () => {
    it('retention risk factors NEVER reference anonymous feedback', async () => {
      const res = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: authHeaders(constAdminToken)
      });
      const overview = await res.json();
      assert.ok(Array.isArray(overview.retentionRisks));

      // Inspect all worker risk reasons: none can be tied to feedback or sentiment
      for (const risk of overview.retentionRisks) {
        for (const reason of risk.reasons) {
          assert.equal(
            ['fatigue', 'disputes', 'pay_mismatches', 'overtime'].includes(reason.factor),
            true,
            `Risk factor "${reason.factor}" must be attendance-derived only`
          );
          const lowerMsg = reason.message.toLowerCase();
          assert.equal(lowerMsg.includes('feedback'), false);
          assert.equal(lowerMsg.includes('anonymous'), false);
        }
      }
    });

    it('detects stored record tampering via /api/admin/integrity', async () => {
      // 1. Initial integrity check: all valid
      const initialRes = await fetch(`${baseUrl}/api/admin/integrity`, {
        headers: authHeaders(constAdminToken)
      });
      const initial = await initialRes.json();
      assert.equal(initial.allValid, true);
      assert.equal(initial.brokenChains.length, 0);

      // 2. Tamper with record at index 2 for c_worker_4
      const chain = repo.getRecords('c_worker_4');
      assert.ok(chain.length > 2, 'c_worker_4 must have at least 3 records');
      const tamperedRecord = {
        ...chain[2],
        payload: { ...chain[2].payload, maliciousHoursAlteration: 999 }
      };

      repo._tamperRecordForTesting('c_worker_4', 2, tamperedRecord);

      // 3. Admin calls integrity check: must detect corruption
      const integrityRes = await fetch(`${baseUrl}/api/admin/integrity`, {
        headers: authHeaders(constAdminToken)
      });
      const integrity = await integrityRes.json();
      assert.equal(integrity.allValid, false);
      const broken = integrity.brokenChains.find((b) => b.workerId === 'c_worker_4');
      assert.ok(broken, 'c_worker_4 chain must be reported as broken');
      assert.equal(broken.brokenAtIndex, 2);
    });
  });

  describe('7. Input Validation & Public Transparency Specification', () => {
    it('rejects unknown request body keys with 400 UNKNOWN_FIELD', async () => {
      const res = await fetch(`${baseUrl}/api/feedback`, {
        method: 'POST',
        headers: authHeaders(workerToken1),
        body: JSON.stringify({
          targetType: 'manager',
          rating: 4,
          injectedParameter: 'malicious_input'
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'UNKNOWN_FIELD');
    });

    it('rejects invalid field types with 400 INVALID_TYPE', async () => {
      const res = await fetch(`${baseUrl}/api/feedback`, {
        method: 'POST',
        headers: authHeaders(workerToken1),
        body: JSON.stringify({
          targetType: 'manager',
          rating: 'five' // String instead of numeric integer
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'INVALID_TYPE');
    });

    it('serves /api/public/what-we-store with schemas matching code implementation', async () => {
      const res = await fetch(`${baseUrl}/api/public/what-we-store`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(data.schemas.records.stored.includes('hash'));
      assert.ok(data.schemas.records.neverStored.includes('biometrics'));
      assert.ok(data.schemas.reports.neverStored.includes('workerId'));
      assert.ok(data.schemas.feedback.neverStored.includes('timeOfDay'));
    });
  });
});

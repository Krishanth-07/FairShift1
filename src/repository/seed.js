/**
 * @file Demo Seed Data Generator
 *
 * Populates the repository with deterministic demo data relative to clock.now().
 * Seeds realistic scenarios for testing and demonstration including pay mismatches,
 * consecutive night shifts, short rest gaps, escalated hazard reports, and
 * anonymous feedback with k-anonymity boundaries.
 */

import crypto from 'node:crypto';
import { GENESIS_HASH, createRecord } from '../engine/chain.js';
import { dateKey } from '../engine/hours.js';

/**
 * Hashes a PIN using scrypt with a deterministic salt derived from the userId.
 * Mirrors the auth service hashing but uses a seed-stable salt for reproducibility.
 *
 * @param {string} pin - Numeric PIN string.
 * @param {string} salt - Per-user salt string.
 * @returns {Promise<string>} Hex-encoded hash.
 */
function hashPinSync(pin, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(derived.toString('hex'));
    });
  });
}

/**
 * Generates a deterministic salt from a userId for seed reproducibility.
 * @param {string} userId
 * @returns {string}
 */
function seedSalt(userId) {
  return crypto.createHash('sha256').update(`seed-salt:${userId}`).digest('hex').slice(0, 32);
}

/**
 * Creates a timestamped ISO string relative to a base, offset by days and hours.
 * @param {string} baseIso
 * @param {number} dayOffset
 * @param {number} hour
 * @param {number} [minute=0]
 * @returns {string}
 */
function makeTs(baseIso, dayOffset, hour, minute = 0) {
  const d = new Date(baseIso);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Appends a chain record to the repository for a worker.
 * @param {object} repo
 * @param {string} workerId
 * @param {object} payload
 * @returns {object} The created record.
 */
function appendChainRecord(repo, workerId, payload) {
  const head = repo.getChainHead(workerId);
  const prevHash = head ? head.hash : GENESIS_HASH;
  const record = createRecord({ prevHash, payload });
  repo.appendRecord(workerId, record);
  return record;
}

/**
 * Seeds demo data into the repository.
 *
 * @param {object} repo - Memory repository instance.
 * @param {object} opts
 * @param {object} opts.clock - Clock providing now().
 * @param {string} opts.pin - Base PIN for all demo users.
 * @returns {Promise<void>}
 */
export async function seedDemoData(repo, { clock, pin }) {
  const nowIso = clock.now();
  const today = new Date(nowIso);
  today.setUTCHours(0, 0, 0, 0);
  const baseIso = today.toISOString();

  // ─── Sites ──────────────────────────────────────────────
  repo.putSite({
    id: 'site_const_01',
    name: 'Greenfield Tower Construction',
    industryId: 'construction',
    location: 'Bangalore, India'
  });
  repo.putSite({
    id: 'site_hosp_01',
    name: 'City General Hospital',
    industryId: 'hospital',
    location: 'Chennai, India'
  });

  // ─── Users ──────────────────────────────────────────────
  const users = [
    // Construction workers
    { id: 'c_worker_1', name: 'Rajesh Kumar',    siteId: 'site_const_01', role: 'worker', lang: 'hi', hourlyRatePaise: 12500 },
    { id: 'c_worker_2', name: 'Anand Sharma',    siteId: 'site_const_01', role: 'worker', lang: 'en', hourlyRatePaise: 11000 },
    { id: 'c_worker_3', name: 'Muthu Vel',       siteId: 'site_const_01', role: 'worker', lang: 'ta', hourlyRatePaise: 11500 },
    { id: 'c_worker_4', name: 'Suresh Patel',    siteId: 'site_const_01', role: 'worker', lang: 'hi', hourlyRatePaise: 12000 },
    { id: 'c_admin_1',  name: 'Priya Desai',     siteId: 'site_const_01', role: 'admin',  lang: 'en', hourlyRatePaise: 0 },

    // Hospital workers
    { id: 'h_worker_1', name: 'Kavitha Rajan',   siteId: 'site_hosp_01', role: 'worker', lang: 'ta', hourlyRatePaise: 15000 },
    { id: 'h_worker_2', name: 'Deepa Nair',      siteId: 'site_hosp_01', role: 'worker', lang: 'en', hourlyRatePaise: 14000 },
    { id: 'h_worker_3', name: 'Arjun Singh',     siteId: 'site_hosp_01', role: 'worker', lang: 'hi', hourlyRatePaise: 13500 },
    { id: 'h_worker_4', name: 'Meena Kumari',    siteId: 'site_hosp_01', role: 'worker', lang: 'ta', hourlyRatePaise: 14500 },
    { id: 'h_admin_1',  name: 'Vikram Reddy',    siteId: 'site_hosp_01', role: 'admin',  lang: 'en', hourlyRatePaise: 0 }
  ];

  for (const u of users) {
    const salt = seedSalt(u.id);
    const pinHash = await hashPinSync(pin, salt);
    repo.putUser({ ...u, pinHash, pinSalt: salt });
  }

  // ─── Week of check-in/out records ─────────────────────
  // Standard shifts for most workers (7 days back from today)
  const constructionWorkers = ['c_worker_1', 'c_worker_2', 'c_worker_3', 'c_worker_4'];
  const hospitalWorkers = ['h_worker_1', 'h_worker_2', 'h_worker_3', 'h_worker_4'];

  // Standard construction day shifts
  for (const wId of constructionWorkers) {
    for (let d = -7; d < 0; d++) {
      const inTs = makeTs(baseIso, d, 7, 0);
      const outTs = makeTs(baseIso, d, 15, 30);
      appendChainRecord(repo, wId, { type: 'in', clientTs: inTs, siteId: 'site_const_01', workerId: wId });
      appendChainRecord(repo, wId, { type: 'out', clientTs: outTs, siteId: 'site_const_01', workerId: wId });
    }
  }

  // Standard hospital day shifts
  for (const wId of hospitalWorkers) {
    for (let d = -7; d < 0; d++) {
      const inTs = makeTs(baseIso, d, 7, 0);
      const outTs = makeTs(baseIso, d, 15, 30);
      appendChainRecord(repo, wId, { type: 'in', clientTs: inTs, siteId: 'site_hosp_01', workerId: wId });
      appendChainRecord(repo, wId, { type: 'out', clientTs: outTs, siteId: 'site_hosp_01', workerId: wId });
    }
  }

  // ─── Scenario (a): Construction worker with payroll LOWER than logged hours ──
  // c_worker_1 logged 8.5h on day -3 but payroll only records 7h
  const scenarioADate = dateKey(makeTs(baseIso, -3, 12, 0), 0);
  repo.putPayroll('c_worker_1', scenarioADate, { normalMinutes: 420, overtimeMinutes: 0 });
  // Actual logged: 7:00-15:30 = 510 min = 480 normal + 30 OT

  // ─── Scenario (b): Hospital worker with 3 consecutive night shifts ──
  // h_worker_2 worked night shifts on days -3, -2, -1
  for (let d = -3; d <= -1; d++) {
    const nightIn = makeTs(baseIso, d, 23, 0);
    const nightOut = makeTs(baseIso, d + 1, 7, 30);
    appendChainRecord(repo, 'h_worker_2', { type: 'in', clientTs: nightIn, siteId: 'site_hosp_01', workerId: 'h_worker_2' });
    appendChainRecord(repo, 'h_worker_2', { type: 'out', clientTs: nightOut, siteId: 'site_hosp_01', workerId: 'h_worker_2' });
  }

  // ─── Scenario (c): Worker with short rest gap ──
  // c_worker_3: extra late shift on day -2, then early start on day -1
  const lateOut = makeTs(baseIso, -2, 22, 0);
  appendChainRecord(repo, 'c_worker_3', { type: 'in', clientTs: makeTs(baseIso, -2, 16, 0), siteId: 'site_const_01', workerId: 'c_worker_3' });
  appendChainRecord(repo, 'c_worker_3', { type: 'out', clientTs: lateOut, siteId: 'site_const_01', workerId: 'c_worker_3' });
  // Next day starts at 5:00 → only 7h rest, below construction 12h minimum

  const earlyIn = makeTs(baseIso, -1, 5, 0);
  const earlyOut = makeTs(baseIso, -1, 13, 0);
  appendChainRecord(repo, 'c_worker_3', { type: 'in', clientTs: earlyIn, siteId: 'site_const_01', workerId: 'c_worker_3' });
  appendChainRecord(repo, 'c_worker_3', { type: 'out', clientTs: earlyOut, siteId: 'site_const_01', workerId: 'c_worker_3' });

  // ─── Scenario (d): Critical hazard report old enough to be escalated ──
  // Construction critical deadline = 2h; this report is 5h old
  repo.putReport({
    id: 'report_critical_01',
    siteId: 'site_const_01',
    category: 'structural_hazard',
    severity: 'critical',
    text: 'Large crack observed in load-bearing wall on floor 3',
    status: 'open',
    createdAt: makeTs(baseIso, 0, -5, 0)
  });

  // ─── Scenario (e): Open medium report ──
  repo.putReport({
    id: 'report_medium_01',
    siteId: 'site_hosp_01',
    category: 'staffing_shortage',
    severity: 'medium',
    text: 'Ward 4 has only 2 nurses for 30 patients on night shift',
    status: 'open',
    createdAt: makeTs(baseIso, 0, -2, 0)
  });

  // ─── Scenario (f): 5+ anonymous feedback at hospital, only 3 at construction ──
  // Hospital: 6 entries → above MIN_GROUP_SIZE threshold
  const hospFeedbackEntries = [
    { rating: 3, tags: ['schedule', 'fatigue'] },
    { rating: 4, tags: ['safety', 'teamwork'] },
    { rating: 2, tags: ['schedule', 'understaffed'] },
    { rating: 3, tags: ['fatigue', 'management'] },
    { rating: 5, tags: ['teamwork'] },
    { rating: 1, tags: ['schedule', 'fatigue', 'management'] }
  ];
  for (let i = 0; i < hospFeedbackEntries.length; i++) {
    repo.putFeedback({
      id: `fb_hosp_${i + 1}`,
      siteId: 'site_hosp_01',
      timestamp: dateKey(makeTs(baseIso, -(i + 1), 12, 0), 0),
      ...hospFeedbackEntries[i]
    });
  }

  // Construction: 3 entries → below MIN_GROUP_SIZE threshold
  const constFeedbackEntries = [
    { rating: 4, tags: ['safety'] },
    { rating: 3, tags: ['pay'] },
    { rating: 2, tags: ['heat'] }
  ];
  for (let i = 0; i < constFeedbackEntries.length; i++) {
    repo.putFeedback({
      id: `fb_const_${i + 1}`,
      siteId: 'site_const_01',
      timestamp: dateKey(makeTs(baseIso, -(i + 1), 12, 0), 0),
      ...constFeedbackEntries[i]
    });
  }

  // ─── Scenario (g): Disputed day ──
  // c_worker_4 has a disputed day status on day -4
  const disputedDate = dateKey(makeTs(baseIso, -4, 12, 0), 0);
  repo.putDayStatus('c_worker_4', disputedDate, { status: 'disputed', reason: 'Hours mismatch with supervisor log' });

  repo.appendAudit({
    action: 'SEED_DEMO_DATA',
    timestamp: nowIso,
    detail: 'Demo data seeded successfully with planted scenarios'
  });
}

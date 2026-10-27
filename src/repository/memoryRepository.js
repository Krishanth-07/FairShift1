/**
 * @file In-Memory Data Repository
 *
 * Swap for Firestore in production. This module provides a narrow CRUD-style
 * interface over plain JS data structures. All returned values are deep copies
 * to prevent callers from mutating shared state.
 */

/**
 * Deep-clone a value via structured clone.
 * @param {*} val
 * @returns {*}
 */
function clone(val) {
  if (val === undefined || val === null) return val;
  return structuredClone(val);
}

/**
 * Creates a fresh in-memory repository instance.
 * @returns {object} Repository with collection methods.
 */
export function createMemoryRepository() {
  const store = {
    sites: new Map(),
    users: new Map(),
    records: new Map(),       // Map<workerId, Array<record>>
    dayStatus: new Map(),     // Map<`${workerId}:${date}`, object>
    payroll: new Map(),       // Map<`${workerId}:${date}`, { normalMinutes, overtimeMinutes }>
    reports: new Map(),       // Map<reportId, object>  — NO workerId field
    feedback: new Map(),      // Map<feedbackId, object> — NO identifying fields
    submissionMarkers: new Set(),  // Set of HMAC strings for dedup
    auditLog: []              // append-only
  };

  return {
    // ─── Sites ────────────────────────────────────────────
    getSite(id) {
      return clone(store.sites.get(id)) || null;
    },
    getAllSites() {
      return [...store.sites.values()].map(clone);
    },
    putSite(site) {
      store.sites.set(site.id, clone(site));
    },

    // ─── Users ────────────────────────────────────────────
    getUser(id) {
      return clone(store.users.get(id)) || null;
    },
    getAllUsers() {
      return [...store.users.values()].map(clone);
    },
    getUsersBySite(siteId) {
      return [...store.users.values()]
        .filter((u) => u.siteId === siteId)
        .map(clone);
    },
    putUser(user) {
      store.users.set(user.id, clone(user));
    },

    // ─── Records (hash-chained per worker) ────────────────
    getRecords(workerId) {
      return clone(store.records.get(workerId) || []);
    },
    getChainHead(workerId) {
      const chain = store.records.get(workerId);
      if (!chain || chain.length === 0) return null;
      return clone(chain[chain.length - 1]);
    },
    /**
     * Appends a record to a worker's chain after verifying prevHash linkage.
     * @param {string} workerId
     * @param {object} record - Must have prevHash and hash fields.
     * @throws {Error} If prevHash does not match the current chain head.
     */
    appendRecord(workerId, record) {
      if (!store.records.has(workerId)) {
        store.records.set(workerId, []);
      }
      const chain = store.records.get(workerId);
      const headHash = chain.length > 0 ? chain[chain.length - 1].hash : null;

      // Genesis case: headHash is null, record.prevHash should be GENESIS_HASH
      if (headHash !== null && record.prevHash !== headHash) {
        throw new Error(
          `Chain integrity violation for worker "${workerId}": ` +
          `expected prevHash "${headHash}", got "${record.prevHash}".`
        );
      }
      chain.push(clone(record));
    },

    // ─── Day Status ───────────────────────────────────────
    getDayStatus(workerId, date) {
      return clone(store.dayStatus.get(`${workerId}:${date}`)) || null;
    },
    putDayStatus(workerId, date, status) {
      store.dayStatus.set(`${workerId}:${date}`, clone(status));
    },

    // ─── Payroll ──────────────────────────────────────────
    getPayroll(workerId, date) {
      return clone(store.payroll.get(`${workerId}:${date}`)) || null;
    },
    putPayroll(workerId, date, data) {
      store.payroll.set(`${workerId}:${date}`, clone(data));
    },
    getPayrollRange(workerId, startDate, endDate) {
      const results = [];
      for (const [key, val] of store.payroll.entries()) {
        if (key.startsWith(`${workerId}:`)) {
          const date = key.split(':')[1];
          if (date >= startDate && date <= endDate) {
            results.push({ date, ...clone(val) });
          }
        }
      }
      return results;
    },

    // ─── Reports (NO workerId field) ──────────────────────
    getReport(id) {
      return clone(store.reports.get(id)) || null;
    },
    getAllReports() {
      return [...store.reports.values()].map(clone);
    },
    getReportsBySite(siteId) {
      return [...store.reports.values()]
        .filter((r) => r.siteId === siteId)
        .map(clone);
    },
    putReport(report) {
      store.reports.set(report.id, clone(report));
    },

    // ─── Feedback (NO identifying fields) ─────────────────
    getFeedback(id) {
      return clone(store.feedback.get(id)) || null;
    },
    getAllFeedback() {
      return [...store.feedback.values()].map(clone);
    },
    getFeedbackBySite(siteId) {
      return [...store.feedback.values()]
        .filter((f) => f.siteId === siteId)
        .map(clone);
    },
    putFeedback(entry) {
      store.feedback.set(entry.id, clone(entry));
    },

    // ─── Submission Markers (dedup) ───────────────────────
    hasMarker(marker) {
      return store.submissionMarkers.has(marker);
    },
    addMarker(marker) {
      store.submissionMarkers.add(marker);
    },

    // ─── Audit Log (append-only) ──────────────────────────
    appendAudit(entry) {
      store.auditLog.push(clone(entry));
    },
    getAuditLog() {
      return clone(store.auditLog);
    },

    // ─── Utility ──────────────────────────────────────────
    isEmpty() {
      return store.sites.size === 0 && store.users.size === 0;
    }
  };
}

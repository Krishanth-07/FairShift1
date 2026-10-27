/**
 * @file Pure Function Hours Calculation Engine
 *
 * Implements deterministic shift pairing, duration tallying, and normal/overtime
 * calculations. Strictly pure: relies on explicit `now` and timezone offset parameters,
 * free of side-effects or system clock calls.
 */

/**
 * Derives a deterministic YYYY-MM-DD date key using a fixed minute offset from UTC.
 * Avoids environment DST quirks by performing pure UTC timestamp arithmetic.
 *
 * @param {string | number | Date} isoString - Source timestamp representation.
 * @param {number} tzOffsetMinutes - Timezone offset in minutes (e.g. +330 for IST).
 * @returns {string} Formatted date string "YYYY-MM-DD".
 */
export function dateKey(isoString, tzOffsetMinutes = 0) {
  const timestamp = new Date(isoString).getTime();
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid timestamp supplied to dateKey: "${isoString}".`);
  }
  // Shift timestamp by offset to align with local midnight boundaries
  const localMs = timestamp + tzOffsetMinutes * 60 * 1000;
  const localDate = new Date(localMs);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Reconstructs continuous work sessions from chronologically ordered check-in and check-out events.
 * Handles overnight shifts spanning midnight boundaries, unclosed (open) check-ins, and orphan check-outs.
 *
 * @param {Array<{ type: 'in' | 'out', clientTs: string, id?: string, recordId?: string }>} records - Raw punch records.
 * @returns {{ sessions: Array<{ inTs: string, outTs: string | null, recordIds: string[] }>, orphans: Array<object> }}
 */
export function pairRecords(records = []) {
  if (!Array.isArray(records)) {
    throw new Error('pairRecords requires an array of punch records.');
  }

  // Stable sort by chronological timestamp to ensure deterministic pairing
  const sorted = [...records].sort((a, b) => {
    return new Date(a.clientTs).getTime() - new Date(b.clientTs).getTime();
  });

  const sessions = [];
  const orphans = [];
  let currentOpenIn = null;

  for (let i = 0; i < sorted.length; i += 1) {
    const rec = sorted[i];
    const recId = rec.id || rec.recordId || `rec_${i}`;

    if (rec.type === 'in') {
      // If a previous check-in was never closed by an "out", record it as an unclosed/open session
      if (currentOpenIn) {
        sessions.push({
          inTs: currentOpenIn.clientTs,
          outTs: null,
          recordIds: [currentOpenIn.id]
        });
      }
      currentOpenIn = { clientTs: rec.clientTs, id: recId, raw: rec };
    } else if (rec.type === 'out') {
      if (currentOpenIn) {
        // Paired check-in and check-out form a completed session
        sessions.push({
          inTs: currentOpenIn.clientTs,
          outTs: rec.clientTs,
          recordIds: [currentOpenIn.id, recId]
        });
        currentOpenIn = null;
      } else {
        // An "out" without a preceding open "in" is an orphan punch
        orphans.push(rec);
      }
    }
  }

  // Any check-in still unmatched at the end of the stream represents an ongoing open session
  if (currentOpenIn) {
    sessions.push({
      inTs: currentOpenIn.clientTs,
      outTs: null,
      recordIds: [currentOpenIn.id]
    });
  }

  return { sessions, orphans };
}

/**
 * Computes elapsed working duration in whole minutes for a session.
 * For open sessions without an outTs, elapsed duration is measured against explicit `now`.
 *
 * @param {{ inTs: string, outTs: string | null }} session - Work session object.
 * @param {string | number | Date} now - Deterministic reference timestamp.
 * @returns {number} Session duration in elapsed minutes.
 */
export function sessionMinutes(session, now) {
  if (!session || !session.inTs) {
    return 0;
  }
  const startMs = new Date(session.inTs).getTime();
  const endMs = session.outTs ? new Date(session.outTs).getTime() : new Date(now).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((endMs - startMs) / 60000));
}

/**
 * Splits daily total minutes into regular contractual hours and overtime minutes.
 * Overtime begins immediately when daily duration exceeds normalDailyHours threshold.
 *
 * @param {number} totalMinutes - Total cumulative minutes worked on a calendar date.
 * @param {{ normalDailyHours: number }} industry - Industry configuration profile.
 * @returns {{ normalMinutes: number, overtimeMinutes: number }}
 */
export function summarizeDay(totalMinutes, industry) {
  if (!industry || typeof industry.normalDailyHours !== 'number') {
    throw new Error('summarizeDay requires an industry config with numeric normalDailyHours.');
  }
  const safeTotal = Math.max(0, Math.floor(totalMinutes || 0));
  const normalCapMinutes = Math.round(industry.normalDailyHours * 60);

  const normalMinutes = Math.min(safeTotal, normalCapMinutes);
  const overtimeMinutes = Math.max(0, safeTotal - normalCapMinutes);

  return { normalMinutes, overtimeMinutes };
}

/**
 * Produces day-by-day and aggregate summaries of work sessions for a payroll period.
 * An overnight session belongs to the local calendar date on which it commenced.
 *
 * @param {Array<{ inTs: string, outTs: string | null, recordIds?: string[] }>} sessions - Work sessions.
 * @param {{ normalDailyHours: number }} industry - Industry configuration profile.
 * @param {number} tzOffsetMinutes - Timezone offset in minutes.
 * @param {string | number | Date} now - Deterministic reference timestamp for open sessions.
 * @returns {{
 *   days: Record<string, { date: string, totalMinutes: number, normalMinutes: number, overtimeMinutes: number, sessions: Array<object> }>,
 *   totals: { totalMinutes: number, normalMinutes: number, overtimeMinutes: number }
 * }}
 */
export function summarizePeriod(sessions = [], industry, tzOffsetMinutes = 0, now) {
  if (!Array.isArray(sessions)) {
    throw new Error('summarizePeriod requires an array of sessions.');
  }

  const days = {};
  let overallTotal = 0;
  let overallNormal = 0;
  let overallOvertime = 0;

  for (const session of sessions) {
    const dayKey = dateKey(session.inTs, tzOffsetMinutes);
    if (!days[dayKey]) {
      days[dayKey] = {
        date: dayKey,
        totalMinutes: 0,
        normalMinutes: 0,
        overtimeMinutes: 0,
        sessions: []
      };
    }
    const mins = sessionMinutes(session, now);
    days[dayKey].totalMinutes += mins;
    days[dayKey].sessions.push(session);
  }

  // Calculate day-level breakdown of regular vs overtime minutes and accumulate period totals
  for (const day of Object.values(days)) {
    const daySummary = summarizeDay(day.totalMinutes, industry);
    day.normalMinutes = daySummary.normalMinutes;
    day.overtimeMinutes = daySummary.overtimeMinutes;

    overallTotal += day.totalMinutes;
    overallNormal += day.normalMinutes;
    overallOvertime += day.overtimeMinutes;
  }

  return {
    days,
    totals: {
      totalMinutes: overallTotal,
      normalMinutes: overallNormal,
      overtimeMinutes: overallOvertime
    }
  };
}

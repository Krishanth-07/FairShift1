/**
 * @file Pure Function Anomaly & Workforce Health Detection Engine
 *
 * Evaluates shift records for operational irregularities and roster discrepancies.
 * Crucial Design Philosophy: Anomalies are neutral operational flags surfaced for
 * human review, never accusations or automated penalties. All phrasing is objective.
 */

import { dateKey, sessionMinutes } from './hours.js';

/**
 * Evaluates punch records and sessions against deterministic operational rules.
 *
 * @param {object} params
 * @param {Array<object>} params.records - Chronological punch records.
 * @param {Array<object>} [params.sessions] - Reconstructed sessions (optional; calculated if omitted).
 * @param {string} params.serverNowIso - Deterministic server evaluation timestamp.
 * @param {object} params.industry - Industry configuration profile.
 * @param {number} [params.tzOffsetMinutes=0] - Timezone offset in minutes.
 * @returns {Array<{
 *   ruleId: string,
 *   severity: 'info' | 'warn',
 *   messageKey: string,
 *   params: object,
 *   message: string,
 *   recordIds: string[]
 * }>} Structured list of anomalies for human review.
 */
export function detectAnomalies({ records = [], sessions = [], serverNowIso, industry, tzOffsetMinutes = 0 }) {
  if (!industry) {
    throw new Error('detectAnomalies requires an industry configuration object.');
  }
  if (!serverNowIso) {
    throw new Error('detectAnomalies requires a serverNowIso timestamp parameter.');
  }

  const anomalies = [];
  const serverNowMs = new Date(serverNowIso).getTime();

  // 1. DUPLICATE_IN: Detect consecutive "in" punches without intervening check-out
  let previousIn = null;
  const sortedRecords = [...records].sort((a, b) => {
    return new Date(a.clientTs).getTime() - new Date(b.clientTs).getTime();
  });

  for (let i = 0; i < sortedRecords.length; i += 1) {
    const rec = sortedRecords[i];
    const recId = rec.id || rec.recordId || `rec_${i}`;

    if (rec.type === 'in') {
      if (previousIn) {
        anomalies.push({
          ruleId: 'DUPLICATE_IN',
          severity: 'warn',
          messageKey: 'rules.anomaly.duplicate_in',
          params: {
            firstTs: previousIn.clientTs,
            secondTs: rec.clientTs
          },
          message: `Consecutive check-in events recorded without an intervening check-out (${previousIn.clientTs} and ${rec.clientTs}). Flagged for review.`,
          recordIds: [previousIn.id, recId]
        });
      }
      previousIn = { clientTs: rec.clientTs, id: recId };
    } else if (rec.type === 'out') {
      previousIn = null;
    }

    // 2. LATE_SYNC: Offline record submitted long after claimed client timestamp
    const recordClientMs = new Date(rec.clientTs).getTime();
    const effectiveReceiveMs = rec.serverTs ? new Date(rec.serverTs).getTime() : serverNowMs;
    const syncDelayHours = (effectiveReceiveMs - recordClientMs) / (3600 * 1000);

    const warnHours = industry.lateSyncWarnHours || 24;
    if (syncDelayHours > warnHours) {
      anomalies.push({
        ruleId: 'LATE_SYNC',
        severity: 'info',
        messageKey: 'rules.anomaly.late_sync',
        params: {
          clientTs: rec.clientTs,
          delayHours: Math.round(syncDelayHours * 10) / 10,
          thresholdHours: warnHours
        },
        message: `Record synchronized ${Math.round(syncDelayHours * 10) / 10} hours after local punch timestamp, exceeding the ${warnHours}-hour threshold. Flagged for review.`,
        recordIds: [recId]
      });
    }

    // 3. NIGHT_ROSTER_MISMATCH: Check-in outside configured shift hours
    if (rec.type === 'in' && Array.isArray(industry.shifts) && industry.shifts.length > 0) {
      const localPunchMs = recordClientMs + tzOffsetMinutes * 60 * 1000;
      const localDate = new Date(localPunchMs);
      const punchMinutesOfDay = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();

      let minShiftDistance = Infinity;

      for (const shift of industry.shifts) {
        const [shiftHour, shiftMinute] = shift.start.split(':').map(Number);
        const shiftStartMinutes = shiftHour * 60 + shiftMinute;

        // Circular distance on a 24-hour (1440-minute) clock
        const directDiff = Math.abs(punchMinutesOfDay - shiftStartMinutes);
        const circularDiff = Math.min(directDiff, 1440 - directDiff);
        if (circularDiff < minShiftDistance) {
          minShiftDistance = circularDiff;
        }
      }

      // Flag if check-in is more than 2 hours (120 minutes) away from any rostered shift start
      if (minShiftDistance > 120) {
        const punchTimeFormatted = `${String(localDate.getUTCHours()).padStart(2, '0')}:${String(localDate.getUTCMinutes()).padStart(2, '0')}`;
        anomalies.push({
          ruleId: 'NIGHT_ROSTER_MISMATCH',
          severity: 'info',
          messageKey: 'rules.anomaly.roster_mismatch',
          params: {
            punchTime: punchTimeFormatted,
            distanceMinutes: minShiftDistance
          },
          message: `Check-in recorded at ${punchTimeFormatted} is ${Math.round(minShiftDistance / 60 * 10) / 10} hours away from scheduled shift windows. Flagged for roster alignment.`,
          recordIds: [recId]
        });
      }
    }
  }

  // 4. IMPOSSIBLE_SESSION: Check for continuous sessions exceeding 24 hours (1440 mins)
  for (const session of sessions) {
    const duration = sessionMinutes(session, serverNowIso);
    if (duration > 1440) {
      anomalies.push({
        ruleId: 'IMPOSSIBLE_SESSION',
        severity: 'warn',
        messageKey: 'rules.anomaly.impossible_session',
        params: {
          durationMinutes: duration,
          durationHours: Math.round(duration / 60 * 10) / 10
        },
        message: `Work session duration of ${Math.round(duration / 60 * 10) / 10} hours exceeds the 24-hour physiological threshold. Flagged for review.`,
        recordIds: session.recordIds || []
      });
    }
  }

  // 5. OVERTIME_SPIKE: Detect sudden anomalous surges in daily overtime relative to worker history
  const dayBuckets = {};
  for (const session of sessions) {
    const day = dateKey(session.inTs, tzOffsetMinutes);
    if (!dayBuckets[day]) {
      dayBuckets[day] = { totalMinutes: 0, recordIds: [] };
    }
    dayBuckets[day].totalMinutes += sessionMinutes(session, serverNowIso);
    if (Array.isArray(session.recordIds)) {
      dayBuckets[day].recordIds.push(...session.recordIds);
    }
  }

  const normalCapMinutes = Math.round(industry.normalDailyHours * 60);
  const dayOvertimeList = Object.entries(dayBuckets).map(([date, data]) => ({
    date,
    overtimeMinutes: Math.max(0, data.totalMinutes - normalCapMinutes),
    recordIds: data.recordIds
  }));

  // Analyze each day against trailing/historical days
  for (let i = 0; i < dayOvertimeList.length; i += 1) {
    const target = dayOvertimeList[i];
    const otherDays = dayOvertimeList.filter((_, idx) => idx !== i);

    // Minimum baseline threshold of 60 minutes overtime before triggering spike analysis
    if (target.overtimeMinutes >= 60 && otherDays.length > 0) {
      const avgOtherOvertime = otherDays.reduce((acc, d) => acc + d.overtimeMinutes, 0) / otherDays.length;

      // Flag if overtime is more than double the worker's average baseline
      if (avgOtherOvertime > 0 && target.overtimeMinutes > 2 * avgOtherOvertime) {
        anomalies.push({
          ruleId: 'OVERTIME_SPIKE',
          severity: 'warn',
          messageKey: 'rules.anomaly.overtime_spike',
          params: {
            date: target.date,
            actualMinutes: target.overtimeMinutes,
            averageMinutes: Math.round(avgOtherOvertime)
          },
          message: `Overtime on ${target.date} (${target.overtimeMinutes}m) is more than double the worker's trailing average (${Math.round(avgOtherOvertime)}m). Flagged for review.`,
          recordIds: target.recordIds
        });
      } else if (avgOtherOvertime === 0 && otherDays.length >= 2 && target.overtimeMinutes >= 120) {
        // Flag significant overtime in workers with zero historical overtime
        anomalies.push({
          ruleId: 'OVERTIME_SPIKE',
          severity: 'warn',
          messageKey: 'rules.anomaly.overtime_spike_new',
          params: {
            date: target.date,
            actualMinutes: target.overtimeMinutes,
            averageMinutes: 0
          },
          message: `Overtime on ${target.date} (${target.overtimeMinutes}m) represents a sudden surge compared to previous zero-overtime record. Flagged for review.`,
          recordIds: target.recordIds
        });
      }
    }
  }

  return anomalies;
}

/**
 * Flags instances where 3 or more distinct workers record check-ins during the exact same minute at a site.
 * Used to detect badge-cloning or batch attendance logging without making automated accusations.
 *
 * @param {Array<object>} allRecords - Raw attendance records across all workers.
 * @returns {Array<{
 *   ruleId: string,
 *   severity: 'warn',
 *   messageKey: string,
 *   params: object,
 *   message: string,
 *   recordIds: string[]
 * }>}
 */
export function detectCloneCheckins(allRecords = []) {
  if (!Array.isArray(allRecords)) {
    throw new Error('detectCloneCheckins requires an array of records.');
  }

  const clusters = {};

  for (let i = 0; i < allRecords.length; i += 1) {
    const rec = allRecords[i];
    if (rec.type !== 'in') {
      continue;
    }

    const siteId = rec.siteId || 'unknown_site';
    const timestamp = new Date(rec.clientTs);
    if (Number.isNaN(timestamp.getTime())) {
      continue;
    }

    // Isolate YYYY-MM-DDTHH:mm minute key
    const minuteKey = timestamp.toISOString().substring(0, 16);
    const clusterKey = `${siteId}::${minuteKey}`;

    if (!clusters[clusterKey]) {
      clusters[clusterKey] = {
        siteId,
        minuteKey,
        records: [],
        workerIds: new Set()
      };
    }

    const recId = rec.id || rec.recordId || `rec_${i}`;
    clusters[clusterKey].records.push(recId);
    if (rec.workerId) {
      clusters[clusterKey].workerIds.add(rec.workerId);
    }
  }

  const flags = [];

  for (const cluster of Object.values(clusters)) {
    if (cluster.workerIds.size >= 3) {
      flags.push({
        ruleId: 'CLONE_CHECKIN_CLUSTER',
        severity: 'warn',
        messageKey: 'rules.anomaly.clone_checkin',
        params: {
          siteId: cluster.siteId,
          minute: cluster.minuteKey,
          workerCount: cluster.workerIds.size
        },
        message: `${cluster.workerIds.size} workers recorded check-ins at site "${cluster.siteId}" within the same minute (${cluster.minuteKey}). Flagged for roster verification.`,
        recordIds: cluster.records
      });
    }
  }

  return flags;
}

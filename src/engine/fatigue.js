/**
 * @file Pure Function Fatigue & Rest Compliance Engine
 *
 * Evaluates worker shift history against industry-configured safety thresholds
 * for daily maximums, weekly maximums, minimum rest gaps, and consecutive night
 * shift limits. All time is passed explicitly—no system clock access.
 */

import { dateKey, sessionMinutes } from './hours.js';

/**
 * Determines whether a session overlaps with any night shift window on its start date.
 * A session is considered "night" if it starts within 2 hours of a configured night shift.
 *
 * @param {object} session - Session with inTs.
 * @param {object} industry - Industry config with shifts array.
 * @param {number} tzOffsetMinutes - Timezone offset in minutes.
 * @returns {boolean}
 */
function isNightSession(session, industry, tzOffsetMinutes) {
  if (!Array.isArray(industry.shifts)) return false;
  const nightShifts = industry.shifts.filter((s) => s.isNight);
  if (nightShifts.length === 0) return false;

  const inMs = new Date(session.inTs).getTime();
  const localMs = inMs + tzOffsetMinutes * 60 * 1000;
  const localDate = new Date(localMs);
  const punchMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();

  for (const shift of nightShifts) {
    const [h, m] = shift.start.split(':').map(Number);
    const shiftStart = h * 60 + m;
    const diff = Math.abs(punchMinutes - shiftStart);
    const circular = Math.min(diff, 1440 - diff);
    if (circular <= 120) return true;
  }
  return false;
}

/**
 * Evaluates fatigue and rest compliance for a worker's session history.
 *
 * @param {object} params
 * @param {Array<{ inTs: string, outTs: string|null, recordIds?: string[] }>} params.sessions - Work sessions.
 * @param {object} params.industry - Industry configuration profile.
 * @param {string} params.now - Deterministic evaluation timestamp (ISO string).
 * @param {number} [params.tzOffsetMinutes=0] - Timezone offset in minutes.
 * @returns {{
 *   level: 'ok' | 'watch' | 'rest-required',
 *   flags: Array<{ ruleId: string, severity: string, messageKey: string, params: object, message: string }>
 * }}
 */
export function evaluateFatigue({ sessions = [], industry, now, tzOffsetMinutes = 0 }) {
  if (!industry) throw new Error('evaluateFatigue requires an industry configuration.');
  if (!now) throw new Error('evaluateFatigue requires a deterministic now timestamp.');

  const flags = [];
  const nowMs = new Date(now).getTime();

  // --- DAILY_MAX: check each calendar day's total against industry.maxDailyHours ---
  const dayTotals = {};
  for (const s of sessions) {
    const day = dateKey(s.inTs, tzOffsetMinutes);
    if (!dayTotals[day]) dayTotals[day] = 0;
    dayTotals[day] += sessionMinutes(s, now);
  }

  const maxDailyMinutes = Math.round(industry.maxDailyHours * 60);
  for (const [day, total] of Object.entries(dayTotals)) {
    if (total > maxDailyMinutes) {
      flags.push({
        ruleId: 'FATIGUE_DAILY_MAX',
        severity: 'rest-required',
        messageKey: 'rules.fatigue.daily_max',
        params: { date: day, actual: Math.round(total / 60 * 10) / 10, threshold: industry.maxDailyHours },
        message: `Worked ${Math.round(total / 60 * 10) / 10} hours on ${day}, exceeding the ${industry.maxDailyHours}-hour daily maximum.`
      });
    }
  }

  // --- WEEKLY_MAX: rolling 7-day window ending at now ---
  const sevenDaysAgoMs = nowMs - 7 * 24 * 3600 * 1000;
  let weeklyMinutes = 0;
  for (const s of sessions) {
    const inMs = new Date(s.inTs).getTime();
    if (inMs >= sevenDaysAgoMs) {
      weeklyMinutes += sessionMinutes(s, now);
    }
  }
  const maxWeeklyMinutes = Math.round(industry.maxWeeklyHours * 60);
  if (weeklyMinutes > maxWeeklyMinutes) {
    flags.push({
      ruleId: 'FATIGUE_WEEKLY_MAX',
      severity: 'rest-required',
      messageKey: 'rules.fatigue.weekly_max',
      params: { actual: Math.round(weeklyMinutes / 60 * 10) / 10, threshold: industry.maxWeeklyHours },
      message: `Worked ${Math.round(weeklyMinutes / 60 * 10) / 10} hours in the rolling 7-day window, exceeding the ${industry.maxWeeklyHours}-hour weekly maximum.`
    });
  }

  // --- MIN_REST: gap between consecutive sessions ---
  const sorted = [...sessions].sort((a, b) => new Date(a.inTs).getTime() - new Date(b.inTs).getTime());
  const minRestMinutes = Math.round(industry.minRestHours * 60);

  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].outTs
      ? new Date(sorted[i - 1].outTs).getTime()
      : new Date(now).getTime();
    const currStart = new Date(sorted[i].inTs).getTime();
    const gapMinutes = Math.floor((currStart - prevEnd) / 60000);

    if (gapMinutes >= 0 && gapMinutes < minRestMinutes) {
      flags.push({
        ruleId: 'FATIGUE_MIN_REST',
        severity: 'watch',
        messageKey: 'rules.fatigue.min_rest',
        params: {
          gapHours: Math.round(gapMinutes / 60 * 10) / 10,
          threshold: industry.minRestHours
        },
        message: `Only ${Math.round(gapMinutes / 60 * 10) / 10} hours of rest between sessions, below the ${industry.minRestHours}-hour minimum.`
      });
    }
  }

  // --- CONSECUTIVE_NIGHTS: only when industry defines maxConsecutiveNights ---
  if (typeof industry.maxConsecutiveNights === 'number' && industry.maxConsecutiveNights > 0) {
    // Build sorted list of unique night-shift dates
    const nightDates = new Set();
    for (const s of sorted) {
      if (isNightSession(s, industry, tzOffsetMinutes)) {
        nightDates.add(dateKey(s.inTs, tzOffsetMinutes));
      }
    }

    if (nightDates.size > 0) {
      const nightDatesSorted = [...nightDates].sort();
      let consecutive = 1;
      let maxConsec = 1;

      for (let i = 1; i < nightDatesSorted.length; i++) {
        const prevMs = new Date(nightDatesSorted[i - 1]).getTime();
        const currMs = new Date(nightDatesSorted[i]).getTime();
        const diffDays = Math.round((currMs - prevMs) / (24 * 3600 * 1000));

        if (diffDays === 1) {
          consecutive += 1;
          if (consecutive > maxConsec) maxConsec = consecutive;
        } else {
          consecutive = 1;
        }
      }

      if (maxConsec > industry.maxConsecutiveNights) {
        flags.push({
          ruleId: 'FATIGUE_CONSECUTIVE_NIGHTS',
          severity: 'rest-required',
          messageKey: 'rules.fatigue.consecutive_nights',
          params: { actual: maxConsec, threshold: industry.maxConsecutiveNights },
          message: `${maxConsec} consecutive night shifts exceeds the ${industry.maxConsecutiveNights}-night limit.`
        });
      }
    }
  }

  // Determine overall level from worst flag severity
  let level = 'ok';
  for (const f of flags) {
    if (f.severity === 'rest-required') {
      level = 'rest-required';
      break;
    }
    if (f.severity === 'watch') {
      level = 'watch';
    }
  }

  return { level, flags };
}

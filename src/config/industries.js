/**
 * @file Industry Configuration Profiles for FairShift
 *
 * NOTE ON VALUES:
 * All numeric rule thresholds, shift durations, overtime multipliers, and heat safety
 * limits configured below are ILLUSTRATIVE defaults designed for cross-sector demonstration
 * and ethical workforce oversight. They do not constitute formal legal, regulatory, or medical advice.
 */

/**
 * Supported industry configuration profiles.
 * Features tailored constraints for active site operations (Construction)
 * versus round-the-clock clinical care and sanitation (Hospital).
 */
export const INDUSTRIES = {
  construction: {
    id: 'construction',
    label: 'Construction Site',
    currency: 'INR',
    // Daytime shifts tailored for active on-site physical labour
    shifts: [
      { id: 'const-morning', name: 'Morning Shift', start: '07:00', end: '15:30', isNight: false },
      { id: 'const-afternoon', name: 'Afternoon Shift', start: '15:30', end: '23:30', isNight: false }
    ],
    normalDailyHours: 8,
    overtimeMultiplier: 1.5,
    maxDailyHours: 10,
    maxWeeklyHours: 48,
    minRestHours: 12,
    maxConsecutiveNights: null, // Construction does not run overnight rotations in standard profile
    // Environmental heat stress thresholds based on wet-bulb globe temperature or heat index
    heat: {
      thresholds: [
        { minIndex: 32, level: 'caution', breakEveryMinutes: 45, stopWork: false },
        { minIndex: 38, level: 'extreme_caution', breakEveryMinutes: 30, stopWork: false },
        { minIndex: 44, level: 'danger', breakEveryMinutes: 15, stopWork: false },
        { minIndex: 50, level: 'hazardous', breakEveryMinutes: 0, stopWork: true }
      ]
    },
    reportCategories: [
      'structural_hazard',
      'ppe_violation',
      'equipment_defect',
      'heat_exhaustion',
      'unsafe_scaffolding',
      'wage_dispute'
    ],
    severityDeadlineHours: {
      critical: 2,
      high: 6,
      medium: 24,
      low: 72
    },
    lateSyncWarnHours: 24,
    reconcileToleranceMinutes: 15
  },
  hospital: {
    id: 'hospital',
    label: 'Hospital & Healthcare Support',
    currency: 'INR',
    // 24/7 rotational shifts including dedicated overnight nursing and sanitation coverage
    shifts: [
      { id: 'hosp-day', name: 'Day Shift', start: '07:00', end: '15:30', isNight: false },
      { id: 'hosp-evening', name: 'Evening Shift', start: '15:30', end: '23:30', isNight: false },
      { id: 'hosp-night', name: 'Night Shift', start: '23:00', end: '07:30', isNight: true }
    ],
    normalDailyHours: 8,
    overtimeMultiplier: 2.0, // Higher incentive multiplier for emergency and clinical strain
    maxDailyHours: 14,       // Allows extended emergency surgery or triage shifts
    maxWeeklyHours: 60,
    minRestHours: 11,
    maxConsecutiveNights: 3,  // Fatigue prevention: prevents cognitive decline from prolonged circadian disruption
    heat: null,              // Indoor climate-controlled environment
    reportCategories: [
      'biohazard_spill',
      'needlestick_injury',
      'staffing_shortage',
      'equipment_failure',
      'verbal_abuse',
      'missing_ppe'
    ],
    severityDeadlineHours: {
      critical: 1, // Rapid clinical containment required
      high: 4,
      medium: 12,
      low: 48
    },
    lateSyncWarnHours: 12,
    reconcileToleranceMinutes: 10
  }
};

/**
 * Retrieves an industry configuration by its identifier.
 *
 * @param {string} id - Industry identifier ('construction' | 'hospital').
 * @returns {typeof INDUSTRIES['construction']} The configuration object.
 * @throws {Error} If the industry identifier is unknown.
 */
export function getIndustry(id) {
  if (!id || typeof id !== 'string') {
    throw new Error(`Industry ID must be a non-empty string; received "${id}".`);
  }
  const industry = INDUSTRIES[id.toLowerCase()];
  if (!industry) {
    const validIds = Object.keys(INDUSTRIES).join(', ');
    throw new Error(`Unknown industry ID "${id}". Supported industries are: ${validIds}.`);
  }
  return industry;
}

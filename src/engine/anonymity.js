/**
 * @file Anonymous Feedback Aggregation Engine
 *
 * Enforces k-anonymity by suppressing aggregate results when the feedback group
 * falls below a minimum size threshold. Validates that entries carry no
 * identifying metadata before processing.
 */

/** Minimum group size to reveal aggregate results (k-anonymity threshold). */
export const MIN_GROUP_SIZE = 5;

/** Fields that must not appear on an anonymous feedback entry. */
const IDENTIFYING_FIELDS = ['workerId', 'userId', 'name', 'email', 'phone', 'ip', 'userAgent', 'deviceId'];

/**
 * Strips an ISO timestamp to date-only (YYYY-MM-DD) for safe aggregation.
 *
 * @param {string} iso - ISO 8601 timestamp string.
 * @returns {string} Date-only string "YYYY-MM-DD".
 */
export function toDateOnly(iso) {
  if (!iso || typeof iso !== 'string') {
    throw new Error('toDateOnly requires a non-empty ISO string.');
  }
  return iso.slice(0, 10);
}

/**
 * Validates that a feedback entry contains no personally identifying information.
 * Throws if any identifying field is present or if the timestamp includes a time component.
 *
 * @param {object} entry - Anonymous feedback entry to validate.
 * @throws {Error} If entry contains identifying fields or a time-granular timestamp.
 */
export function assertAnonymous(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('assertAnonymous requires a non-null object.');
  }

  for (const field of IDENTIFYING_FIELDS) {
    if (field in entry && entry[field] !== undefined && entry[field] !== null) {
      throw new Error(`Anonymous entry must not contain identifying field "${field}".`);
    }
  }

  // Reject timestamps with time components (anything beyond YYYY-MM-DD)
  if (entry.timestamp && typeof entry.timestamp === 'string') {
    // A date-only string is exactly 10 chars: YYYY-MM-DD
    const trimmed = entry.timestamp.trim();
    if (trimmed.length > 10) {
      throw new Error('Anonymous entry timestamp must be date-only (YYYY-MM-DD), not a full datetime.');
    }
  }
}

/**
 * Aggregates anonymous feedback entries with k-anonymity suppression.
 * Below the threshold, only the count is returned with visibility suppressed.
 * At or above the threshold, average rating and theme frequency are disclosed.
 *
 * @param {Array<{ rating?: number, tags?: string[] }>} entries - Validated anonymous entries.
 * @param {number} [minGroup=MIN_GROUP_SIZE] - Minimum group size for visibility.
 * @returns {{
 *   visible: boolean,
 *   count: number,
 *   averageRating?: number,
 *   themes?: Array<{ label: string, count: number }>
 * }}
 */
export function aggregateFeedback(entries = [], minGroup = MIN_GROUP_SIZE) {
  if (!Array.isArray(entries)) {
    throw new Error('aggregateFeedback requires an array of entries.');
  }

  const count = entries.length;

  if (count < minGroup) {
    return { visible: false, count };
  }

  // Compute average rating from entries that have a numeric rating
  const rated = entries.filter((e) => typeof e.rating === 'number' && !Number.isNaN(e.rating));
  const averageRating = rated.length > 0
    ? Math.round((rated.reduce((sum, e) => sum + e.rating, 0) / rated.length) * 10) / 10
    : 0;

  // Tally theme frequencies from tags arrays
  const themeCounts = {};
  for (const entry of entries) {
    if (Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        const label = String(tag).trim().toLowerCase();
        if (label) {
          themeCounts[label] = (themeCounts[label] || 0) + 1;
        }
      }
    }
  }

  const themes = Object.entries(themeCounts)
    .map(([label, cnt]) => ({ label, count: cnt }))
    .sort((a, b) => b.count - a.count);

  return { visible: true, count, averageRating, themes };
}

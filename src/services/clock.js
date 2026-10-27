/**
 * @file Clock Abstraction
 *
 * Provides a real system clock and a deterministic fake clock for testing
 * and demo seed data generation. Engine functions receive time explicitly;
 * the clock is only used at the service/route boundary.
 */

/** Real system clock. */
export const systemClock = {
  /** @returns {string} Current time as ISO string. */
  now() {
    return new Date().toISOString();
  }
};

/**
 * Creates a fake clock pinned to a starting time, useful for deterministic
 * seed data and tests.
 *
 * @param {string} startIso - ISO 8601 start timestamp.
 * @returns {{ now: () => string, advance: (ms: number) => void, set: (iso: string) => void }}
 */
export function createFakeClock(startIso) {
  let currentMs = new Date(startIso).getTime();

  return {
    now() {
      return new Date(currentMs).toISOString();
    },
    /** Advance the clock by the given number of milliseconds. */
    advance(ms) {
      currentMs += ms;
    },
    /** Set the clock to an absolute ISO timestamp. */
    set(iso) {
      currentMs = new Date(iso).getTime();
    }
  };
}

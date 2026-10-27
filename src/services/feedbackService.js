/**
 * @file Anonymous Feedback Service
 *
 * Enforces strict worker privacy: limits submissions to one per worker per month
 * via an unlinkable HMAC marker in submissionMarkers, strips all identifying metadata,
 * validates anonymity with engine/anonymity, and enforces k-anonymity (MIN_GROUP_SIZE)
 * on aggregate analytics.
 */

import crypto from 'node:crypto';
import { MIN_GROUP_SIZE, assertAnonymous, aggregateFeedback } from '../engine/anonymity.js';
import { AppError } from '../middleware/errors.js';

const VALID_TARGET_TYPES = ['manager', 'policy', 'conditions'];

/**
 * Creates feedback service.
 *
 * @param {object} dependencies
 * @param {object} dependencies.config - Application config containing FEEDBACK_SECRET.
 * @param {object} dependencies.repo - Memory repository.
 * @param {object} dependencies.clock - Clock abstraction.
 * @returns {object}
 */
export function createFeedbackService({ config, repo, clock }) {
  /**
   * Submits anonymous feedback for a worker's assigned site.
   * Enforces 1 submission per month via an unlinkable cryptographic marker.
   *
   * @param {object} worker - Authenticated worker.
   * @param {object} params
   * @param {'manager'|'policy'|'conditions'} params.targetType - Feedback target category.
   * @param {number} params.rating - 1 to 5 integer rating.
   * @param {string[]} [params.tags=[]] - Categorical tags.
   * @param {string} [params.comment=''] - Freeform feedback text.
   * @returns {{ success: boolean, id: string }}
   */
  function submitFeedback(worker, { targetType, rating, tags = [], comment = '' }) {
    if (!VALID_TARGET_TYPES.includes(targetType)) {
      throw new AppError(
        400,
        'INVALID_TARGET_TYPE',
        'errors.feedback.invalid_target_type',
        `targetType must be one of: ${VALID_TARGET_TYPES.join(', ')}.`
      );
    }
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      throw new AppError(
        400,
        'INVALID_RATING',
        'errors.feedback.invalid_rating',
        'rating must be an integer between 1 and 5.'
      );
    }

    // 1. Enforce 1 submission per worker per month via an unlinkable HMAC marker
    const monthKey = clock.now().slice(0, 7); // YYYY-MM
    const marker = crypto
      .createHmac('sha256', config.FEEDBACK_SECRET)
      .update(`${worker.id}:${monthKey}`)
      .digest('hex');

    if (repo.hasMarker(marker)) {
      throw new AppError(
        429,
        'MONTHLY_FEEDBACK_LIMIT',
        'errors.feedback.monthly_limit',
        'You have already submitted anonymous feedback for this month. Thank you for your voice!'
      );
    }

    // Record the rate-limiting marker (cannot be reverse-linked to the feedback document)
    repo.addMarker(marker);

    // 2. Build strictly anonymized entry with date-only granularity (no timestamp with time)
    const id = `fb_${crypto.randomUUID()}`;
    const dateOnly = clock.now().slice(0, 10); // YYYY-MM-DD

    const cleanTags = Array.isArray(tags)
      ? tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
      : [];

    const entry = {
      id,
      siteId: worker.siteId,
      targetType,
      rating: numericRating,
      tags: cleanTags,
      comment: typeof comment === 'string' ? comment.trim() : '',
      date: dateOnly
    };

    // 3. Cryptographic anonymity assertion: throws if any PII or time component exists
    assertAnonymous(entry);

    repo.putFeedback(entry);

    return {
      success: true,
      id
    };
  }

  /**
   * Retrieves aggregate sentiment analytics for a site, enforcing k-anonymity.
   *
   * @param {string} siteId - Site ID.
   * @returns {object} Aggregate output conforming to engine/anonymity.
   */
  function getAggregate(siteId) {
    const entries = repo.getFeedbackBySite(siteId);
    return aggregateFeedback(entries, MIN_GROUP_SIZE);
  }

  return {
    submitFeedback,
    getAggregate
  };
}

/**
 * @file Shift Record Service
 *
 * Handles single check-in/out creation and offline batch synchronization.
 * Enforces client timestamp validity (+5 min future limit, 7 day age limit),
 * verifies rotating site codes, deduplicates by clientId, anchors each record
 * to the worker's append-only hash chain, and issues signed digital receipts.
 */

import { GENESIS_HASH, createRecord as createChainRecord, signReceipt } from '../engine/chain.js';
import { verifySiteCode } from '../engine/siteCode.js';
import { AppError } from '../middleware/errors.js';

const FUTURE_DRIFT_TOLERANCE_MS = 5 * 60 * 1000;       // 5 minutes
const MAX_RECORD_AGE_MS = 7 * 24 * 60 * 60 * 1000;     // 7 days
const MAX_BATCH_SIZE = 50;

/**
 * Creates a record service instance.
 *
 * @param {object} dependencies
 * @param {object} dependencies.config - Application config.
 * @param {object} dependencies.repo - Memory repository.
 * @param {object} dependencies.clock - Clock abstraction.
 * @returns {object} Record service methods.
 */
export function createRecordService({ config, repo, clock }) {
  /**
   * Appends a single verified check-in or check-out to a worker's personal hash chain.
   *
   * @param {object} params
   * @param {object} params.worker - Authenticated worker object.
   * @param {'in' | 'out'} params.type - Punch action type.
   * @param {string} params.clientTs - Claimed client ISO timestamp.
   * @param {string} params.clientId - Client-generated UUID for idempotency.
   * @param {string} params.siteCode - 6-digit rotating site code.
   * @returns {Promise<{ record: object, duplicate: boolean }>}
   */
  async function createRecord({ worker, type, clientTs, clientId, siteCode }) {
    if (!worker || !worker.id) {
      throw new AppError(401, 'UNAUTHORIZED', 'errors.auth.unauthorized', 'Worker identity required.');
    }
    if (!['in', 'out'].includes(type)) {
      throw new AppError(400, 'INVALID_TYPE', 'errors.records.invalid_type', 'Type must be "in" or "out".');
    }
    if (!clientTs || !clientId || !siteCode) {
      throw new AppError(400, 'MISSING_FIELDS', 'errors.validation.missing_fields', 'clientTs, clientId, and siteCode are required.');
    }

    const clientMs = new Date(clientTs).getTime();
    if (Number.isNaN(clientMs)) {
      throw new AppError(400, 'INVALID_TIMESTAMP', 'errors.records.invalid_timestamp', 'clientTs must be a valid ISO timestamp.');
    }

    const nowMs = new Date(clock.now()).getTime();

    // 1. Time boundary enforcement: not >5 min in future
    if (clientMs > nowMs + FUTURE_DRIFT_TOLERANCE_MS) {
      throw new AppError(
        400,
        'FUTURE_TIMESTAMP',
        'errors.records.future_timestamp',
        'Check-in timestamp cannot be more than 5 minutes in the future.'
      );
    }

    // 2. Maximum offline age enforcement: not >7 days old
    if (clientMs < nowMs - MAX_RECORD_AGE_MS) {
      throw new AppError(
        400,
        'EXPIRED_TIMESTAMP',
        'errors.records.expired_timestamp',
        'Check-in timestamp exceeds the maximum 7-day synchronization window.'
      );
    }

    // 3. Verify rotating site verification code
    const isCodeValid = verifySiteCode(
      String(siteCode),
      config.SITE_SECRET,
      worker.siteId,
      clientMs,
      300000,
      1
    );

    if (!isCodeValid) {
      throw new AppError(
        400,
        'INVALID_SITE_CODE',
        'errors.records.invalid_site_code',
        'The provided 6-digit site code is invalid or has expired for this site location.'
      );
    }

    // 4. Idempotency check: deduplicate on (workerId, clientId)
    const existingRecords = repo.getRecords(worker.id);
    const existing = existingRecords.find(
      (r) => r.payload && r.payload.clientId === clientId
    );

    if (existing) {
      return { record: existing, duplicate: true };
    }

    // 5. Build append-only cryptographic chain record
    const head = repo.getChainHead(worker.id);
    const prevHash = head ? head.hash : GENESIS_HASH;

    const payload = {
      type,
      clientTs,
      clientId,
      siteId: worker.siteId,
      workerId: worker.id
    };

    const chainRecord = createChainRecord({ prevHash, payload });

    // 6. Sign receipt with server RECEIPT_SECRET
    const signature = signReceipt(chainRecord, config.RECEIPT_SECRET);

    // 7. Persist record with server receive timestamp
    const fullRecord = {
      ...chainRecord,
      serverTs: clock.now(),
      signature
    };

    repo.appendRecord(worker.id, fullRecord);

    return { record: fullRecord, duplicate: false };
  }

  /**
   * Synchronizes an offline batch of records in chronological order.
   * Handles per-item errors gracefully without failing the entire batch.
   *
   * @param {object} worker - Authenticated worker.
   * @param {Array<object>} items - Array of up to 50 punch records.
   * @returns {Promise<{ processed: number, results: Array<object> }>}
   */
  async function syncBatch(worker, items = []) {
    if (!Array.isArray(items)) {
      throw new AppError(400, 'INVALID_BATCH', 'errors.records.invalid_batch', 'Items must be an array.');
    }
    if (items.length > MAX_BATCH_SIZE) {
      throw new AppError(
        400,
        'BATCH_TOO_LARGE',
        'errors.records.batch_too_large',
        `Batch size of ${items.length} exceeds the maximum limit of ${MAX_BATCH_SIZE} records.`
      );
    }

    // Stable sort items chronologically by claimed clientTs
    const sortedItems = [...items].sort((a, b) => {
      const tA = new Date(a.clientTs).getTime();
      const tB = new Date(b.clientTs).getTime();
      return (Number.isNaN(tA) ? 0 : tA) - (Number.isNaN(tB) ? 0 : tB);
    });

    const results = [];

    for (const item of sortedItems) {
      try {
        const { record, duplicate } = await createRecord({
          worker,
          type: item.type,
          clientTs: item.clientTs,
          clientId: item.clientId,
          siteCode: item.siteCode
        });

        results.push({
          clientId: item.clientId,
          status: duplicate ? 'duplicate' : 'accepted',
          record
        });
      } catch (err) {
        results.push({
          clientId: item.clientId,
          status: 'rejected',
          reason: err instanceof AppError ? err.message : 'Validation failed'
        });
      }
    }

    return {
      processed: items.length,
      results
    };
  }

  return {
    createRecord,
    syncBatch
  };
}

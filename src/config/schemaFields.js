/**
 * @file Data Storage Schemas & Privacy Guarantees
 *
 * Single source of truth defining exactly which fields are persisted across collections
 * and explicitly enumerating forbidden identifying attributes. Used by services to filter
 * data and surfaced publicly via /api/public/what-we-store.
 */

/** Schema definition for shift punch records. */
export const RECORD_SCHEMA = Object.freeze({
  collection: 'records',
  description: 'Cryptographically chained shift punch events',
  stored: [
    'hash',
    'prevHash',
    'payload.type',
    'payload.clientTs',
    'payload.clientId',
    'payload.siteId',
    'payload.workerId',
    'serverTs',
    'signature'
  ],
  neverStored: [
    'preciseGpsCoordinates',
    'biometrics',
    'faceScans',
    'ipAddress',
    'userAgent',
    'deviceId',
    'macAddress'
  ]
});

/** Schema definition for safety hazard reports. */
export const REPORT_SCHEMA = Object.freeze({
  collection: 'reports',
  description: 'Workplace hazard reports with anonymous tracking codes',
  stored: [
    'id',
    'trackingCode',
    'siteId',
    'category',
    'severity',
    'text',
    'status',
    'history',
    'createdAt'
  ],
  neverStored: [
    'workerId',
    'userId',
    'name',
    'email',
    'phone',
    'ipAddress',
    'userAgent',
    'deviceId',
    'deviceFingerprint'
  ]
});

/** Schema definition for anonymous workplace feedback. */
export const FEEDBACK_SCHEMA = Object.freeze({
  collection: 'feedback',
  description: 'k-anonymous pulse feedback protected by irreversible rate markers',
  stored: [
    'id',
    'siteId',
    'targetType',
    'rating',
    'tags',
    'comment',
    'date'
  ],
  neverStored: [
    'workerId',
    'userId',
    'name',
    'email',
    'phone',
    'ip',
    'userAgent',
    'deviceId',
    'timeOfDay',
    'timestamp'
  ]
});

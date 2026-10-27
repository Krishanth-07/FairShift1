/**
 * @file Transparency & Data Retention Page Logic
 *
 * Fetches the immutable schema definition from /api/public/what-we-store
 * and renders verified field lists without innerHTML.
 */

import { initI18n, setLanguage, getLanguage, translateDOM } from '../shared/i18n.js';
import { apiRequest } from '../shared/api.js';

/**
 * Human-readable explanations for schema fields.
 */
const FIELD_DESCRIPTIONS = {
  // Stored fields
  'hash': 'Cryptographic SHA-256 fingerprint of the current record',
  'prevHash': 'Pointer to preceding shift record guaranteeing hash chain continuity',
  'payload.type': 'Shift event type (check-in or check-out)',
  'payload.clientTs': 'Worker punch timestamp recorded at time of action',
  'payload.clientId': 'Client-generated random UUID preventing duplicate submissions',
  'payload.siteId': 'Facility or construction site identifier',
  'payload.workerId': 'Opaque worker pseudonym for hour pairing and payslip calculation',
  'serverTs': 'Official server timestamp applied upon cryptographic verification',
  'signature': 'HMAC digital receipt signature proving work validity',
  'id': 'Pseudonymous internal database record identifier',
  'trackingCode': 'Unambiguous anonymous tracking code (FS-XXXX-XXXX) held only by worker',
  'category': 'Operational safety classification (e.g., structural, equipment, biohazard)',
  'severity': 'Safety priority tier (critical, high, medium, low)',
  'text': 'Worker description of hazard or unsafe workplace condition',
  'status': 'Workflow resolution state (open, acknowledged, in_progress, resolved)',
  'history': 'Timestamped status transition audit log with zero personal attribution',
  'createdAt': 'Submission timestamp of report',
  'targetType': 'Feedback category (conditions, manager, policy)',
  'rating': '1 to 5 star rating',
  'tags': 'Helpful operational tags selected by frontline worker',
  'comment': 'Optional anonymous worker voice comments',
  'date': 'Calendar date of feedback (coarse day resolution only, time-of-day stripped)',

  // Never stored fields
  'preciseGpsCoordinates': 'No real-time, historical, or background GPS tracking',
  'biometrics': 'No facial recognition, iris scans, or fingerprint biometric data',
  'faceScans': 'Zero facial imagery or biometric verification algorithms',
  'ipAddress': 'Zero logging of IP addresses or network locations',
  'userAgent': 'Zero browser/phone model tracking in records or feedback',
  'deviceId': 'Zero hardware serial numbers, IMEI, or device hardware IDs',
  'macAddress': 'Zero network adapter hardware identification',
  'workerId': 'Strictly excluded from safety reports and feedback to ensure total anonymity',
  'userId': 'Strictly excluded from safety reports and feedback to ensure total anonymity',
  'name': 'Zero personal names linked to hazard reports or pulse feedback',
  'email': 'Zero email contact details attached to feedback or hazard reports',
  'phone': 'Zero mobile phone numbers attached to feedback or hazard reports',
  'ip': 'Zero IP tracking on anonymous pulse feedback',
  'deviceFingerprint': 'Zero browser canvas/audio hardware fingerprinting',
  'timeOfDay': 'Feedback timestamps are truncated to date only to prevent timing correlation',
  'timestamp': 'Full timestamp removed from pulse feedback to enforce k-anonymity'
};

/**
 * Friendly collection labels.
 */
const COLLECTION_LABELS = {
  records: 'Shift Punch Records',
  reports: 'Safety Hazard Reports',
  feedback: 'Pulse Voice Feedback'
};

/**
 * Initializes trust page.
 */
async function init() {
  await initI18n();
  translateDOM();

  // Setup language switcher
  const currentLang = getLanguage();
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
    btn.addEventListener('click', async () => {
      await setLanguage(btn.dataset.lang);
      document.querySelectorAll('.lang-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      translateDOM();
    });
  });

  try {
    const data = await apiRequest('/api/public/what-we-store');
    renderSchemas(data.schemas);
  } catch (err) {
    const storedWrapper = document.getElementById('stored-lists-wrapper');
    const neverStoredWrapper = document.getElementById('never-stored-lists-wrapper');
    if (storedWrapper) storedWrapper.textContent = 'Failed to load policy schemas.';
    if (neverStoredWrapper) neverStoredWrapper.textContent = 'Failed to load policy schemas.';
  }
}

/**
 * Renders schema definitions into the two columns.
 * @param {object} schemas
 */
function renderSchemas(schemas) {
  const storedWrapper = document.getElementById('stored-lists-wrapper');
  const neverStoredWrapper = document.getElementById('never-stored-lists-wrapper');
  if (!storedWrapper || !neverStoredWrapper) return;

  storedWrapper.replaceChildren();
  neverStoredWrapper.replaceChildren();

  for (const [key, schema] of Object.entries(schemas)) {
    const groupName = COLLECTION_LABELS[key] || schema.collection || key;

    // Render Stored items
    const storedGroup = document.createElement('div');
    storedGroup.className = 'collection-group';

    const storedTitle = document.createElement('h4');
    storedTitle.className = 'collection-title';
    storedTitle.textContent = `${groupName} (${schema.stored.length})`;
    storedGroup.appendChild(storedTitle);

    const storedUl = document.createElement('ul');
    storedUl.className = 'plain-list stored-list';

    for (const field of schema.stored) {
      const li = document.createElement('li');
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '✔';

      const contentSpan = document.createElement('span');
      const desc = FIELD_DESCRIPTIONS[field] || 'Persisted operational field';
      contentSpan.textContent = `${field} — ${desc}`;

      li.appendChild(icon);
      li.appendChild(contentSpan);
      storedUl.appendChild(li);
    }

    storedGroup.appendChild(storedUl);
    storedWrapper.appendChild(storedGroup);

    // Render Never Stored items
    const neverGroup = document.createElement('div');
    neverGroup.className = 'collection-group';

    const neverTitle = document.createElement('h4');
    neverTitle.className = 'collection-title';
    neverTitle.textContent = `${groupName} — Zero Collection (${schema.neverStored.length})`;
    neverGroup.appendChild(neverTitle);

    const neverUl = document.createElement('ul');
    neverUl.className = 'plain-list never-stored-list';

    for (const field of schema.neverStored) {
      const li = document.createElement('li');
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '✖';

      const contentSpan = document.createElement('span');
      const desc = FIELD_DESCRIPTIONS[field] || 'Strictly forbidden identifying attribute';
      contentSpan.textContent = `${field} — ${desc}`;

      li.appendChild(icon);
      li.appendChild(contentSpan);
      neverUl.appendChild(li);
    }

    neverGroup.appendChild(neverUl);
    neverStoredWrapper.appendChild(neverGroup);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * @file Public Transparency Routes
 *
 * Publicly exposes data storage policies and field-level privacy contracts.
 * Directly sourced from shared schema constants to eliminate documentation drift.
 */

import { Router } from 'express';
import { RECORD_SCHEMA, REPORT_SCHEMA, FEEDBACK_SCHEMA } from '../config/schemaFields.js';

/**
 * Creates public transparency router.
 *
 * @param {object} dependencies
 * @param {object} dependencies.clock - Clock abstraction.
 * @returns {Router}
 */
export function createPublicRoutes({ clock }) {
  const router = Router();

  // GET /api/public/what-we-store
  router.get('/api/public/what-we-store', (req, res) => {
    res.json({
      title: 'FairShift Transparent Data Retention & Privacy Specification',
      sdgAlignment: 'UN SDG 8 (Decent Work and Economic Growth)',
      policy: 'Frontline Worker First: Zero biometric, continuous GPS, or device tracking',
      timestamp: clock.now(),
      schemas: {
        records: RECORD_SCHEMA,
        reports: REPORT_SCHEMA,
        feedback: FEEDBACK_SCHEMA
      }
    });
  });

  return router;
}

/**
 * @file Worker Advocate Advisory Engine
 *
 * Synthesizes outputs from fatigue, reconciliation, anomaly, and escalation engines
 * into a single prioritized advisory for frontline workers. Priority order:
 * rest-required > underpaid mismatch > escalated hazard > informational.
 */

/**
 * Generates a prioritized advisory for a worker based on current engine outputs.
 *
 * @param {object} params
 * @param {object} params.industry - Industry configuration.
 * @param {{ level: string, flags: Array<object> }} params.fatigue - Fatigue evaluation result.
 * @param {{ status: string, reasons: Array<object> }|null} params.reconciliation - Reconciliation result or null.
 * @param {Array<object>} [params.anomalies=[]] - Active anomaly flags.
 * @param {Array<{ escalated: boolean }>} [params.escalatedReports=[]] - Escalation evaluations.
 * @returns {{
 *   primary: { id: string, severity: string, icon: string, headlineKey: string },
 *   reasons: Array<object>
 * }}
 */
export function advise({ industry, fatigue, reconciliation, anomalies = [], escalatedReports = [] }) {
  if (!industry) throw new Error('advise requires an industry configuration.');

  // 1. Highest priority: fatigue rest-required
  if (fatigue && fatigue.level === 'rest-required') {
    return {
      primary: {
        id: 'rest_required',
        severity: 'critical',
        icon: '🛑',
        headlineKey: 'advocate.headline.rest_required'
      },
      reasons: fatigue.flags || []
    };
  }

  // 2. Underpaid pay mismatch
  if (reconciliation && reconciliation.status === 'underpaid') {
    return {
      primary: {
        id: 'underpaid',
        severity: 'high',
        icon: '💰',
        headlineKey: 'advocate.headline.underpaid'
      },
      reasons: reconciliation.reasons || []
    };
  }

  // 3. Escalated hazard reports
  const escalatedCount = escalatedReports.filter((r) => r.escalated).length;
  if (escalatedCount > 0) {
    return {
      primary: {
        id: 'escalated_hazard',
        severity: 'high',
        icon: '⚠️',
        headlineKey: 'advocate.headline.escalated_hazard'
      },
      reasons: [{
        ruleId: 'ADVOCATE_ESCALATED_REPORTS',
        messageKey: 'advocate.reason.escalated_reports',
        params: { count: escalatedCount },
        message: `${escalatedCount} hazard report(s) have exceeded their response deadline.`
      }]
    };
  }

  // 4. Fatigue watch level
  if (fatigue && fatigue.level === 'watch') {
    return {
      primary: {
        id: 'fatigue_watch',
        severity: 'medium',
        icon: '👁️',
        headlineKey: 'advocate.headline.fatigue_watch'
      },
      reasons: fatigue.flags || []
    };
  }

  // 5. Informational anomalies
  if (anomalies.length > 0) {
    return {
      primary: {
        id: 'anomalies_info',
        severity: 'info',
        icon: 'ℹ️',
        headlineKey: 'advocate.headline.anomalies'
      },
      reasons: anomalies
    };
  }

  // 6. All clear
  return {
    primary: {
      id: 'all_clear',
      severity: 'info',
      icon: '✅',
      headlineKey: 'advocate.headline.all_clear'
    },
    reasons: []
  };
}

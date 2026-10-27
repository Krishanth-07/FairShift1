/**
 * @file FairShift Employer & Site Admin Dashboard Logic
 *
 * Implements frontline workforce overview, live rotating site code broadcasting,
 * fatigue and operational anomaly review, hazard escalation workflow,
 * k-anonymous feedback inspection, retention risk metrics, and auditable payroll editing.
 * Strictly avoids innerHTML; uses pure DOM construction APIs.
 */

import { apiRequest } from '../shared/api.js';
import { initI18n, setLanguage, getLanguage, t, translateDOM } from '../shared/i18n.js';

let currentUser = null;
let currentSiteOverview = null;
let siteCodeTimer = null;

/**
 * Initializes Admin application on page load.
 */
async function init() {
  await initI18n();
  translateDOM();
  setupLanguageSwitcher();
  setupEventListeners();

  try {
    const me = await apiRequest('/api/auth/me');
    if (me && me.user && me.user.role === 'admin') {
      currentUser = me.user;
      showDashboardView();
      await loadDashboardData();
    } else {
      showLoginView();
    }
  } catch {
    showLoginView();
  }
}

/**
 * Configures top language selector controls.
 */
function setupLanguageSwitcher() {
  const currentLang = getLanguage();
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
    btn.addEventListener('click', async () => {
      await setLanguage(btn.dataset.lang);
      document.querySelectorAll('.lang-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      translateDOM();
      if (currentSiteOverview) {
        renderDashboard(currentSiteOverview);
      }
    });
  });
}

/**
 * Sets up form handlers and actions.
 */
function setupEventListeners() {
  // Login form
  const loginForm = document.getElementById('admin-login-form');
  loginForm.addEventListener('submit', handleLogin);

  // Logout button
  const logoutBtn = document.getElementById('btn-admin-logout');
  logoutBtn.addEventListener('click', handleLogout);

  // Payroll editor form
  const payrollForm = document.getElementById('payroll-editor-form');
  payrollForm.addEventListener('submit', handleSavePayroll);

  // Day confirmation & dispute buttons
  const confirmBtn = document.getElementById('btn-admin-confirm-day');
  confirmBtn.addEventListener('click', handleConfirmDay);

  const disputeBtn = document.getElementById('btn-admin-dispute-day');
  disputeBtn.addEventListener('click', handleDisputeDay);
}

/**
 * Displays login view and loads demo admins if in DEMO_MODE.
 */
async function showLoginView() {
  document.getElementById('view-admin-login').hidden = false;
  document.getElementById('view-admin-dashboard').hidden = true;
  document.getElementById('btn-admin-logout').hidden = true;
  document.getElementById('site-header-badge').hidden = true;

  // Check demo admins
  try {
    const demoUsers = await apiRequest('/api/auth/demo-users');
    const demoAdmins = demoUsers.filter((u) => u.role === 'admin');

    if (demoAdmins.length > 0) {
      const container = document.getElementById('demo-admins-container');
      const list = document.getElementById('demo-admins-list');
      list.replaceChildren();

      for (const admin of demoAdmins) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'demo-admin-card';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'demo-admin-name';
        nameSpan.textContent = admin.name;

        const siteSpan = document.createElement('span');
        siteSpan.className = 'demo-admin-site';
        siteSpan.textContent = `${admin.siteLabel} (${admin.id})`;

        btn.appendChild(nameSpan);
        btn.appendChild(siteSpan);

        btn.addEventListener('click', async () => {
          try {
            const res = await apiRequest('/api/auth/demo-login', {
              method: 'POST',
              body: { userId: admin.id }
            });
            currentUser = res.user;
            showDashboardView();
            await loadDashboardData();
          } catch (err) {
            showError('admin-login-error', err.message);
          }
        });

        list.appendChild(btn);
      }
      container.hidden = false;
    }
  } catch {
    // Demo mode not active
  }
}

/**
 * Handles regular PIN login.
 * @param {Event} e
 */
async function handleLogin(e) {
  e.preventDefault();
  const userId = document.getElementById('input-admin-id').value.trim();
  const pin = document.getElementById('input-admin-pin').value.trim();
  const errorEl = document.getElementById('admin-login-error');
  errorEl.hidden = true;

  if (!userId || !pin) {
    showError('admin-login-error', 'Please enter both User ID and PIN.');
    return;
  }

  try {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { userId, pin }
    });

    if (res.user.role !== 'admin') {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      showError('admin-login-error', 'Access restricted: Administrator credentials required.');
      return;
    }

    currentUser = res.user;
    showDashboardView();
    await loadDashboardData();
  } catch (err) {
    showError('admin-login-error', err.message || 'Invalid credentials.');
  }
}

/**
 * Handles admin logout.
 */
async function handleLogout() {
  if (siteCodeTimer) {
    clearInterval(siteCodeTimer);
    siteCodeTimer = null;
  }
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore error
  }
  currentUser = null;
  currentSiteOverview = null;
  showLoginView();
}

/**
 * Switches views to authenticated dashboard.
 */
function showDashboardView() {
  document.getElementById('view-admin-login').hidden = true;
  document.getElementById('view-admin-dashboard').hidden = false;
  document.getElementById('btn-admin-logout').hidden = false;
  document.getElementById('site-header-badge').hidden = false;
}

/**
 * Loads overview and rotating site code.
 */
async function loadDashboardData() {
  try {
    const [overview, siteCodeData] = await Promise.all([
      apiRequest('/api/admin/overview'),
      apiRequest('/api/admin/site-code')
    ]);

    currentSiteOverview = overview;
    renderDashboard(overview);
    startSiteCodeCountdown(siteCodeData);
  } catch (err) {
    console.error('Failed to load admin overview:', err);
  }
}

/**
 * Starts site code countdown and refresh loop.
 * @param {object} codeData
 */
function startSiteCodeCountdown(codeData) {
  if (siteCodeTimer) {
    clearInterval(siteCodeTimer);
  }

  const codeEl = document.getElementById('display-site-code');
  const countEl = document.getElementById('countdown-text');
  codeEl.textContent = codeData.code || '------';

  function update() {
    const nowMs = Date.now();
    const expiresMs = new Date(codeData.expiresAt).getTime();
    const remainingSec = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));

    countEl.textContent = `${remainingSec}s remaining`;

    if (remainingSec <= 0) {
      clearInterval(siteCodeTimer);
      apiRequest('/api/admin/site-code').then((fresh) => {
        startSiteCodeCountdown(fresh);
      }).catch(console.error);
    }
  }

  update();
  siteCodeTimer = setInterval(update, 1000);
}

/**
 * Renders all dashboard sections from overview data.
 * @param {object} data
 */
function renderDashboard(data) {
  // 1. Header site badges
  document.getElementById('site-name-text').textContent = data.site.name;
  document.getElementById('site-industry-badge').textContent = data.site.industryId;

  // 2. Overview metrics
  document.getElementById('metric-attendance').textContent =
    `${data.attendance.activeOpenSessions} / ${data.attendance.totalWorkers}`;

  document.getElementById('metric-fatigue').textContent = String(data.fatigueAlerts.length);

  const escalatedCount = data.reports.filter((r) => r.escalation && r.escalation.escalated).length;
  document.getElementById('metric-escalated').textContent = String(escalatedCount);

  // 3. Chain Integrity
  const integrityBadge = document.getElementById('integrity-status-badge');
  const integrityDetails = document.getElementById('integrity-details');
  if (data.chainIntegrity && data.chainIntegrity.allValid) {
    integrityBadge.className = 'integrity-badge integrity-verified';
    integrityBadge.textContent = '✔ Verified';
    integrityDetails.textContent = t('admin.integrity_verified');
  } else {
    integrityBadge.className = 'integrity-badge integrity-problem';
    const brokenIndex = (data.chainIntegrity && data.chainIntegrity.brokenChains && data.chainIntegrity.brokenChains[0])
      ? data.chainIntegrity.brokenChains[0].brokenAtIndex
      : 'N/A';
    integrityBadge.textContent = '✖ Issue Detected';
    integrityDetails.textContent = t('admin.integrity_problem', { index: brokenIndex });
  }

  // 4. Render Anomalies & Fatigue Table
  renderAnomaliesTable(data.fatigueAlerts, data.anomalies);

  // 5. Render Reports Table
  renderReportsTable(data.reports);

  // 6. Render Feedback Aggregate
  renderFeedbackPanel(data.feedbackAggregate);

  // 7. Render Retention Risk
  renderRetentionRisks(data.retentionRisks);

  // 8. Populate Worker Select for Payroll Editor
  populateWorkerSelect(data.retentionRisks);
}

/**
 * Renders fatigue alerts and operational anomalies.
 * @param {Array} fatigueAlerts
 * @param {Array} anomalies
 */
function renderAnomaliesTable(fatigueAlerts, anomalies) {
  const tbody = document.getElementById('table-anomalies-body');
  tbody.replaceChildren();

  const allItems = [];

  for (const fa of fatigueAlerts) {
    for (const flag of fa.flags) {
      allItems.push({
        worker: fa.workerName,
        category: 'Fatigue Advisory',
        ruleId: flag.ruleId,
        messageKey: flag.messageKey,
        params: flag.params,
        message: flag.message,
        isFatigue: true
      });
    }
  }

  for (const an of anomalies) {
    allItems.push({
      worker: an.recordIds ? `Records (${an.recordIds.length})` : 'Operational Review',
      category: 'For Review',
      ruleId: an.ruleId,
      messageKey: an.messageKey,
      params: an.params,
      message: an.message,
      isFatigue: false
    });
  }

  if (allItems.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'text-muted';
    td.textContent = t('admin.no_alerts');
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const item of allItems) {
    const tr = document.createElement('tr');

    const workerTh = document.createElement('th');
    workerTh.scope = 'row';
    workerTh.className = 'worker-cell';
    workerTh.textContent = item.worker;

    const catTd = document.createElement('td');
    const catBadge = document.createElement('span');
    catBadge.className = item.isFatigue ? 'chip chip-high' : 'review-badge';
    catBadge.textContent = item.category;
    catTd.appendChild(catBadge);

    const ruleTd = document.createElement('td');
    ruleTd.textContent = item.ruleId;

    const msgTd = document.createElement('td');
    msgTd.textContent = t(item.messageKey, item.params) || item.message;

    tr.appendChild(workerTh);
    tr.appendChild(catTd);
    tr.appendChild(ruleTd);
    tr.appendChild(msgTd);
    tbody.appendChild(tr);
  }
}

/**
 * Renders hazard remediation table.
 * @param {Array} reports
 */
function renderReportsTable(reports) {
  const tbody = document.getElementById('table-reports-body');
  tbody.replaceChildren();

  if (!reports || reports.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'text-muted';
    td.textContent = t('admin.no_reports');
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const rep of reports) {
    const tr = document.createElement('tr');

    // Tracking code
    const codeTh = document.createElement('th');
    codeTh.scope = 'row';
    codeTh.textContent = rep.trackingCode;

    // Severity chip
    const sevTd = document.createElement('td');
    const sevChip = document.createElement('span');
    sevChip.className = `chip chip-${rep.severity}`;
    sevChip.textContent = rep.severity;
    sevTd.appendChild(sevChip);

    // Escalation status
    const escTd = document.createElement('td');
    if (rep.escalation && rep.escalation.escalated) {
      const escBadge = document.createElement('span');
      escBadge.className = 'escalated-badge';
      escBadge.textContent = `🚨 Escalated (${Math.round(rep.escalation.hoursOverdue)}h overdue)`;
      escTd.appendChild(escBadge);
    } else {
      const hoursOpen = rep.escalation ? Math.round(rep.escalation.hoursOpen) : 0;
      escTd.textContent = `In SLA (${hoursOpen}h open)`;
    }

    // Text & Category
    const textTd = document.createElement('td');
    textTd.textContent = rep.text;

    // Status select dropdown
    const actionTd = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'status-select';
    select.setAttribute('aria-label', `Status for ${rep.trackingCode}`);

    const statuses = ['open', 'acknowledged', 'in_progress', 'resolved'];
    for (const st of statuses) {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if (rep.status === st) opt.selected = true;
      select.appendChild(opt);
    }

    select.addEventListener('change', async () => {
      try {
        await apiRequest(`/api/admin/reports/${rep.id}`, {
          method: 'PATCH',
          body: { status: select.value }
        });
        await loadDashboardData();
      } catch (err) {
        alert(err.message || 'Failed to update report status.');
      }
    });

    actionTd.appendChild(select);

    tr.appendChild(codeTh);
    tr.appendChild(sevTd);
    tr.appendChild(escTd);
    tr.appendChild(textTd);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
}

/**
 * Renders pulse voice feedback aggregate.
 * @param {object} aggregate
 */
function renderFeedbackPanel(aggregate) {
  const container = document.getElementById('feedback-panel-container');
  container.replaceChildren();

  if (!aggregate || aggregate.count < 5) {
    const count = aggregate ? aggregate.count : 0;
    const p = document.createElement('p');
    p.className = 'feedback-insufficient-notice';

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🔒';

    const text = document.createElement('span');
    text.textContent = t('admin.feedback_insufficient', { count });

    p.appendChild(icon);
    p.appendChild(text);
    container.appendChild(p);
    return;
  }

  // Score summary
  const scoreRow = document.createElement('div');
  scoreRow.className = 'feedback-score-row';

  const scoreDiv = document.createElement('div');
  const ratingH3 = document.createElement('h3');
  ratingH3.className = 'big-rating';
  ratingH3.textContent = `★ ${aggregate.averageRating.toFixed(1)} / 5.0`;

  const countP = document.createElement('p');
  countP.className = 'card-note';
  countP.textContent = `Derived from ${aggregate.count} anonymous submissions.`;

  scoreDiv.appendChild(ratingH3);
  scoreDiv.appendChild(countP);
  scoreRow.appendChild(scoreDiv);
  container.appendChild(scoreRow);

  // Common tags / theme distribution as CSS bar rows
  if (aggregate.commonTags && Object.keys(aggregate.commonTags).length > 0) {
    const barsContainer = document.createElement('div');
    barsContainer.className = 'tag-bars-list';

    const maxCount = Math.max(...Object.values(aggregate.commonTags));

    for (const [tag, count] of Object.entries(aggregate.commonTags)) {
      const row = document.createElement('div');
      row.className = 'bar-row';

      const label = document.createElement('span');
      label.className = 'bar-label';
      label.textContent = tag;

      const track = document.createElement('div');
      track.className = 'bar-track';

      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
      fill.style.width = `${pct}%`;

      track.appendChild(fill);

      const countSpan = document.createElement('span');
      countSpan.className = 'bar-count';
      countSpan.textContent = String(count);

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(countSpan);
      barsContainer.appendChild(row);
    }

    container.appendChild(barsContainer);
  }
}

/**
 * Renders retention risk assessment cards.
 * @param {Array} risks
 */
function renderRetentionRisks(risks) {
  const container = document.getElementById('risk-cards-container');
  container.replaceChildren();

  if (!risks || risks.length === 0) {
    container.textContent = 'No workers found.';
    return;
  }

  for (const r of risks) {
    const card = document.createElement('article');
    card.className = 'risk-card';

    const top = document.createElement('div');
    top.className = 'risk-card-top';

    const name = document.createElement('h3');
    name.className = 'risk-worker-name';
    name.textContent = r.workerName;

    const chip = document.createElement('span');
    chip.className = `chip chip-${r.level}`;
    chip.textContent = `${r.level} (${r.score} pts)`;

    top.appendChild(name);
    top.appendChild(chip);
    card.appendChild(top);

    const ul = document.createElement('ul');
    ul.className = 'risk-reasons-list';

    if (r.reasons && r.reasons.length > 0) {
      for (const reason of r.reasons) {
        const li = document.createElement('li');
        li.textContent = `• Flagged because ${t(reason.messageKey, reason.params) || reason.message}`;
        ul.appendChild(li);
      }
    } else {
      const li = document.createElement('li');
      li.textContent = '• Zero operational retention risk factors detected.';
      ul.appendChild(li);
    }

    card.appendChild(ul);
    container.appendChild(card);
  }
}

/**
 * Populates worker dropdown in payroll editor.
 * @param {Array} workers
 */
function populateWorkerSelect(workers) {
  const select = document.getElementById('select-payroll-worker');
  select.replaceChildren();

  for (const w of workers) {
    const opt = document.createElement('option');
    opt.value = w.workerId;
    opt.textContent = `${w.workerName} (${w.workerId})`;
    select.appendChild(opt);
  }

  // Set default date to today
  const dateInput = document.getElementById('input-payroll-date');
  if (!dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
}

/**
 * Saves payroll adjustment.
 * @param {Event} e
 */
async function handleSavePayroll(e) {
  e.preventDefault();
  const workerId = document.getElementById('select-payroll-worker').value;
  const date = document.getElementById('input-payroll-date').value;
  const normalMinutes = Number(document.getElementById('input-payroll-normal').value) || 0;
  const overtimeMinutes = Number(document.getElementById('input-payroll-overtime').value) || 0;
  const msgEl = document.getElementById('payroll-feedback-msg');

  try {
    await apiRequest('/api/admin/payroll', {
      method: 'PUT',
      body: { workerId, date, normalMinutes, overtimeMinutes }
    });
    msgEl.textContent = `Payroll updated for ${date}. Worker payslip audit log recorded.`;
    await loadDashboardData();
  } catch (err) {
    msgEl.textContent = `Failed to save payroll: ${err.message}`;
  }
}

/**
 * Confirms a shift day.
 */
async function handleConfirmDay() {
  const workerId = document.getElementById('select-payroll-worker').value;
  const date = document.getElementById('input-payroll-date').value;
  const msgEl = document.getElementById('payroll-feedback-msg');

  try {
    await apiRequest('/api/admin/days/confirm', {
      method: 'POST',
      body: { workerId, date, reason: 'Confirmed by site supervisor' }
    });
    msgEl.textContent = `Day ${date} confirmed successfully.`;
    await loadDashboardData();
  } catch (err) {
    msgEl.textContent = `Failed to confirm day: ${err.message}`;
  }
}

/**
 * Disputes a shift day.
 */
async function handleDisputeDay() {
  const workerId = document.getElementById('select-payroll-worker').value;
  const date = document.getElementById('input-payroll-date').value;
  const msgEl = document.getElementById('payroll-feedback-msg');

  const reason = prompt(`Enter reason for disputing shift on ${date}:`, 'Discrepancy observed');
  if (!reason) return;

  try {
    await apiRequest('/api/admin/days/dispute', {
      method: 'POST',
      body: { workerId, date, reason }
    });
    msgEl.textContent = `Day ${date} marked as disputed.`;
    await loadDashboardData();
  } catch (err) {
    msgEl.textContent = `Failed to dispute day: ${err.message}`;
  }
}

/**
 * Displays error message in target element.
 * @param {string} elementId
 * @param {string} msg
 */
function showError(elementId, msg) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = msg;
    el.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', init);

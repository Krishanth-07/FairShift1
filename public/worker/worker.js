/**
 * @file Frontline Worker Application Logic
 *
 * Implements shift check-in/out, offline punch queuing & synchronization,
 * payslip reconciliation audits, voice/text hazard reporting, anonymous feedback,
 * and advocate advisory. Strictly avoids innerHTML; uses pure DOM creation APIs.
 */

import { api } from '../shared/api.js';
import { t, initI18n, setLanguage, getCurrentLanguage, applyI18n } from '../shared/i18n.js';
import { speak, listen } from '../shared/speech.js';
import { createSvg } from '../shared/icons.js';

// Offline Queue Key
const OFFLINE_QUEUE_KEY = 'fs_offline_queue_v1';

// Application State
const state = {
  currentUser: null,
  activeTab: 'tab-home',
  activeSession: null,
  offlineQueue: [],
  selectedCategory: '',
  selectedFeedbackTags: new Set(),
  activeAdvocateText: '',
  activeDiscrepancyText: '',
  speechController: null
};

/**
 * Formats integer paise into Indian Rupee currency string with proper digit grouping.
 * @param {number} paise - Amount in integer paise.
 * @returns {string} Formatted string, e.g. "₹1,250.00".
 */
function formatInr(paise) {
  const rupees = (Number(paise) || 0) / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Broadcasts an announcement to screen readers via aria-live.
 * @param {string} msg
 */
function announce(msg) {
  const region = document.getElementById('live-region');
  if (region) {
    region.textContent = msg;
  }
}

/**
 * Loads queued offline punch items from localStorage.
 * @returns {Array<object>}
 */
function loadOfflineQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persists offline queue items to localStorage.
 * @param {Array<object>} queue
 */
function saveOfflineQueue(queue) {
  state.offlineQueue = queue;
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // quota exceeded or private mode
  }
  updateQueueUI();
}

/**
 * Updates offline queue badge and indicator UI.
 */
function updateQueueUI() {
  const indicator = document.getElementById('queue-indicator');
  const indicatorText = document.getElementById('queue-indicator-text');
  const count = state.offlineQueue.length;

  if (count > 0) {
    if (indicator) indicator.hidden = false;
    if (indicatorText) {
      indicatorText.textContent = t('home.queue_count', { count });
    }
  } else {
    if (indicator) indicator.hidden = true;
  }
}

/**
 * Flushes all offline queued punches via the sync API.
 */
async function flushOfflineQueue() {
  if (state.offlineQueue.length === 0 || !navigator.onLine || !state.currentUser) {
    return;
  }

  const itemsToSend = [...state.offlineQueue];
  try {
    const res = await api.post('/api/records/sync', { items: itemsToSend });
    if (res && Array.isArray(res.results)) {
      const remaining = [];
      for (const item of itemsToSend) {
        const itemResult = res.results.find((r) => r.clientId === item.clientId);
        // Remove item only if the server accepted or confirmed as duplicate
        if (!itemResult || (itemResult.status !== 'accepted' && itemResult.status !== 'duplicate')) {
          remaining.push(item);
        }
      }
      saveOfflineQueue(remaining);
      announce(t('home.punch_success'));
      refreshStatus();
    }
  } catch (err) {
    console.warn('[FairShift Offline] Flush sync failed:', err);
  }
}

/**
 * Initializes and binds navigation tabs.
 */
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  for (const btn of navButtons) {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');
      switchTab(targetTabId);
    });
  }
}

/**
 * Switches the active application tab.
 * @param {string} tabId
 */
function switchTab(tabId) {
  state.activeTab = tabId;

  // Update navigation buttons
  const navButtons = document.querySelectorAll('.nav-item');
  for (const btn of navButtons) {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  // Update tab panes
  const panes = document.querySelectorAll('.tab-pane');
  for (const pane of panes) {
    if (pane.id === tabId) {
      pane.hidden = false;
      pane.classList.add('active');
    } else {
      pane.hidden = true;
      pane.classList.remove('active');
    }
  }

  // Refresh tab-specific data
  if (tabId === 'tab-payslip') {
    loadPayslip();
  } else if (tabId === 'tab-home') {
    refreshStatus();
    loadAdvocateAdvisory();
  }
}

/**
 * Sets up language switcher buttons.
 */
function setupLanguageSwitcher() {
  const langButtons = document.querySelectorAll('.lang-btn');
  const updateActiveLang = () => {
    const current = getCurrentLanguage();
    for (const btn of langButtons) {
      if (btn.getAttribute('data-lang') === current) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  };

  updateActiveLang();

  for (const btn of langButtons) {
    btn.addEventListener('click', async () => {
      const lang = btn.getAttribute('data-lang');
      await setLanguage(lang);
      updateActiveLang();
      renderDynamicUI();
    });
  }

  window.addEventListener('fs-language-changed', () => {
    updateActiveLang();
    renderDynamicUI();
  });
}

/**
 * Injects inline accessible SVG icons into DOM containers.
 */
function injectIcons() {
  const homeIcon = document.getElementById('nav-icon-home');
  if (homeIcon) homeIcon.appendChild(createSvg('checkin', 22));

  const payslipIcon = document.getElementById('nav-icon-payslip');
  if (payslipIcon) payslipIcon.appendChild(createSvg('payslip', 22));

  const reportIcon = document.getElementById('nav-icon-report');
  if (reportIcon) reportIcon.appendChild(createSvg('report', 22));

  const feedbackIcon = document.getElementById('nav-icon-feedback');
  if (feedbackIcon) feedbackIcon.appendChild(createSvg('feedback', 22));

  const punchIcon = document.getElementById('punch-btn-icon');
  if (punchIcon) punchIcon.appendChild(createSvg('checkin', 28));

  const micIcon = document.getElementById('mic-icon');
  if (micIcon) micIcon.appendChild(createSvg('mic', 24));

  const speakerAdvocate = document.getElementById('speaker-icon-advocate');
  if (speakerAdvocate) speakerAdvocate.appendChild(createSvg('speaker', 20));

  const speakerUnderpaid = document.getElementById('speaker-icon-underpaid');
  if (speakerUnderpaid) speakerUnderpaid.appendChild(createSvg('speaker', 20));
}

/**
 * Renders dynamic localized text across active cards.
 */
function renderDynamicUI() {
  applyI18n(document);
  if (state.currentUser) {
    const badge = document.getElementById('user-badge');
    if (badge) {
      badge.textContent = `${state.currentUser.name} (${state.currentUser.id})`;
    }
    updatePunchButtonUI();
    loadAdvocateAdvisory();
    loadPayslip();
  }
}

/**
 * Loads available demo worker accounts when DEMO_MODE is active.
 */
async function loadDemoUsers() {
  const container = document.getElementById('demo-cards');
  const section = document.getElementById('demo-section');
  if (!container || !section) return;

  try {
    const users = await api.get('/api/auth/demo-users');
    if (Array.isArray(users) && users.length > 0) {
      section.hidden = false;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      const workersOnly = users.filter((u) => u.role === 'worker');
      for (const worker of workersOnly) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'demo-worker-card';

        const nameEl = document.createElement('span');
        nameEl.className = 'demo-worker-name';
        nameEl.textContent = worker.name;

        const siteEl = document.createElement('span');
        siteEl.className = 'demo-worker-site';
        siteEl.textContent = `${worker.siteLabel} • ${worker.id}`;

        card.appendChild(nameEl);
        card.appendChild(siteEl);

        card.addEventListener('click', async () => {
          try {
            const loginRes = await api.post('/api/auth/demo-login', { userId: worker.id });
            onLoginSuccess(loginRes.user);
          } catch (err) {
            alert(err.message);
          }
        });

        container.appendChild(card);
      }
    }
  } catch {
    section.hidden = true;
  }
}

/**
 * Handles PIN-based standard login form submission.
 */
function setupLoginForm() {
  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorBox) errorBox.hidden = true;

      const userId = document.getElementById('input-user-id')?.value.trim();
      const pin = document.getElementById('input-pin')?.value.trim();

      if (!userId || !pin) {
        if (errorBox) {
          errorBox.textContent = t('errors.validation.missing_fields');
          errorBox.hidden = false;
        }
        return;
      }

      try {
        const res = await api.post('/api/auth/login', { userId, pin });
        onLoginSuccess(res.user);
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message || t('errors.auth.invalid_credentials');
          errorBox.hidden = false;
        }
      }
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await api.post('/api/auth/logout');
      } catch {
        // ignore
      }
      onLogout();
    });
  }
}

/**
 * Callback on successful authentication.
 * @param {object} user
 */
async function onLoginSuccess(user) {
  state.currentUser = user;
  if (user.lang) {
    await setLanguage(user.lang);
  }

  document.getElementById('view-login').hidden = true;
  document.getElementById('view-app').hidden = false;
  document.getElementById('bottom-nav').hidden = false;
  document.getElementById('user-controls').hidden = false;

  renderDynamicUI();
  switchTab('tab-home');
  flushOfflineQueue();
}

/**
 * Resets application state on logout.
 */
function onLogout() {
  state.currentUser = null;
  state.activeSession = null;
  document.getElementById('view-login').hidden = false;
  document.getElementById('view-app').hidden = true;
  document.getElementById('bottom-nav').hidden = true;
  document.getElementById('user-controls').hidden = true;
  renderDynamicUI();
}

/**
 * Fetches current shift status from /api/me/status.
 */
async function refreshStatus() {
  if (!state.currentUser) return;
  try {
    const data = await api.get('/api/me/status');
    state.activeSession = data.activeSession;
    updatePunchButtonUI();
  } catch (err) {
    console.warn('[FairShift Status] Failed to refresh status:', err);
  }
}

/**
 * Updates the appearance of the Giant Punch Button based on active session state.
 */
function updatePunchButtonUI() {
  const punchBtn = document.getElementById('btn-giant-punch');
  const punchText = document.getElementById('punch-btn-text');
  const shiftBadge = document.getElementById('shift-state-badge');
  const shiftDesc = document.getElementById('shift-state-desc');

  if (!punchBtn || !punchText) return;

  if (state.activeSession) {
    // Currently checked in: next action is Check Out
    punchBtn.classList.add('state-out');
    punchText.textContent = t('home.checkout_btn');

    if (shiftBadge) {
      shiftBadge.className = 'badge badge-ok';
      shiftBadge.textContent = t('home.on_shift');
    }
    if (shiftDesc) {
      const startTime = new Date(state.activeSession.inTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      shiftDesc.textContent = t('home.active_since', { time: startTime });
    }
  } else {
    // Currently checked out: next action is Check In
    punchBtn.classList.remove('state-out');
    punchText.textContent = t('home.checkin_btn');

    if (shiftBadge) {
      shiftBadge.className = 'badge badge-info';
      shiftBadge.textContent = t('home.off_duty');
    }
    if (shiftDesc) {
      shiftDesc.textContent = t('home.no_active_session');
    }
  }
}

/**
 * Binds the Giant Punch Button to the site code verification dialog.
 */
function setupPunchButton() {
  const punchBtn = document.getElementById('btn-giant-punch');
  const dialog = document.getElementById('site-code-dialog');
  const codeForm = document.getElementById('site-code-form');
  const cancelBtn = document.getElementById('btn-cancel-code');
  const errorBox = document.getElementById('site-code-error');
  const codeInput = document.getElementById('input-site-code');

  if (punchBtn && dialog) {
    punchBtn.addEventListener('click', () => {
      if (errorBox) errorBox.hidden = true;
      if (codeInput) codeInput.value = '';

      const isCheckOut = Boolean(state.activeSession);
      const title = document.getElementById('site-code-title');
      if (title) {
        title.textContent = isCheckOut ? t('home.checkout_btn') : t('home.checkin_btn');
      }

      dialog.showModal();
      if (codeInput) codeInput.focus();
    });
  }

  if (cancelBtn && dialog) {
    cancelBtn.addEventListener('click', () => {
      dialog.close();
    });
  }

  if (codeForm && dialog) {
    codeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorBox) errorBox.hidden = true;

      const siteCode = codeInput?.value.trim();
      if (!siteCode || siteCode.length !== 6) {
        if (errorBox) {
          errorBox.textContent = t('errors.records.invalid_site_code');
          errorBox.hidden = false;
        }
        return;
      }

      const type = state.activeSession ? 'out' : 'in';
      const clientTs = new Date().toISOString();
      const clientId = crypto.randomUUID();

      const punchItem = {
        type,
        clientTs,
        clientId,
        siteCode
      };

      try {
        const res = await api.post('/api/records', punchItem);
        dialog.close();
        displayReceipt(res.record);
        announce(t('home.punch_success'));
        await refreshStatus();
        loadAdvocateAdvisory();
      } catch (err) {
        if (err.isNetworkError || !navigator.onLine) {
          // Store in offline queue
          dialog.close();
          const queue = loadOfflineQueue();
          queue.push(punchItem);
          saveOfflineQueue(queue);

          announce(t('home.offline_queued'));
          alert(t('home.offline_queued'));
          // Optimistically flip session state if offline
          if (type === 'in') {
            state.activeSession = { inTs: clientTs, outTs: null };
          } else {
            state.activeSession = null;
          }
          updatePunchButtonUI();
        } else {
          if (errorBox) {
            errorBox.textContent = err.message || t('errors.records.invalid_site_code');
            errorBox.hidden = false;
          }
        }
      }
    });
  }
}

/**
 * Displays digital receipt confirmation card.
 * @param {object} record
 */
function displayReceipt(record) {
  const card = document.getElementById('receipt-card');
  const hashEl = document.getElementById('receipt-hash');
  if (card && hashEl && record) {
    hashEl.textContent = t('home.receipt_ref', { hash: record.hash?.slice(0, 24) + '...' });
    card.hidden = false;
  }
}

/**
 * Loads advocate advisory card from /api/me/advice.
 */
async function loadAdvocateAdvisory() {
  if (!state.currentUser) return;

  const headlineEl = document.getElementById('advocate-headline');
  const iconEl = document.getElementById('advocate-icon');
  const reasonsContainer = document.getElementById('advocate-reasons-container');
  const reasonsList = document.getElementById('advocate-reasons-list');

  try {
    const advice = await api.get('/api/me/advice');
    if (!advice || !advice.primary) return;

    if (iconEl) iconEl.textContent = advice.primary.icon || '🛡️';
    if (headlineEl) headlineEl.textContent = t(advice.primary.headlineKey);

    state.activeAdvocateText = t(advice.primary.headlineKey);

    if (Array.isArray(advice.reasons) && advice.reasons.length > 0) {
      if (reasonsContainer) reasonsContainer.hidden = false;
      if (reasonsList) {
        while (reasonsList.firstChild) {
          reasonsList.removeChild(reasonsList.firstChild);
        }
        for (const r of advice.reasons) {
          const li = document.createElement('li');
          const translatedReason = r.messageKey ? t(r.messageKey, r.params) : r.message;
          li.textContent = translatedReason;
          reasonsList.appendChild(li);
          state.activeAdvocateText += `. ${translatedReason}`;
        }
      }
    } else {
      if (reasonsContainer) reasonsContainer.hidden = true;
    }
  } catch (err) {
    console.warn('[FairShift Advocate] Failed to load advisory:', err);
  }
}

/**
 * Binds Text-to-Speech Read Aloud buttons.
 */
function setupSpeechReadAloud() {
  const readAdvocateBtn = document.getElementById('btn-read-advocate');
  if (readAdvocateBtn) {
    readAdvocateBtn.addEventListener('click', () => {
      const textToRead = state.activeAdvocateText || t('advocate.headline.all_clear');
      speak(textToRead, getCurrentLanguage());
    });
  }

  const readUnderpaidBtn = document.getElementById('btn-read-underpaid');
  if (readUnderpaidBtn) {
    readUnderpaidBtn.addEventListener('click', () => {
      const textToRead = state.activeDiscrepancyText || t('advocate.headline.underpaid');
      speak(textToRead, getCurrentLanguage());
    });
  }
}

/**
 * Loads payslip details for the selected period.
 */
async function loadPayslip() {
  if (!state.currentUser) return;

  const periodPicker = document.getElementById('select-period');
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (periodPicker && !periodPicker.value) {
    periodPicker.value = currentMonth;
  }

  const period = periodPicker ? periodPicker.value : currentMonth;

  try {
    const payslip = await api.get(`/api/me/payslip?period=${period}`);
    renderPayslip(payslip);
  } catch (err) {
    console.warn('[FairShift Payslip] Load error:', err);
  }
}

/**
 * Renders payslip lines, totals, underpaid alert, and audit amendments.
 * @param {object} payslip
 */
function renderPayslip(payslip) {
  const totalAmountEl = document.getElementById('payslip-total-amount');
  const reconcileNoteEl = document.getElementById('payslip-reconcile-note');
  const linesContainer = document.getElementById('payslip-lines-list');
  const auditContainer = document.getElementById('payslip-audit-list');
  const underpaidCard = document.getElementById('underpaid-alert-card');
  const underpaidText = document.getElementById('underpaid-text');

  if (totalAmountEl) {
    totalAmountEl.textContent = formatInr(payslip.totalPaise);
  }

  // Underpaid condition check
  if (payslip.reconciliation && payslip.reconciliation.status === 'underpaid') {
    if (underpaidCard) underpaidCard.hidden = false;
    const owedFormatted = ((payslip.owedPaise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const loggedHours = Math.round((payslip.reconciliation.diffNormalMinutes + (payslip.payrollEntries?.[0]?.normalMinutes || 0)) / 60 * 10) / 10;
    const paidHours = Math.round((payslip.payrollEntries?.[0]?.normalMinutes || 0) / 60 * 10) / 10;

    const alertMessage = t('payslip.underpaid_alert', {
      loggedHours,
      paidHours,
      owedAmount: owedFormatted
    });

    if (underpaidText) underpaidText.textContent = alertMessage;
    state.activeDiscrepancyText = alertMessage;
  } else {
    if (underpaidCard) underpaidCard.hidden = true;
  }

  if (reconcileNoteEl) {
    reconcileNoteEl.textContent = payslip.reconciliation?.reasons?.[0]?.messageKey
      ? t(payslip.reconciliation.reasons[0].messageKey, payslip.reconciliation.reasons[0].params)
      : (payslip.reconciliation?.reasons?.[0]?.message || t('rules.reconcile.match'));
  }

  // Render Line Items
  if (linesContainer && Array.isArray(payslip.lines)) {
    while (linesContainer.firstChild) {
      linesContainer.removeChild(linesContainer.firstChild);
    }
    for (const line of payslip.lines) {
      const row = document.createElement('div');
      row.className = 'line-item';

      const desc = document.createElement('span');
      desc.className = 'line-desc';
      desc.textContent = t(line.messageKey, {
        minutes: line.minutes,
        ratePaise: (line.ratePaise / 100).toFixed(0),
        multiplier: line.params?.multiplier || 1.5
      });

      const amount = document.createElement('span');
      amount.className = 'line-amount';
      amount.textContent = formatInr(line.amountPaise);

      row.appendChild(desc);
      row.appendChild(amount);
      linesContainer.appendChild(row);
    }
  }

  // Render Audit amendments
  if (auditContainer) {
    while (auditContainer.firstChild) {
      auditContainer.removeChild(auditContainer.firstChild);
    }
    if (Array.isArray(payslip.auditLog) && payslip.auditLog.length > 0) {
      for (const entry of payslip.auditLog) {
        const item = document.createElement('div');
        item.className = 'audit-item';
        item.textContent = `${entry.date}: Payroll amended by Admin ${entry.adminId} (Regular: ${entry.after.normalMinutes}m, OT: ${entry.after.overtimeMinutes}m)`;
        auditContainer.appendChild(item);
      }
    } else {
      const empty = document.createElement('p');
      empty.className = 'text-muted';
      empty.textContent = t('payslip.no_audit');
      auditContainer.appendChild(empty);
    }
  }
}

/**
 * Sets up payslip period picker and dispute submission dialog.
 */
function setupPayslipActions() {
  const periodPicker = document.getElementById('select-period');
  if (periodPicker) {
    periodPicker.addEventListener('change', () => {
      loadPayslip();
    });
  }

  const disputeBtn = document.getElementById('btn-open-dispute');
  const disputeDialog = document.getElementById('dispute-dialog');
  const cancelDisputeBtn = document.getElementById('btn-cancel-dispute');
  const disputeForm = document.getElementById('dispute-form');

  if (disputeBtn && disputeDialog) {
    disputeBtn.addEventListener('click', () => {
      const dateSelect = document.getElementById('dispute-date-select');
      if (dateSelect) dateSelect.value = new Date().toISOString().slice(0, 10);
      disputeDialog.showModal();
    });
  }

  if (cancelDisputeBtn && disputeDialog) {
    cancelDisputeBtn.addEventListener('click', () => {
      disputeDialog.close();
    });
  }

  if (disputeForm && disputeDialog) {
    disputeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('dispute-date-select')?.value;
      const reason = document.getElementById('dispute-reason-text')?.value.trim();

      if (!date || !reason) return;

      try {
        await api.post(`/api/me/days/${date}/dispute`, { reason });
        disputeDialog.close();
        alert('Dispute submitted successfully.');
        loadPayslip();
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

/**
 * Category chips available for hazard reporting.
 */
const REPORT_CATEGORIES = [
  'structural_hazard',
  'ppe_violation',
  'equipment_defect',
  'heat_exhaustion',
  'unsafe_scaffolding',
  'biohazard_spill',
  'needlestick_injury'
];

/**
 * Sets up Hazard Report form, category chips, voice dictation, and tracking lookup.
 */
function setupReportView() {
  const chipsContainer = document.getElementById('category-chips');
  if (chipsContainer) {
    while (chipsContainer.firstChild) {
      chipsContainer.removeChild(chipsContainer.firstChild);
    }
    for (const cat of REPORT_CATEGORIES) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip-btn';
      chip.textContent = cat.replace(/_/g, ' ');
      chip.addEventListener('click', () => {
        state.selectedCategory = state.selectedCategory === cat ? '' : cat;
        for (const c of chipsContainer.children) {
          c.classList.remove('selected');
        }
        if (state.selectedCategory) {
          chip.classList.add('selected');
        }
      });
      chipsContainer.appendChild(chip);
    }
  }

  // Voice Dictation
  const micBtn = document.getElementById('btn-mic-report');
  const micStatus = document.getElementById('mic-status');
  const reportTextArea = document.getElementById('report-text');

  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (state.speechController) {
        state.speechController.stop();
        state.speechController = null;
        micBtn.classList.remove('recording');
        if (micStatus) micStatus.textContent = '';
        return;
      }

      micBtn.classList.add('recording');
      if (micStatus) micStatus.textContent = t('report.mic_listening');

      state.speechController = listen(
        getCurrentLanguage(),
        (transcript) => {
          if (reportTextArea) {
            reportTextArea.value = reportTextArea.value
              ? `${reportTextArea.value} ${transcript}`
              : transcript;
          }
          micBtn.classList.remove('recording');
          if (micStatus) micStatus.textContent = '';
          state.speechController = null;
        },
        (err) => {
          micBtn.classList.remove('recording');
          if (micStatus) micStatus.textContent = err.message || '';
          state.speechController = null;
        }
      );
    });
  }

  // Report Submission Form
  const reportForm = document.getElementById('hazard-form');
  const errorBox = document.getElementById('report-form-error');
  const successCard = document.getElementById('report-success-card');
  const trackingCodeEl = document.getElementById('generated-tracking-code');

  if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorBox) errorBox.hidden = true;

      const text = reportTextArea?.value.trim();
      if (!text) {
        if (errorBox) {
          errorBox.textContent = t('errors.reports.empty_text');
          errorBox.hidden = false;
        }
        return;
      }

      try {
        const payload = { text };
        if (state.selectedCategory) {
          payload.category = state.selectedCategory;
        }

        const res = await api.post('/api/reports', payload);
        if (reportTextArea) reportTextArea.value = '';
        if (successCard) successCard.hidden = false;
        if (trackingCodeEl) trackingCodeEl.textContent = res.trackingCode;
        announce(t('report.success_title'));
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
        }
      }
    });
  }

  // Copy tracking code
  const copyBtn = document.getElementById('btn-copy-code');
  const copyStatus = document.getElementById('copy-status');
  if (copyBtn && trackingCodeEl) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(trackingCodeEl.textContent);
        if (copyStatus) copyStatus.textContent = t('report.copied');
        setTimeout(() => {
          if (copyStatus) copyStatus.textContent = '';
        }, 2000);
      } catch {
        // fallback
      }
    });
  }

  // Report Tracking Lookup Form
  const trackForm = document.getElementById('track-form');
  const trackInput = document.getElementById('input-track-code');
  const trackResultContainer = document.getElementById('track-result-container');
  const trackResultStatus = document.getElementById('track-result-status');
  const trackResultSeverity = document.getElementById('track-result-severity');
  const trackResultHistory = document.getElementById('track-result-history');

  if (trackForm) {
    trackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = trackInput?.value.trim();
      if (!code) return;

      try {
        const report = await api.get(`/api/reports/${code}`);
        if (trackResultContainer) trackResultContainer.hidden = false;
        if (trackResultStatus) {
          trackResultStatus.textContent = t('report.status_label', { status: report.status?.toUpperCase() });
        }
        if (trackResultSeverity) {
          trackResultSeverity.textContent = t('report.severity_label', { severity: report.severity?.toUpperCase() });
        }

        if (trackResultHistory && Array.isArray(report.history)) {
          while (trackResultHistory.firstChild) {
            trackResultHistory.removeChild(trackResultHistory.firstChild);
          }
          for (const h of report.history) {
            const li = document.createElement('li');
            li.textContent = `${new Date(h.timestamp).toLocaleDateString()}: ${h.status} - ${h.note || ''}`;
            trackResultHistory.appendChild(li);
          }
        }
      } catch (err) {
        alert(err.message || t('errors.reports.not_found'));
      }
    });
  }
}

/**
 * Tags available for feedback.
 */
const FEEDBACK_TAGS = ['safety', 'schedule', 'pay', 'heat', 'respect', 'facilities', 'supervisor'];

/**
 * Sets up Anonymous Feedback Form and Tag Selection Chips.
 */
function setupFeedbackView() {
  const chipsContainer = document.getElementById('feedback-chips');
  if (chipsContainer) {
    while (chipsContainer.firstChild) {
      chipsContainer.removeChild(chipsContainer.firstChild);
    }
    for (const tag of FEEDBACK_TAGS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip-btn';
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        if (state.selectedFeedbackTags.has(tag)) {
          state.selectedFeedbackTags.delete(tag);
          chip.classList.remove('selected');
        } else {
          state.selectedFeedbackTags.add(tag);
          chip.classList.add('selected');
        }
      });
      chipsContainer.appendChild(chip);
    }
  }

  const feedbackForm = document.getElementById('feedback-form');
  const errorBox = document.getElementById('feedback-form-error');
  const successCard = document.getElementById('feedback-success-card');

  if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorBox) errorBox.hidden = true;

      const targetType = document.querySelector('input[name="targetType"]:checked')?.value || 'conditions';
      const rating = parseInt(document.querySelector('input[name="rating"]:checked')?.value || '3', 10);
      const comment = document.getElementById('feedback-comment')?.value.trim();

      const payload = {
        targetType,
        rating,
        tags: [...state.selectedFeedbackTags],
        comment
      };

      try {
        await api.post('/api/feedback', payload);
        feedbackForm.reset();
        state.selectedFeedbackTags.clear();
        for (const c of chipsContainer.children) c.classList.remove('selected');
        if (successCard) successCard.hidden = false;
        announce(t('feedback.success'));
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
        }
      }
    });
  }
}

/**
 * Sets up network connectivity listeners to display offline banner and trigger queue flushing.
 */
function setupNetworkListeners() {
  const banner = document.getElementById('offline-banner');

  const updateOnlineStatus = () => {
    if (navigator.onLine) {
      if (banner) banner.hidden = true;
      flushOfflineQueue();
    } else {
      if (banner) banner.hidden = false;
    }
  };

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // Periodic flush every 30 seconds if offline items exist
  setInterval(() => {
    if (navigator.onLine && state.offlineQueue.length > 0) {
      flushOfflineQueue();
    }
  }, 30000);
}

/**
 * Initializes the Worker Single Page Application.
 */
async function initApp() {
  // 1. Load language preference & i18n bundles
  await initI18n();

  // 2. Set up component listeners
  setupLanguageSwitcher();
  setupNavigation();
  injectIcons();
  setupLoginForm();
  setupPunchButton();
  setupSpeechReadAloud();
  setupPayslipActions();
  setupReportView();
  setupFeedbackView();
  setupNetworkListeners();

  // 3. Load offline queue from device storage
  state.offlineQueue = loadOfflineQueue();
  updateQueueUI();

  // 4. Check existing session
  try {
    const authData = await api.get('/api/auth/me');
    if (authData && authData.user) {
      onLoginSuccess(authData.user);
    }
  } catch {
    // Not authenticated: render login
    document.getElementById('view-login').hidden = false;
    loadDemoUsers();
  }

  // Handle unauthorized events dispatched by API wrapper
  window.addEventListener('fs-unauthorized', () => {
    onLogout();
  });
}

// Bootstrap once DOM content is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

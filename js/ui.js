// ─────────────────────────────────────────────
// ui.js — Rendering, modals, and UI interactions
// ─────────────────────────────────────────────

// ─── Render all UI ────────────────────────────
function renderAll(records) {
  renderAlertBanner(records);
  renderStats(records);
  renderRecords(records);
}

// ─── Alert Banner ─────────────────────────────
function renderAlertBanner(records) {
  const banner   = document.getElementById('alert-banner');
  const active   = records.filter(r => !r.returned_date);
  const overdue  = active.filter(r => getStatus(r) === 'overdue');
  const upcoming = active.filter(r => getStatus(r) === 'upcoming');

  let html = '';

  overdue.forEach(r => {
    html += `
      <div class="alert-item overdue">
        <span class="alert-icon">⚠️</span>
        <span><strong>${escHtml(r.item_name)}</strong> lent to ${escHtml(r.recipient_name)} is
          <strong>${daysOverdue(r)} day(s) overdue</strong> — due ${formatDate(r.due_date)}</span>
      </div>`;
  });

  upcoming.forEach(r => {
    const hrs = Math.round(hoursUntilDue(r));
    html += `
      <div class="alert-item upcoming">
        <span class="alert-icon">🔔</span>
        <span><strong>${escHtml(r.item_name)}</strong> lent to ${escHtml(r.recipient_name)} is
          due in <strong>~${hrs}h</strong> (${formatDate(r.due_date)})</span>
      </div>`;
  });

  banner.innerHTML = html;
  banner.style.display = html ? 'flex' : 'none';
}

// ─── Stats ────────────────────────────────────
function renderStats(records) {
  const active   = records.filter(r => !r.returned_date);
  const overdue  = active.filter(r => getStatus(r) === 'overdue').length;
  const upcoming = active.filter(r => getStatus(r) === 'upcoming').length;
  document.getElementById('stat-active').textContent   = active.length;
  document.getElementById('stat-upcoming').textContent = upcoming;
  document.getElementById('stat-overdue').textContent  = overdue;
}

// ─── Records List ─────────────────────────────
function renderRecords(records) {
  const container = document.getElementById('records-list');
  const filter = window._currentFilter || 'all';

  let filtered = filter === 'all' ? [...records] : records.filter(r => getStatus(r) === filter);

  const order = { overdue: 0, upcoming: 1, active: 2, returned: 3 };
  filtered.sort((a, b) => order[getStatus(a)] - order[getStatus(b)]);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🤝</div>
        <p>${filter === 'all' ? 'No lending records yet. Add one to get started.' : `No ${filter} records.`}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(record => {
    const status     = getStatus(record);
    const badgeLabel = status === 'upcoming' ? 'Due Soon' :
                       status === 'overdue'  ? `Overdue ${daysOverdue(record)}d` :
                       status === 'returned' ? 'Returned' : 'Active';

    const returnedRow = record.returned_date
      ? `<span>↩ returned ${formatDate(record.returned_date)}</span>` : '';

    const actions = status !== 'returned'
      ? `<button class="btn btn-ok"    onclick="openReturnModal('${record.id}')">✓ Returned</button>
         <button class="btn btn-danger" onclick="handleDelete('${record.id}')">Delete</button>`
      : `<button class="btn btn-danger" onclick="handleDelete('${record.id}')">Delete</button>`;

    return `
      <div class="record-card status-${status}">
        <div class="record-main">
          <div>
            <div class="status-badge badge-${status}">${badgeLabel}</div>
            <div class="record-item-name">${escHtml(record.item_name)}</div>
            <div class="record-meta">
              <span>👤 ${escHtml(record.lender_name)} → ${escHtml(record.recipient_name)}</span>
              <span>📅 borrowed ${formatDate(record.borrowed_date)}</span>
              <span>📆 due ${formatDate(record.due_date)}</span>
              <span>✉️ ${escHtml(record.recipient_email)}</span>
              ${record.notes ? `<span>📝 ${escHtml(record.notes)}</span>` : ''}
              ${returnedRow}
            </div>
          </div>
          <div class="record-actions">${actions}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── Filter ───────────────────────────────────
function setFilter(f, btn) {
  window._currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRecords(window._records || []);
}

// ─── Add/Edit Modal ───────────────────────────
function openAddModal() {
  document.getElementById('modal-title').textContent = 'New Lending Record';
  document.getElementById('f-lender').value     = '';
  document.getElementById('f-recipient').value  = '';
  document.getElementById('f-item').value       = '';
  document.getElementById('f-borrowed').value   = todayISO();
  document.getElementById('f-due').value        = '';
  document.getElementById('f-email').value      = '';
  document.getElementById('f-notes').value      = '';
  document.getElementById('record-modal').classList.add('open');
}

function closeRecordModal() {
  document.getElementById('record-modal').classList.remove('open');
}

// ─── Return Modal ─────────────────────────────
function openReturnModal(id) {
  window._returningId = id;
  document.getElementById('f-return-date').value = todayISO();
  document.getElementById('return-modal').classList.add('open');
}

function closeReturnModal() {
  document.getElementById('return-modal').classList.remove('open');
  window._returningId = null;
}

// ─── User Menu ────────────────────────────────
function toggleUserMenu() {
  document.getElementById('user-dropdown').classList.toggle('open');
}

// Close dropdown when clicking outside. Dropdown item clicks (like Sign Out)
// call stopPropagation so this listener doesn't race with their handlers.
document.addEventListener('click', e => {
  const menu = document.getElementById('user-dropdown');
  if (!menu) return;
  if (!e.target.closest('.user-menu')) {
    menu.classList.remove('open');
  }
});

// ─── Close modals on overlay click ───────────
document.addEventListener('click', e => {
  if (e.target.id === 'record-modal') closeRecordModal();
  if (e.target.id === 'return-modal') closeReturnModal();
});

// ─── Auth UI helpers ──────────────────────────
function setAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) el.textContent = msg;
}

function clearAuthError() { setAuthError(''); }

function setAuthLoading(loading) {
  const btn = document.getElementById('auth-submit');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : (window._authMode === 'login' ? 'Sign In' : 'Create Account');
}

function switchAuthTab(mode) {
  window._authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-submit').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-confirm-wrap').style.display = mode === 'signup' ? 'flex' : 'none';
  // Only show forgot password on login tab
  const forgotWrap = document.getElementById('forgot-wrap');
  if (forgotWrap) forgotWrap.style.display = mode === 'login' ? 'block' : 'none';
  clearAuthError();
}

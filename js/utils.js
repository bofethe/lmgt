// ─────────────────────────────────────────────
// utils.js — Shared utility functions
// ─────────────────────────────────────────────

function getStatus(record) {
  if (record.returned_date) return 'returned';
  const now  = new Date();
  const due  = new Date(record.due_date + 'T00:00:00');
  const diff = (due - now) / (1000 * 60 * 60); // hours
  if (diff < 0)   return 'overdue';
  if (diff <= 24) return 'upcoming';
  return 'active';
}

function daysOverdue(record) {
  const due = new Date(record.due_date + 'T00:00:00');
  const now = new Date();
  return Math.max(0, Math.floor((now - due) / (1000 * 60 * 60 * 24)));
}

function hoursUntilDue(record) {
  const due = new Date(record.due_date + 'T00:00:00');
  return (due - new Date()) / (1000 * 60 * 60);
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initials(email) {
  return (email || '?').slice(0, 2).toUpperCase();
}

// ─── Toast ────────────────────────────────────
let _toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

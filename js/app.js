// ─────────────────────────────────────────────
// app.js — Main controller: auth, CRUD, orchestration
// ─────────────────────────────────────────────

window._records       = [];
window._currentFilter = 'all';
window._authMode      = 'login';
window._returningId   = null;
window._jwt           = null;   // live session JWT, passed to edge function

// ─── Bootstrap ────────────────────────────────
async function init() {
  await onAuthChange(async (session) => {
    if (session) {
      window._jwt = session.access_token;
      await enterApp(session.user);
    } else {
      window._jwt = null;
      showAuthWall();
    }
  });
}

// ─── Auth Wall ────────────────────────────────
function showAuthWall() {
  document.getElementById('auth-wall').style.display  = 'flex';
  document.getElementById('main-app').style.display   = 'none';
  window._authMode = 'login';
  switchAuthTab('login');
}

async function enterApp(user) {
  document.getElementById('auth-wall').style.display  = 'none';
  document.getElementById('main-app').style.display   = 'block';
  document.getElementById('user-avatar-initials').textContent = initials(user.email);
  document.getElementById('user-email-display').textContent   = user.email;
  await loadRecords();
}

// ─── Auth Actions ─────────────────────────────
async function handleAuthSubmit() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirm  = document.getElementById('auth-confirm').value;
  clearAuthError();

  if (!email || !password) { setAuthError('Please enter your email and password.'); return; }

  if (window._authMode === 'signup') {
    if (password !== confirm) { setAuthError('Passwords do not match.'); return; }
    if (password.length < 8)  { setAuthError('Password must be at least 8 characters.'); return; }
  }

  setAuthLoading(true);
  try {
    if (window._authMode === 'login') {
      await signIn(email, password);
    } else {
      await signUp(email, password);
      showToast('Account created! Check your email to confirm, then sign in.');
      switchAuthTab('login');
    }
  } catch (err) {
    setAuthError(err.message || 'Authentication failed.');
  } finally {
    setAuthLoading(false);
  }
}

async function handleSignOut() {
  try {
    await signOut();
    window._records = [];
    window._jwt = null;
    document.getElementById('user-dropdown').classList.remove('open');
    showToast('Signed out');
  } catch (err) {
    showToast('Sign out failed: ' + err.message);
  }
}

// ─── Password Reset ───────────────────────────
async function handleForgotPassword() {
  const email = document.getElementById('auth-email').value.trim();
  if (!email) {
    setAuthError('Enter your email address above, then click Forgot Password.');
    return;
  }
  setAuthLoading(true);
  try {
    await resetPassword(email);
    setAuthError('');
    showToast('Password reset email sent — check your inbox.');
  } catch (err) {
    setAuthError(err.message || 'Could not send reset email.');
  } finally {
    setAuthLoading(false);
  }
}

// ─── Load Records ─────────────────────────────
async function loadRecords() {
  const container = document.getElementById('records-list');
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading records…</span>
    </div>`;

  try {
    window._records = await dbFetchRecords();
    renderAll(window._records);
    setTimeout(() => checkAndSendNotifications(window._records, window._jwt), 1500);
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Could not load records: ${escHtml(err.message)}</p>
      </div>`;
  }
}

// ─── Add Record ───────────────────────────────
async function handleSaveRecord() {
  const lender    = document.getElementById('f-lender').value.trim();
  const recipient = document.getElementById('f-recipient').value.trim();
  const item      = document.getElementById('f-item').value.trim();
  const borrowed  = document.getElementById('f-borrowed').value;
  const due       = document.getElementById('f-due').value;
  const email     = document.getElementById('f-email').value.trim();
  const notes     = document.getElementById('f-notes').value.trim();

  if (!lender || !recipient || !item || !borrowed || !due || !email) {
    showToast('Please fill in all required fields');
    return;
  }

  const btn = document.getElementById('save-record-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const newRecord = await dbInsertRecord({
      lender_name:        lender,
      recipient_name:     recipient,
      item_name:          item,
      borrowed_date:      borrowed,
      due_date:           due,
      recipient_email:    email,
      notes:              notes || null,
      returned_date:      null,
      last_notif_24h:     null,
      last_notif_overdue: null,
    });
    window._records = [...window._records, newRecord];
    renderAll(window._records);
    closeRecordModal();
    showToast('Record added ✓');
  } catch (err) {
    showToast('Error saving record: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Record';
  }
}

// ─── Mark Returned ────────────────────────────
async function handleConfirmReturn() {
  const returnDate = document.getElementById('f-return-date').value;
  if (!returnDate) { showToast('Please select a return date'); return; }

  const btn = document.getElementById('confirm-return-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const updated = await dbUpdateRecord(window._returningId, { returned_date: returnDate });
    window._records = window._records.map(r => r.id === updated.id ? updated : r);
    renderAll(window._records);
    closeReturnModal();
    showToast('Marked as returned — reminders stopped ✓');
  } catch (err) {
    showToast('Error updating record: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Return';
  }
}

// ─── Delete Record ────────────────────────────
async function handleDelete(id) {
  if (!confirm('Delete this lending record? This cannot be undone.')) return;
  try {
    await dbDeleteRecord(id);
    window._records = window._records.filter(r => r.id !== id);
    renderAll(window._records);
    showToast('Record deleted');
  } catch (err) {
    showToast('Error deleting: ' + err.message);
  }
}

// ─── Start ────────────────────────────────────
init();

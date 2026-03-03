// ─────────────────────────────────────────────
// email.js — Reminder orchestration
//
// EmailJS keys are GONE from the browser entirely.
// This file:
//   1. Decides which records need a reminder today
//   2. Calls the Supabase Edge Function with the user's JWT
//   3. The Edge Function holds the keys server-side and sends via EmailJS
//
// There is NO email config panel needed in the UI anymore.
// ─────────────────────────────────────────────

// Derive the Edge Function URL from the Supabase project URL.
// e.g. https://abc.supabase.co → https://abc.functions.supabase.co/send-reminder
function getEdgeFunctionUrl() {
  return SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co') + '/send-reminder';
}

// Call the Edge Function for one record.
// The user's JWT is passed so the function can:
//   a) Verify the caller is authenticated
//   b) Use RLS to confirm the record belongs to them
async function sendReminder(recordId, type, jwt) {
  const res = await fetch(getEdgeFunctionUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({ record_id: recordId, type }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge function ${res.status}: ${text}`);
  }

  return await res.json(); // { sent: true } or { skipped: true, reason: "..." }
}

// Called on every app load. Loops active records and fires any due reminders.
// Duplicate-send prevention is in the Edge Function (last_notif_* date check),
// so calling this on every load is safe — it won't double-send on the same day.
async function checkAndSendNotifications(records, jwt) {
  if (!jwt) return;

  const active = records.filter(r => !r.returned_date);
  let sent = 0;

  for (const record of active) {
    const status = getStatus(record);
    if (status !== 'upcoming' && status !== 'overdue') continue;

    try {
      const result = await sendReminder(record.id, status === 'upcoming' ? 'upcoming' : 'overdue', jwt);
      if (result.sent) sent++;
    } catch (err) {
      // Non-fatal — log and continue to next record
      console.warn(`Reminder failed for "${record.item_name}":`, err.message);
    }
  }

  if (sent > 0) showToast(`📧 ${sent} reminder email${sent > 1 ? 's' : ''} sent`);
}

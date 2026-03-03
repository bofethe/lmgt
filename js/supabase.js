// ─────────────────────────────────────────────
// supabase.js — Supabase client init & auth helpers
// ─────────────────────────────────────────────
// IMPORTANT: Replace these two values with your own from the Supabase dashboard.
// Project Settings → API → Project URL and anon/public key.
// These are safe to expose in a public repo — Row Level Security enforces
// data isolation server-side. The anon key only allows what RLS permits.

const SUPABASE_URL  = 'https://prqzskydjxisohbmwibn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycXpza3lkanhpc29oYm13aWJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0ODI1NDgsImV4cCI6MjA4ODA1ODU0OH0.3Up84MjGvCnDs4pKHMvz1HFQ_BHUSh6fdXfPuImfld4';

// Lazy-load Supabase SDK from CDN and initialise client
let _sb = null;

async function getSupabase() {
  if (_sb) return _sb;

  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Failed to load Supabase SDK'));
      document.head.appendChild(s);
    });
  }

  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  return _sb;
}

// ─── Auth helpers ──────────────────────────────

async function signUp(email, password) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  const sb = await getSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

async function getSession() {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function onAuthChange(callback) {
  const sb = await getSupabase();
  sb.auth.onAuthStateChange((_event, session) => callback(session));
}

async function resetPassword(email) {
  const sb = await getSupabase();
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

// ─── Database helpers ──────────────────────────

async function dbFetchRecords() {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('lending_records')
    .select('*')
    .order('due_date', { ascending: true });
  if (error) throw error;
  return data ?? [];  // Supabase returns null for empty results, not []
}

async function dbInsertRecord(record) {
  const sb = await getSupabase();

  // Get the current user's ID to satisfy the RLS insert policy
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await sb
    .from('lending_records')
    .insert([{ ...record, user_id: user.id }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function dbUpdateRecord(id, updates) {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('lending_records')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function dbDeleteRecord(id) {
  const sb = await getSupabase();
  const { error } = await sb
    .from('lending_records')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

async function dbUpdateNotifLog(id, field, value) {
  // Updates just the notification tracking fields without touching other data
  return dbUpdateRecord(id, { [field]: value });
}

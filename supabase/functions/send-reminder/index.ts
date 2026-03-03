// supabase/functions/send-reminder/index.ts
// ─────────────────────────────────────────────────────────────────
// Supabase Edge Function — sends reminder emails via EmailJS.
// EmailJS credentials are stored as Supabase secret environment
// variables and are NEVER exposed to the browser.
//
// Deploy:
//   supabase functions deploy send-reminder --no-verify-jwt
//
// Set secrets (run once):
//   supabase secrets set EMAILJS_PUBLIC_KEY=your_key
//   supabase secrets set EMAILJS_SERVICE_ID=service_xxx
//   supabase secrets set EMAILJS_TEMPLATE_ID=template_xxx
// ─────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    // ── 1. Verify the caller is an authenticated app user ──────────
    // We create a Supabase client using the user's JWT from the
    // Authorization header. If the JWT is invalid, getUser() fails.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
    }

    // ── 2. Parse and validate request body ────────────────────────
    const body = await req.json();
    const { record_id, type } = body;

    if (!record_id || !["upcoming", "overdue"].includes(type)) {
      return new Response("Bad request: missing record_id or invalid type", {
        status: 400, headers: CORS_HEADERS
      });
    }

    // ── 3. Fetch the record — RLS ensures it belongs to this user ──
    const { data: record, error: fetchError } = await supabase
      .from("lending_records")
      .select("*")
      .eq("id", record_id)
      .single();

    if (fetchError || !record) {
      return new Response("Record not found", { status: 404, headers: CORS_HEADERS });
    }

    // ── 4. Prevent duplicate sends (same type, same day) ──────────
    const today = new Date().toISOString().slice(0, 10);
    const notifField = type === "upcoming" ? "last_notif_24h" : "last_notif_overdue";

    if (record[notifField] === today) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Already sent today" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── 5. Build template variables (data only — copy lives in template) ──
    const dueDate = new Date(record.due_date + "T00:00:00");
    const now = new Date();
    const daysLate = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000));
    const hoursLeft = Math.round((dueDate.getTime() - now.getTime()) / 3600000);

    const formattedDue = dueDate.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric"
    });

    const templateParams = {
      to_email:        record.recipient_email,
      recipient_name:  record.recipient_name,
      lender_name:     record.lender_name,
      item_name:       record.item_name,
      due_date:        formattedDue,
      reminder_type:   type,           // "upcoming" or "overdue"
      days_overdue:    daysLate,       // number — template decides how to phrase it
      hours_remaining: hoursLeft,      // number — template uses this for upcoming
      notes:           record.notes || "",
    };

    // ── 6. Send via EmailJS REST API ───────────────────────────────
    const ejsResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:   Deno.env.get("EMAILJS_SERVICE_ID"),
        template_id:  Deno.env.get("EMAILJS_TEMPLATE_ID"),
        user_id:      Deno.env.get("EMAILJS_PUBLIC_KEY"),
        template_params: templateParams,
      }),
    });

    if (!ejsResponse.ok) {
      const errText = await ejsResponse.text();
      console.error("EmailJS error:", errText);
      return new Response(
        JSON.stringify({ sent: false, error: "Email provider error" }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── 7. Record that we sent today so we don't double-send ───────
    await supabase
      .from("lending_records")
      .update({ [notifField]: today })
      .eq("id", record_id);

    return new Response(
      JSON.stringify({ sent: true }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Edge function error:", err);
    return new Response("Internal server error", { status: 500, headers: CORS_HEADERS });
  }
});

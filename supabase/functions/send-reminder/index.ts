// supabase/functions/send-reminder/index.ts
// ─────────────────────────────────────────────────────────────────
// Sends a single reminder email for one record via EmailJS.
//
// Called only by send-reminder-batch (server-to-server) using the
// service role key. No longer called from the browser.
//
// Deploy:
//   supabase functions deploy send-reminder --no-verify-jwt
//
// Secrets (shared with batch function):
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    // ── 1. Only accept calls from the batch function ───────────────
    // Batch function passes the service role key as the Bearer token.
    // Anything else is rejected.
    const authHeader = req.headers.get("Authorization") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response("Forbidden", { status: 403, headers: CORS_HEADERS });
    }

    // Admin client — bypasses RLS, safe because this is a trusted
    // server-to-server call from our own batch function
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    // ── 2. Validate request body ───────────────────────────────────
    const { record_id, type } = await req.json();

    if (!record_id || !["upcoming", "overdue"].includes(type)) {
      return new Response("Bad request", { status: 400, headers: CORS_HEADERS });
    }

    // ── 3. Fetch the record ────────────────────────────────────────
    const { data: record, error: fetchError } = await supabase
      .from("lending_records")
      .select("*")
      .eq("id", record_id)
      .single();

    if (fetchError || !record) {
      return new Response("Record not found", { status: 404, headers: CORS_HEADERS });
    }

    // ── 4. Duplicate-send guard ────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const notifField = type === "upcoming" ? "last_notif_24h" : "last_notif_overdue";

    if (record[notifField] === today) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Already sent today" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── 5. Build EmailJS payload ───────────────────────────────────
    const dueDate   = new Date(record.due_date + "T00:00:00");
    const now       = new Date();
    const daysLate  = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000));
    const hoursLeft = Math.round((dueDate.getTime() - now.getTime()) / 3600000);

    const formattedDue = dueDate.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

    const templateParams = {
      to_email:        record.recipient_email,
      recipient_name:  record.recipient_name,
      lender_name:     record.lender_name,
      item_name:       record.item_name,
      due_date:        formattedDue,
      reminder_type:   type,
      days_overdue:    daysLate,
      hours_remaining: hoursLeft,
      notes:           record.notes || "",
    };

    // ── 6. Send via EmailJS REST API ───────────────────────────────
    const ejsRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:      Deno.env.get("EMAILJS_SERVICE_ID"),
        template_id:     Deno.env.get("EMAILJS_TEMPLATE_ID"),
        user_id:         Deno.env.get("EMAILJS_PUBLIC_KEY"),
        template_params: templateParams,
      }),
    });

    if (!ejsRes.ok) {
      console.error("EmailJS error:", await ejsRes.text());
      return new Response(
        JSON.stringify({ sent: false, error: "Email provider error" }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── 7. Record send date to prevent duplicate sends ─────────────
    await supabase
      .from("lending_records")
      .update({ [notifField]: today })
      .eq("id", record_id);

    return new Response(
      JSON.stringify({ sent: true }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("send-reminder error:", err);
    return new Response("Internal server error", { status: 500, headers: CORS_HEADERS });
  }
});
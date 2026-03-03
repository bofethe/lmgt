// supabase/functions/send-reminder-batch/index.ts
// ─────────────────────────────────────────────────────────────────
// Scheduled batch job — runs daily via pg_cron.
// Queries ALL active lending records across all users, finds any
// that are due within 24 hours or overdue, and calls send-reminder
// for each one.
//
// Deploy:
//   supabase functions deploy send-reminder-batch --no-verify-jwt
//
// The pg_cron job that calls this is set up in Supabase SQL Editor
// (see README for the SQL). It passes the service role key so this
// function knows the call is legitimate.
//
// No additional secrets needed — shares the same EmailJS secrets
// already set on send-reminder.
// ─────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // ── 1. Verify this was called by pg_cron via service role key ──
    const authHeader   = req.headers.get("Authorization") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response("Forbidden", { status: 403 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    // ── 2. Fetch all active (not returned) lending records ─────────
    const { data: records, error } = await supabase
      .from("lending_records")
      .select("id, due_date, returned_date, last_notif_24h, last_notif_overdue")
      .is("returned_date", null);

    if (error) throw error;

    const now   = new Date();
    const today = now.toISOString().slice(0, 10);

    let sent    = 0;
    let skipped = 0;
    let errors  = 0;

    // ── 3. Loop records and send reminders where needed ────────────
    for (const record of records ?? []) {
      const dueDate     = new Date(record.due_date + "T00:00:00");
      const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Determine reminder type — skip if not yet within 24h window
      let type: string | null = null;

      if (hoursUntilDue < 0) {
        // Overdue — send daily until returned
        type = "overdue";
      } else if (hoursUntilDue <= 24) {
        // Due within 24 hours — send once
        type = "upcoming";
      } else {
        // Not due yet — skip entirely
        continue;
      }

      // Skip if already sent this type today
      const alreadySent = type === "upcoming"
        ? record.last_notif_24h    === today
        : record.last_notif_overdue === today;

      if (alreadySent) {
        skipped++;
        continue;
      }

      // ── 4. Call send-reminder for this record ──────────────────
      // send-reminder handles the actual EmailJS call and updates
      // the last_notif_* field on success
      try {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co")}/send-reminder`,
          {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ record_id: record.id, type }),
          }
        );

        const result = await res.json();

        if (result.sent)    sent++;
        if (result.skipped) skipped++;
        if (!res.ok && !result.skipped) errors++;

      } catch (sendErr) {
        console.error(`Failed to send reminder for record ${record.id}:`, sendErr);
        errors++;
      }
    }

    // ── 5. Return a summary (visible in Supabase Edge Function logs) ──
    const summary = {
      processed: (records ?? []).length,
      sent,
      skipped,
      errors,
      ran_at: now.toISOString(),
    };

    console.log("Batch complete:", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-reminder-batch error:", err);
    return new Response("Internal server error", { status: 500 });
  }
});

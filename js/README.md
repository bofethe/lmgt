# Let Me Get That — Lending Tracker

Track everything you lend. Automated email reminders for all users. Each user only sees their own records.

---

## File Structure

```
/
├── index.html                              ← App shell & HTML only
├── css/
│   ├── tokens.css                          ← Design tokens
│   ├── base.css                            ← Reset & element defaults
│   ├── layout.css                          ← Shell, header, stats, auth wall
│   └── components.css                      ← Buttons, cards, modals, toast
├── js/
│   ├── utils.js                            ← Shared helpers
│   ├── supabase.js                         ← DB client, auth & database calls
│   ├── email.js                            ← Calls edge function to send reminders
│   ├── ui.js                               ← All rendering & DOM interactions
│   └── app.js                              ← Main controller
└── supabase/
    └── functions/
        └── send-reminder/
            └── index.ts                    ← Edge Function (runs server-side)
```

---

## How email works (and why keys are split across two places)

```
Browser (js/email.js)                    Server (Edge Function)
─────────────────────                    ──────────────────────
Checks which records are due        →    Verifies JWT (real user?)
Calls Edge Function with JWT        →    Fetches record via RLS
Passes: record_id, type             →    Checks duplicate-send guard
                                    →    Sends via EmailJS REST API
                                    →    Updates last_notif_* date
```

**`js/email.js`** owns the *when* — looping records, checking status, deciding upcoming vs overdue.  
**`index.ts`** owns the *how* — formatting the data payload and calling EmailJS with secret credentials.  
**EmailJS template** owns the *copy* — all human-readable text, HTML formatting, subject line.

The EmailJS keys never touch the browser. Users get reminders automatically with zero configuration.

---

## Step 1 — Supabase Setup

### 1a. Create a free project at supabase.com

### 1b. Run this SQL in the SQL Editor

```sql
CREATE TABLE lending_records (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lender_name         TEXT NOT NULL,
  recipient_name      TEXT NOT NULL,
  item_name           TEXT NOT NULL,
  borrowed_date       DATE NOT NULL,
  due_date            DATE NOT NULL,
  recipient_email     TEXT NOT NULL,
  notes               TEXT,
  returned_date       DATE,
  last_notif_24h      TEXT,
  last_notif_overdue  TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lending_records_user ON lending_records(user_id);
ALTER TABLE lending_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own records"    ON lending_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own records" ON lending_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own records" ON lending_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own records" ON lending_records FOR DELETE USING (auth.uid() = user_id);
```

### 1c. Configure auth redirect URLs

Supabase → Authentication → URL Configuration:
- Site URL: `https://YOUR_USERNAME.github.io/lmgt`
- Redirect URLs: `https://YOUR_USERNAME.github.io/lmgt` (also needed for password reset emails)

### 1d. Update js/supabase.js

Replace the two placeholders at the top of the file with your Project URL and anon key.

---

## Step 2 — EmailJS Setup (you do this once, all users benefit)

1. Sign up at emailjs.com (free tier = 200 emails/month)
2. Email Services → Add New Service → Gmail → connect your dedicated send-only Gmail
3. Email Templates → Create New Template

**Template variables to use** (these are the raw data fields sent by the edge function):

| Variable | Value |
|---|---|
| `{{to_email}}` | Recipient's email |
| `{{recipient_name}}` | Borrower's name |
| `{{lender_name}}` | Lender's name |
| `{{item_name}}` | The item |
| `{{due_date}}` | Formatted due date |
| `{{reminder_type}}` | `"upcoming"` or `"overdue"` |
| `{{days_overdue}}` | Number (0 for upcoming) |
| `{{hours_remaining}}` | Number (negative if overdue) |
| `{{notes}}` | Optional notes |

**All wording lives in the template.** Example:

```
Subject: {% if reminder_type == "overdue" %}⚠️ Overdue{% else %}⏰ Due Tomorrow{% endif %} — {{item_name}}

Hi {{recipient_name}},

{{lender_name}} asked us to remind you about a borrowed item.

Item: {{item_name}}
Due: {{due_date}}

{% if reminder_type == "overdue" %}
This item is {{days_overdue}} day(s) overdue. Please return it as soon as possible.
{% else %}
This item is due back tomorrow. Please make arrangements to return it.
{% endif %}

{% if notes %}Note: {{notes}}{% endif %}
```

---

## Step 3 — Deploy the Edge Function

Install the Supabase CLI, then from the project root:

```bash
# Link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set your EmailJS secrets (never committed to git)
supabase secrets set EMAILJS_PUBLIC_KEY=your_public_key
supabase secrets set EMAILJS_SERVICE_ID=service_xxxxx
supabase secrets set EMAILJS_TEMPLATE_ID=template_xxxxx

# Deploy
supabase functions deploy send-reminder --no-verify-jwt
```

The `--no-verify-jwt` flag lets the function handle JWT verification itself (which it does — it checks the auth header and uses RLS). This is intentional.

---

## Step 4 — Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Let Me Get That v2"
git remote add origin https://github.com/YOUR_USERNAME/lmgt.git
git push -u origin main
```

Repo → Settings → Pages → Source: `main` / `/ (root)` → Save.

**Important:** Do NOT commit `supabase/functions/` if you have any secrets hardcoded. Secrets are set via `supabase secrets set` and never appear in code.

---

## Security Model

| What | How it's protected |
|---|---|
| User data isolation | Supabase RLS — enforced at DB level, not just in app code |
| EmailJS credentials | Supabase secret env vars — never in browser, never in git |
| Auth | Supabase Auth (bcrypt passwords, JWT sessions) |
| Anon key in browser | Safe — it's a scoped key; RLS prevents cross-user access |
| Password reset | Supabase sends reset email; redirect URL verified against allowlist |

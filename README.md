# Let Me Get That

Let Me Get That is a simple app to help you track items you lend out to others. It automatically notifies recipients via email when their loan period is up, so you never lose track of your stuff again.

---

## Features

- **Track all your loans:** Add, edit, and view items you've lent out, including recipient, due date, and notes.
- **Automated email reminders:** Recipients are notified when their lease time is up, so you don't have to chase them down.
- **Personal dashboard:** Each user only sees their own records—your data is private.
- **Free account required:** Secure authentication is required to access and manage your loans.

---

## How It Works

1. **Sign up for a free account** to access the app and database.
2. **Add a loaned item** with recipient details and due date.
3. The app tracks all your loans and automatically sends an email reminder to the recipient when the lease is up.
4. You can view, update, or mark items as returned at any time.

---

## Email Notification System

The app uses a secure, server-side function to send email reminders. Your authentication token is never shared with the recipient, and email credentials are kept safe on the server.

**How it works:**

1. The browser checks which records are due for notification.
2. It calls a secure Edge Function with your authentication token.
3. The server verifies your identity, fetches the correct record, and sends the email via EmailJS.
4. The server updates the notification status to prevent duplicate emails.

---

## Project Structure

```
index.html                # App shell
css/                      # Styles (tokens, base, layout, components)
js/                       # App logic, UI, database, email
supabase/functions/       # Serverless functions (email reminders)
```

---

## Authentication

A free account is required to use the app. All data is securely stored in a Supabase project, and only you can see your own records.

---

## License

MIT

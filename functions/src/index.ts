/**
 * Firebase Cloud Function: sendEmail
 *
 * HTTPS-callable function that accepts an email payload and delivers it via
 * the configured email provider.
 *
 * Current provider  : Mock (logs to console) — replace with SendGrid, Resend, etc.
 * Future provider   : Remove this function entirely and call Azure Communication
 *                     Services directly from the Next.js API route, or deploy an
 *                     equivalent Azure Function.
 *
 * Setup:
 *   cd functions && npm install && npm run build
 *   firebase deploy --only functions
 *
 * Environment variables (set via `firebase functions:config:set` or Secret Manager):
 *   SENDGRID_API_KEY   — SendGrid API key (when using SendGrid)
 *   EMAIL_FROM         — Sender address (e.g. "noreply@yourcompany.com")
 */

import * as functions from "firebase-functions";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
  fromUserId: string;
}

// ── Provider interface (mirrors lib/email/IEmailProvider.ts) ──────────────────

interface EmailProvider {
  send(payload: SendEmailPayload): Promise<void>;
}

// ── Mock provider ─────────────────────────────────────────────────────────────
// Replace with SendGridProvider, ResendProvider, etc. without changing sendEmail.

class MockEmailProvider implements EmailProvider {
  async send(payload: SendEmailPayload): Promise<void> {
    functions.logger.info("MockEmailProvider.send()", {
      to: payload.to,
      subject: payload.subject,
      fromUserId: payload.fromUserId,
    });
    // No actual delivery in POC phase.
  }
}

// ── Swap provider here when ready ─────────────────────────────────────────────
// Example:
//   import { SendGridProvider } from "./providers/sendGridProvider";
//   const provider: EmailProvider = new SendGridProvider(process.env.SENDGRID_API_KEY!);

const provider: EmailProvider = new MockEmailProvider();

// ── Cloud Function ────────────────────────────────────────────────────────────

export const sendEmail = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const { to, subject, body, fromUserId } = req.body as Partial<SendEmailPayload>;

  if (!to || !subject || !body || !fromUserId) {
    res.status(400).json({ error: "Missing required fields: to, subject, body, fromUserId." });
    return;
  }

  try {
    await provider.send({ to, subject, body, fromUserId });
    functions.logger.info("Email sent", { to, fromUserId });
    res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    functions.logger.error("Email send failed", { to, fromUserId, error: message });
    res.status(500).json({ error: message });
  }
});

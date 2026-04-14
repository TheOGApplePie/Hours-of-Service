import { NextRequest, NextResponse } from "next/server";
import { SendEmailInput } from "@/types/email";

/**
 * POST /api/send-email
 *
 * Thin pass-through between the client-side FirebaseEmailProvider and the
 * Firebase Cloud Function. This route validates the request then forwards
 * it to the Cloud Function URL configured via SEND_EMAIL_FUNCTION_URL.
 *
 * When SEND_EMAIL_FUNCTION_URL is not set (local dev / POC), the route
 * logs the payload and returns a mock success so the rest of the system
 * can be exercised without a deployed function.
 *
 * This route contains NO business logic — validation only.
 *
 * Environment variables:
 *   SEND_EMAIL_FUNCTION_URL  — HTTPS URL of the deployed sendEmail Cloud Function
 */

const FUNCTION_URL = process.env.SEND_EMAIL_FUNCTION_URL;

export async function POST(req: NextRequest) {
  // ── Parse ─────────────────────────────────────────────────────────────────
  let input: Partial<SendEmailInput>;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  const { to, subject, body, fromUserId } = input;

  if (!to || !subject || !body || !fromUserId) {
    return NextResponse.json(
      { error: "Missing required fields: to, subject, body, fromUserId." },
      { status: 400 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  // ── Forward to Cloud Function ─────────────────────────────────────────────
  if (FUNCTION_URL) {
    try {
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body, fromUserId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(
          {
            error:
              (data as { error?: string }).error ??
              `Cloud Function returned ${res.status}`,
          },
          { status: 502 },
        );
      }

      return NextResponse.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reach email service.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // ── Mock (no SEND_EMAIL_FUNCTION_URL configured) ──────────────────────────
  console.log("[send-email] MOCK — SEND_EMAIL_FUNCTION_URL not set");
  console.log(`  to:          ${to}`);
  console.log(`  subject:     ${subject}`);
  console.log(`  fromUserId:  ${fromUserId}`);
  console.log(`  body:\n${body}`);

  return NextResponse.json({ success: true, mock: true });
}

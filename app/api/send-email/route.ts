import { NextRequest, NextResponse } from "next/server";
import { SendEmailInput } from "@/types/email";
import { Resend } from "resend";
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

const resend = new Resend(process.env.RESEND_SEND_EMAILS!);
export async function POST(req: NextRequest) {
  // ── Parse ─────────────────────────────────────────────────────────────────
  let input: Partial<SendEmailInput>;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  const { to, subject, body, fromEmail } = input;

  if (!to || !subject || !body || !fromEmail) {
    return NextResponse.json(
      { error: "Missing required fields: to, subject, body, fromEmail." },
      { status: 400 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json(
      { error: "Invalid email address." },
      { status: 400 },
    );
  }

  // ── Forward to Cloud Function ─────────────────────────────────────────────
  try {
    const { data, error } = await resend.emails.send({
      // from: "onboarding@resend.dev",
      from: "info@applepiestudios.ca",
      replyTo: fromEmail,
      to: to,
      subject: subject,
      text: body,
    });
    if (error) {
      return Response.json({ error }, { status: 500 });
    }
    return new Response(JSON.stringify({ success: data }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }
}

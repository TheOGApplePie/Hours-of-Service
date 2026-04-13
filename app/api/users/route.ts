import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

/**
 * POST /api/users
 *
 * Creates a new Firebase Auth user and sends a password reset email so the
 * new user can set their own password on first login.
 *
 * Request body: { email: string }
 * Response:     { uid: string }
 */
export async function POST(req: NextRequest) {
  let email: string;

  try {
    const body = await req.json();
    email = body?.email?.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  try {
    const auth = adminAuth();

    // Create the Firebase Auth user with no password — the reset email will
    // let them set one themselves.
    const userRecord = await auth.createUser({ email });

    // Send a password reset / set-password email to the new user.
    const resetLink = await auth.generatePasswordResetLink(email);

    // Firebase's generatePasswordResetLink returns the link but does not send
    // the email itself when using the Admin SDK directly. We use sendEmailVerification
    // equivalent via the Admin SDK's email action link and rely on Firebase's
    // built-in email delivery by calling sendSignInLinkToEmail via a custom action.
    //
    // The simplest approach that uses Firebase's built-in email delivery is to
    // call the REST API with the generated link — but Firebase Admin does not
    // send the email automatically. Instead we invoke the Identity Toolkit REST
    // endpoint that Firebase client SDK uses under the hood.
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (apiKey) {
      await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestType: "PASSWORD_RESET",
            email,
          }),
        },
      );
    }

    // Suppress unused variable warning — link is generated to confirm the user
    // exists and is valid, but email delivery is handled by the REST call above.
    void resetLink;

    return NextResponse.json({ uid: userRecord.uid }, { status: 201 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create user.";

    // Return a 409 if the email is already in use
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "auth/email-already-exists"
    ) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

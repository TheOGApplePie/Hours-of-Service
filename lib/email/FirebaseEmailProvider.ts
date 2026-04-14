import { IEmailProvider } from "@/lib/email/IEmailProvider";
import { SendEmailInput } from "@/types/email";

/**
 * Email provider adapter for the Firebase POC phase.
 *
 * This class has one responsibility: call /api/send-email and surface errors.
 * It contains no business logic and no Firestore references.
 *
 * Migration path → Azure:
 *   Replace this class with AzureEmailProvider that calls
 *   Azure Communication Services or Microsoft Graph.
 *   The interface contract (IEmailProvider) stays the same.
 */
export class FirebaseEmailProvider implements IEmailProvider {
  async sendEmail(input: SendEmailInput): Promise<void> {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as { error?: string }).error ??
          `Email delivery failed with status ${res.status}`,
      );
    }
  }
}

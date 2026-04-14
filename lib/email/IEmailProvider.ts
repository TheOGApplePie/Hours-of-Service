import { SendEmailInput } from "@/types/email";

/**
 * Provider-agnostic email sending contract.
 *
 * Current implementation : FirebaseEmailProvider
 *                           → POST /api/send-email → Cloud Function (SendGrid placeholder)
 *
 * Future implementation   : AzureEmailProvider
 *                           → Azure Communication Services  or  Microsoft Graph API
 *
 * To swap providers: create a new class that implements this interface and
 * pass it wherever IEmailProvider is expected. No other code changes needed.
 */
export interface IEmailProvider {
  sendEmail(input: SendEmailInput): Promise<void>;
}

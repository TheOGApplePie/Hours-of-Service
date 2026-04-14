/**
 * Input shape for all email providers.
 * Provider-agnostic — no Firebase or Azure dependencies.
 */
export type SendEmailInput = {
  /** Recipient email address. */
  to: string;
  /** Email subject line. */
  subject: string;
  /** Plain-text body. */
  body: string;
  /** UID of the manager who triggered the send — used for audit records. */
  fromUserId: string;
};

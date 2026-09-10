/**
 * Transport-agnostic contract for every transactional email the API sends.
 *
 * Why a port: KoraLink must ship OTP + notification emails BEFORE it owns a
 * domain. Resend's `onboarding@resend.dev` sender is hard-locked to the
 * account owner's address, so a second adapter (Brevo verified-sender, no
 * domain needed) is selected via EMAIL_PROVIDER. When the production domain
 * lands, flipping back to Resend is an env change — zero code changes.
 */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSender {
  /**
   * Sends one transactional email.
   * @param to recipient address
   * @param subject subject line
   * @param html rendered HTML body
   * @param debugCode OPTIONAL OTP code — logged ONLY in no-key dev mode,
   *        NEVER when a real provider key is configured.
   */
  send(to: string, subject: string, html: string, debugCode?: string): Promise<void>;
}

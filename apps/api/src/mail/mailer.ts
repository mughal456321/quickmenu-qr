import { logger } from "../logger";

export interface PasswordResetEmail {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}

/**
 * D-4: email provider is not chosen yet. The API depends on this interface so a
 * real SMTP adapter can be added later without touching the auth service.
 */
export interface Mailer {
  sendPasswordReset(message: PasswordResetEmail): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    logger.info(
      {
        to: message.to,
        expiresInMinutes: message.expiresInMinutes,
        resetUrl: message.resetUrl,
      },
      "password reset email (console transport)"
    );
  }
}

let activeMailer: Mailer = new ConsoleMailer();

export function getMailer(): Mailer {
  return activeMailer;
}

/** Test/adapter hook. */
export function setMailer(mailer: Mailer): void {
  activeMailer = mailer;
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailConfig, OtpConfig } from '../config/configuration';
import { maskEmail } from '../common/contact/contact.util';

/**
 * Email delivery. In `console` mode (dev) it logs a masked line instead of
 * sending, so no real code is ever transmitted or fully written to logs.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly cfg: EmailConfig;
  private readonly ttlMinutes: number;
  private readonly resend?: Resend;

  constructor(config: ConfigService) {
    this.cfg = config.get<EmailConfig>('email')!;
    this.ttlMinutes = Math.round(
      config.get<OtpConfig>('otp')!.ttlSeconds / 60,
    );
    if (this.cfg.provider === 'resend' && this.cfg.resendApiKey) {
      this.resend = new Resend(this.cfg.resendApiKey);
    }
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    if (this.cfg.provider === 'console' || !this.resend) {
      this.logger.debug(
        `[console-email] verification code for ${maskEmail(to)} generated`,
      );
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.cfg.from,
      to,
      subject: 'Dein PortaGast Bestätigungscode',
      text: `Dein Bestätigungscode lautet: ${code}\n\nDer Code ist ${this.ttlMinutes} Minuten gültig. Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.`,
    });

    if (error) {
      // Do not include the code or full address in the thrown/logged error.
      this.logger.error(`Email delivery failed for ${maskEmail(to)}`);
      throw new Error('Email delivery failed');
    }
  }

  /** Sends a password-reset link. In `console` mode it only logs (masked). */
  async sendPasswordResetLink(to: string, resetUrl: string): Promise<void> {
    if (this.cfg.provider === 'console' || !this.resend) {
      // Never log the actual reset URL (it carries a single-use token).
      this.logger.debug(
        `[console-email] password-reset link for ${maskEmail(to)} generated`,
      );
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.cfg.from,
      to,
      subject: 'PortaGast — Passwort zurücksetzen',
      text: `Du hast das Zurücksetzen deines Passworts angefordert.\n\nÖffne diesen Link, um ein neues Passwort zu vergeben:\n${resetUrl}\n\nDer Link ist zeitlich begrenzt gültig und nur einmal verwendbar. Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.`,
    });

    if (error) {
      this.logger.error(`Password-reset email failed for ${maskEmail(to)}`);
      throw new Error('Email delivery failed');
    }
  }
}

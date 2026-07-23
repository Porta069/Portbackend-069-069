import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';
import { OtpConfig, SmsConfig } from '../config/configuration';
import { maskPhone } from '../common/contact/contact.util';

/**
 * SMS delivery. In `console` mode (dev) it logs a masked line instead of
 * sending. Production config forbids `console` (see env.validation.ts).
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly cfg: SmsConfig;
  private readonly ttlMinutes: number;
  private readonly client?: Twilio;

  constructor(config: ConfigService) {
    this.cfg = config.get<SmsConfig>('sms')!;
    this.ttlMinutes = Math.round(
      config.get<OtpConfig>('otp')!.ttlSeconds / 60,
    );
    if (
      this.cfg.provider === 'twilio' &&
      this.cfg.accountSid &&
      this.cfg.authToken
    ) {
      this.client = twilio(this.cfg.accountSid, this.cfg.authToken);
    }
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    if (this.cfg.provider === 'console' || !this.client) {
      this.logger.debug(
        `[console-sms] verification code for ${maskPhone(to)} generated`,
      );
      return;
    }

    try {
      await this.client.messages.create({
        to,
        from: this.cfg.fromNumber,
        body: `PortaGast Bestätigungscode: ${code} (${this.ttlMinutes} Min. gültig)`,
      });
    } catch {
      this.logger.error(`SMS delivery failed for ${maskPhone(to)}`);
      throw new Error('SMS delivery failed');
    }
  }
}

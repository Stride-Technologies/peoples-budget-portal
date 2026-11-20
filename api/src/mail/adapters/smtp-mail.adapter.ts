import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailAdapter, MailMessage } from '../mail-adapter.interface.js';

/**
 * SMTP mail adapter.
 * Sends real emails via a configured SMTP server.
 * Requires: MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, and either
 * MAIL_FROM or MAIL_FROM_ADDRESS.
 */
@Injectable()
export class SmtpMailAdapter implements MailAdapter {
  private transporter: import('nodemailer').Transporter | undefined;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const fromAddress = this.config.get<string>('MAIL_FROM_ADDRESS');
    const fromName = this.config.get<string>('MAIL_FROM_NAME');
    this.from =
      this.config.get<string>('MAIL_FROM') ??
      (fromName && fromAddress ? `${fromName} <${fromAddress}>` : undefined) ??
      this.config.getOrThrow<string>('MAIL_FROM_ADDRESS');
  }

  private async getTransporter(): Promise<import('nodemailer').Transporter> {
    if (!this.transporter) {
      const nodemailer = await import('nodemailer');
      this.transporter = nodemailer.createTransport({
        host: this.config.getOrThrow<string>('MAIL_HOST'),
        port: Number(this.config.getOrThrow<string>('MAIL_PORT')),
        auth: {
          user: this.config.getOrThrow<string>('MAIL_USER'),
          pass: this.config.getOrThrow<string>('MAIL_PASS'),
        },
      });
    }
    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_ADAPTER } from './mail-adapter.interface.js';
import type {
  MailAdapter,
  MailMessageMetadata,
} from './mail-adapter.interface.js';
import { getBrand } from '../common/brand.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

@Injectable()
export class MailService {
  private readonly subjectPrefix: string;

  constructor(
    @Inject(MAIL_ADAPTER) private readonly adapter: MailAdapter,
    private readonly config: ConfigService,
  ) {
    this.subjectPrefix = this.config.get<string>('MAIL_SUBJECT_PREFIX', '');
  }

  private applyPrefix(subject: string): string {
    return this.subjectPrefix ? `${this.subjectPrefix} ${subject}` : subject;
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    await this.adapter.send({
      to,
      subject: this.applyPrefix('Your verification code'),
      text: `Your verification code is: ${code}. It expires in 15 minutes.`,
      html: `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in 15 minutes.</p>`,
      type: 'verification-code',
      metadata: { code },
    });
  }

  async sendInvite(
    to: string,
    firstName: string,
    inviteUrl: string,
    account: Pick<
      MailMessageMetadata,
      'officeId' | 'civilSocietyOrganizationId' | 'role' | 'officeName'
    > = {},
  ): Promise<void> {
    const safeFirstName = escapeHtml(firstName);
    const safeInviteUrl = escapeHtml(inviteUrl);
    const role = account.role ?? 'Portal user';
    const officeName = account.officeName ?? 'Not assigned';
    const safeRole = escapeHtml(role);
    const safeOfficeName = escapeHtml(officeName);
    const { siteName, government } = getBrand();
    const safeSiteName = escapeHtml(siteName);
    const help = `If you did not expect this message, no action is required. For assistance, contact the portal's administrator at the ${government}.`;

    await this.adapter.send({
      to,
      subject: this.applyPrefix(`Invitation to the ${siteName}`),
      text: [
        `Dear ${firstName},`,
        '',
        `You have been invited to access the ${siteName}.`,
        '',
        'Account details:',
        `Role: ${role}`,
        `Office/Organization: ${officeName}`,
        '',
        'Please use the link below to set your password and activate your account:',
        inviteUrl,
        '',
        'This invitation expires in 48 hours. If it expires, ask your office or organization head or the system administrator to send a new invitation.',
        '',
        help,
      ].join('\n'),
      html: [
        `<p>Dear <strong>${safeFirstName}</strong>,</p>`,
        `<p>You have been invited to access the <strong>${safeSiteName}</strong>.</p>`,
        '<p><strong>Account details</strong><br>',
        `Role: ${safeRole}<br>`,
        `Office/Organization: ${safeOfficeName}</p>`,
        `<p><a href="${safeInviteUrl}" style="display:inline-block;padding:10px 20px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:4px;">Set your password</a></p>`,
        `<p>If the button does not work, copy and paste this link into your browser:<br><a href="${safeInviteUrl}">${safeInviteUrl}</a></p>`,
        '<p>This invitation expires in 48 hours. If it expires, ask your office or organization head or the system administrator to send a new invitation.</p>',
        `<p>${escapeHtml(help)}</p>`,
      ].join(''),
      type: 'invite',
      metadata: { ...account, inviteUrl },
    });
  }

  async sendPasswordReset(
    to: string,
    firstName: string,
    resetUrl: string,
  ): Promise<void> {
    const { siteName } = getBrand();
    await this.adapter.send({
      to,
      subject: this.applyPrefix(`Reset your ${siteName} password`),
      text: `Hi ${firstName},\n\nWe received a request to reset your password. Click the link below to choose a new one. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request a password reset, you can ignore this email.`,
      html: `<p>Hi <strong>${escapeHtml(firstName)}</strong>,</p><p>We received a request to reset your ${escapeHtml(siteName)} password. Click the button below to choose a new one. This link expires in 1 hour.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:10px 20px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:4px;">Reset password</a></p><p>If the button does not work, copy and paste this link into your browser:<br><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p><p>If you did not request a password reset, you can ignore this email.</p>`,
      type: 'password-reset',
      metadata: { resetUrl },
    });
  }
}

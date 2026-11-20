export type MailMessageType =
  | 'generic'
  | 'invite'
  | 'password-reset'
  | 'verification-code';

export interface MailMessageMetadata {
  officeId?: string | null;
  civilSocietyOrganizationId?: string | null;
  role?: string | null;
  officeName?: string | null;
  inviteUrl?: string;
  resetUrl?: string;
  code?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  type?: MailMessageType;
  metadata?: MailMessageMetadata;
}

export interface MailAdapter {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_ADAPTER = Symbol('MAIL_ADAPTER');

import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import type { MailMessage, MailMessageType } from './mail-adapter.interface.js';

export interface DevMailOutboxItem {
  id: string;
  to: string;
  subject: string;
  timestamp: string;
  messageType: MailMessageType;
  copyValue: string | null;
  officeId: string | null;
  civilSocietyOrganizationId: string | null;
}

@Injectable()
export class DevMailOutboxService {
  private readonly maxMessages = 100;
  private readonly ttlMs = 24 * 60 * 60 * 1_000;
  private items: DevMailOutboxItem[] = [];

  capture(message: MailMessage): void {
    this.prune();

    this.items.unshift({
      id: crypto.randomUUID(),
      to: message.to,
      subject: message.subject,
      timestamp: new Date().toISOString(),
      messageType: message.type ?? 'generic',
      copyValue: this.copyValueFor(message),
      officeId: message.metadata?.officeId ?? null,
      civilSocietyOrganizationId:
        message.metadata?.civilSocietyOrganizationId ?? null,
    });

    this.prune();
  }

  listFor(user: JwtPayload): DevMailOutboxItem[] {
    this.prune();

    if (user.role === 'SUPER_ADMIN') return [...this.items];

    if (user.role === 'HEAD') {
      return this.items.filter((item) => {
        if (item.messageType !== 'invite') return false;

        const sameOffice =
          user.officeId !== null && item.officeId === user.officeId;
        const sameOrg =
          user.civilSocietyOrganizationId !== null &&
          item.civilSocietyOrganizationId === user.civilSocietyOrganizationId;

        return sameOffice || sameOrg;
      });
    }

    return [];
  }

  private prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    this.items = this.items
      .filter((item) => new Date(item.timestamp).getTime() >= cutoff)
      .slice(0, this.maxMessages);
  }

  private copyValueFor(message: MailMessage): string | null {
    return (
      message.metadata?.inviteUrl ??
      message.metadata?.resetUrl ??
      message.metadata?.code ??
      null
    );
  }
}

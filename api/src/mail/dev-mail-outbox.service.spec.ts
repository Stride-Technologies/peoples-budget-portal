import type { JwtPayload } from '../auth/decorators/current-user.decorator.js';
import { DevMailOutboxService } from './dev-mail-outbox.service.js';

const superAdmin: JwtPayload = {
  sub: 'admin',
  role: 'SUPER_ADMIN',
  email: 'admin@example.gov.ph',
  firstName: 'Admin',
  lastName: 'User',
  identityType: null,
  officeId: null,
  civilSocietyOrganizationId: null,
};

const officeHead: JwtPayload = {
  sub: 'head',
  role: 'HEAD',
  email: 'head@example.gov.ph',
  firstName: 'Head',
  lastName: 'User',
  identityType: 'LGU',
  officeId: 'office-1',
  civilSocietyOrganizationId: null,
};

describe('DevMailOutboxService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps only the latest 100 messages', () => {
    jest.useFakeTimers({ now: new Date('2026-06-01T00:00:00.000Z') });
    const outbox = new DevMailOutboxService();

    for (let i = 0; i < 101; i += 1) {
      jest.setSystemTime(new Date(Date.UTC(2026, 5, 1, 0, 0, i)));
      outbox.capture({
        to: `user-${i}@example.test`,
        subject: `Subject ${i}`,
        text: 'text',
        html: '<p>html</p>',
      });
    }

    const items = outbox.listFor(superAdmin);
    expect(items).toHaveLength(100);
    expect(items[0].to).toBe('user-100@example.test');
    expect(items[99].to).toBe('user-1@example.test');
  });

  it('expires messages after 24 hours', () => {
    jest.useFakeTimers({ now: new Date('2026-06-01T00:00:00.000Z') });
    const outbox = new DevMailOutboxService();

    outbox.capture({
      to: 'old@example.test',
      subject: 'Old',
      text: 'text',
      html: '<p>html</p>',
    });

    jest.setSystemTime(new Date('2026-06-02T00:00:01.000Z'));
    outbox.capture({
      to: 'new@example.test',
      subject: 'New',
      text: 'text',
      html: '<p>html</p>',
    });

    expect(outbox.listFor(superAdmin).map((item) => item.to)).toEqual([
      'new@example.test',
    ]);
  });

  it('filters HEAD visibility to scoped invite messages', () => {
    const outbox = new DevMailOutboxService();

    outbox.capture({
      to: 'own-invite@example.test',
      subject: 'Invite',
      text: 'text',
      html: '<p>html</p>',
      type: 'invite',
      metadata: { officeId: 'office-1', inviteUrl: 'https://invite.test' },
    });
    outbox.capture({
      to: 'other-invite@example.test',
      subject: 'Invite',
      text: 'text',
      html: '<p>html</p>',
      type: 'invite',
      metadata: { officeId: 'office-2', inviteUrl: 'https://invite.test' },
    });
    outbox.capture({
      to: 'code@example.test',
      subject: 'Code',
      text: 'text',
      html: '<p>html</p>',
      type: 'verification-code',
      metadata: { code: '000000' },
    });

    expect(outbox.listFor(officeHead).map((item) => item.to)).toEqual([
      'own-invite@example.test',
    ]);
    expect(outbox.listFor(superAdmin)).toHaveLength(3);
  });
});

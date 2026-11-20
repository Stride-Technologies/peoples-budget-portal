import { redirect } from 'next/navigation';
import {
  LogIn,
  ShieldAlert,
  KeyRound,
  MailQuestion,
  RotateCcwKey,
  UserCog,
  UserRoundCog,
  Building2,
  Power,
  PowerOff,
  Activity as ActivityIcon,
} from 'lucide-react';
import { getSession } from '@/lib/session';
import { apiGetMyAuditLogs } from '@/lib/api';
import type { UserAuditAction, UserAuditLogRecord } from '@/lib/api';

const ACTION_META: Record<
  UserAuditAction,
  { label: string; icon: React.ElementType; tone: string }
> = {
  LOGIN: { label: 'Signed in', icon: LogIn, tone: 'text-emerald-600 bg-emerald-50' },
  LOGIN_FAILED: {
    label: 'Failed sign-in',
    icon: ShieldAlert,
    tone: 'text-red-600 bg-red-50',
  },
  PASSWORD_CHANGED: {
    label: 'Password changed',
    icon: KeyRound,
    tone: 'text-blue-600 bg-blue-50',
  },
  PASSWORD_RESET_REQUESTED: {
    label: 'Reset link requested',
    icon: MailQuestion,
    tone: 'text-amber-600 bg-amber-50',
  },
  PASSWORD_RESET: {
    label: 'Password reset',
    icon: RotateCcwKey,
    tone: 'text-blue-600 bg-blue-50',
  },
  PROFILE_UPDATED: {
    label: 'Profile updated',
    icon: UserCog,
    tone: 'text-neutral-600 bg-neutral-100',
  },
  ROLE_CHANGED: {
    label: 'Role changed',
    icon: UserRoundCog,
    tone: 'text-purple-600 bg-purple-50',
  },
  OFFICE_CHANGED: {
    label: 'Office changed',
    icon: Building2,
    tone: 'text-purple-600 bg-purple-50',
  },
  ACTIVATED: { label: 'Activated', icon: Power, tone: 'text-emerald-600 bg-emerald-50' },
  DEACTIVATED: {
    label: 'Deactivated',
    icon: PowerOff,
    tone: 'text-red-600 bg-red-50',
  },
};

const dateFmt = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function ActivityRow({ log }: { log: UserAuditLogRecord }) {
  const meta = ACTION_META[log.action] ?? {
    label: log.action,
    icon: ActivityIcon,
    tone: 'text-neutral-600 bg-neutral-100',
  };
  const Icon = meta.icon;
  const actorName = `${log.actor.firstName} ${log.actor.lastName}`.trim();

  return (
    <li className="flex gap-3 py-3.5">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-sm font-medium text-neutral-900">{meta.label}</p>
          <time className="text-xs text-neutral-400" dateTime={log.createdAt}>
            {dateFmt.format(new Date(log.createdAt))}
          </time>
        </div>
        <p className="mt-0.5 text-sm text-neutral-600">{log.summary}</p>
        <p className="mt-0.5 text-xs text-neutral-400">by {actorName}</p>
      </div>
    </li>
  );
}

export default async function ActivityPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const logs = await apiGetMyAuditLogs(session.accessToken);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Activity
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Recent sign-ins, password changes, and account changes made to your
          account.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <ActivityIcon className="mx-auto h-6 w-6 text-neutral-300" />
          <p className="mt-2 text-sm text-neutral-500">No activity yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white px-4">
          <ul className="divide-y divide-neutral-100">
            {logs.map((log) => (
              <ActivityRow key={log.id} log={log} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

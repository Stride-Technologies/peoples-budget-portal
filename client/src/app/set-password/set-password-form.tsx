'use client';

import { useActionState, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { setPasswordAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { InvitePreview } from '@/lib/api';
import { Seal } from '@/components/brand/seal';

function formatRole(role: string) {
  return role
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function SetPasswordForm({
  token,
  invite,
}: Readonly<{
  token: string;
  invite: InvitePreview;
}>) {
  const [state, action, pending] = useActionState(setPasswordAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <Seal size={48} className="mx-auto mb-4 h-12 w-12" />
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Set your password
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Create a password to activate your account.
        </p>
      </div>

      <div className="mb-5 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <p className="font-medium text-neutral-900">
          {invite.firstName} {invite.lastName}
        </p>
        <p className="mt-0.5 text-neutral-500">{invite.email}</p>
        <div className="mt-3 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 text-neutral-600">
          <span className="text-neutral-500">Role</span>
          <span>{formatRole(invite.role)}</span>
          <span className="text-neutral-500">Office</span>
          <span>{invite.officeName ?? 'Not assigned'}</span>
        </div>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="token" value={token} />

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-neutral-700">
            Password
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              className="pr-10"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-neutral-700 focus-visible:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-neutral-700">
            Confirm password
          </label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirm ? 'text' : 'password'}
              placeholder="Repeat your password"
              autoComplete="new-password"
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-neutral-700 focus-visible:outline-none"
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <Button type="submit" className="w-full h-11" disabled={pending}>
          {pending ? 'Activating...' : 'Activate account'}
        </Button>
      </form>
    </div>
  );
}

'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { verifyEmailAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Seal } from '@/components/brand/seal';

export default function VerifyEmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(verifyEmailAction, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Seal size={48} className="mx-auto mb-4 h-12 w-12" />
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Check your email
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-neutral-700">{email}</span>
          </p>
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="email" value={email} />

          <div className="space-y-1.5">
            <label htmlFor="code" className="text-sm font-medium text-neutral-700">
              Verification code
            </label>
            <Input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </div>

          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <Button type="submit" className="w-full h-11" disabled={pending}>
            {pending ? 'Verifying…' : 'Verify'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-500">
          Wrong email?{' '}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">
            Go back
          </Link>
        </p>
      </div>
    </div>
  );
}

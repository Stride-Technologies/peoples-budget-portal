'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { forgotPasswordAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Seal } from '@/components/brand/seal';

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    forgotPasswordAction,
    undefined,
  );

  const sent = state && 'success' in state;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <Seal size={48} className="mx-auto mb-4 h-12 w-12" />
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Forgot password
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      {sent ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
          <MailCheck className="mx-auto h-6 w-6 text-emerald-600" />
          <p className="mt-2 text-sm text-emerald-800">{state.success}</p>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-sm font-medium text-neutral-700"
            >
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.gov.ph"
              autoComplete="email"
              required
            />
          </div>

          {state && 'error' in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}

      <Link
        href="/login"
        className="mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </Link>
    </div>
  );
}

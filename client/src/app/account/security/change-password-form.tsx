'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { changePasswordAction } from '../_actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type AccountState = { success: string } | { error: string } | undefined;

function PasswordField({
  id,
  label,
  autoComplete,
  minLength,
}: {
  id: string;
  label: string;
  autoComplete: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-neutral-700">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="pr-10"
          minLength={minLength}
          required
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-neutral-700 focus-visible:outline-none"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(
    changePasswordAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const lastHandled = useRef<AccountState>(undefined);

  useEffect(() => {
    if (state === lastHandled.current) return;
    lastHandled.current = state;
    if (state && 'success' in state) {
      toast.success(state.success);
      formRef.current?.reset();
    }
    if (state && 'error' in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} ref={formRef}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PasswordField
            id="currentPassword"
            label="Current password"
            autoComplete="current-password"
          />
          <PasswordField
            id="newPassword"
            label="New password"
            autoComplete="new-password"
            minLength={8}
          />
          <PasswordField
            id="confirmPassword"
            label="Confirm new password"
            autoComplete="new-password"
            minLength={8}
          />
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Updating…' : 'Update password'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { updateProfileAction } from '../_actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { MyProfile } from '@/lib/api';

function formatRole(role: string) {
  return role
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ProfileForm({ profile }: { profile: MyProfile }) {
  const [state, action, pending] = useActionState(updateProfileAction, undefined);
  // Seeded from props; the parent remounts this form (via `key`) when the
  // server returns a fresh profile, so no setState-in-effect resync is needed.
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const lastHandled = useRef<AccountState>(undefined);

  useEffect(() => {
    if (state === lastHandled.current) return;
    lastHandled.current = state;
    if (state && 'success' in state) toast.success(state.success);
    if (state && 'error' in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="firstName"
                className="text-sm font-medium text-neutral-700"
              >
                First name
              </label>
              <Input
                id="firstName"
                name="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="lastName"
                className="text-sm font-medium text-neutral-700"
              >
                Last name
              </label>
              <Input
                id="lastName"
                name="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </div>
          </div>

          <div className="grid gap-x-4 gap-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm sm:grid-cols-[120px_1fr]">
            <span className="text-neutral-500">Email</span>
            <span className="text-neutral-900">{profile.email}</span>
            <span className="text-neutral-500">Role</span>
            <span className="text-neutral-900">{formatRole(profile.role)}</span>
            <span className="text-neutral-500">Office</span>
            <span className="text-neutral-900">
              {profile.officeName ?? 'Not assigned'}
            </span>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

type AccountState = { success: string } | { error: string } | undefined;

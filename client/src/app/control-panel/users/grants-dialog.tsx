'use client';

import { useEffect, useState, useTransition } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AccessFields, {
  type AccessValue,
} from '@/components/control-panel/access-fields';
import type { ClusterRecord, PermissionCatalog, UserRecord } from '@/lib/api';
import { getPermissionCatalog, getUserGrants, updateUserGrants } from './_actions';

interface GrantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent keys this component by user.id, so state initialises per user. */
  user: UserRecord;
  clusters: ClusterRecord[];
}

/**
 * Screens 9 + 10 of the Phase 1 mockups, in one dialog because they save
 * together: a permission without office scope grants nothing, and scope without
 * a permission grants nothing either.
 *
 * Both dimensions are replace-set — what the boxes show is what gets sent.
 */
export default function GrantsDialog({
  open,
  onOpenChange,
  user,
  clusters,
}: Readonly<GrantsDialogProps>) {
  /**
   * SUPER_ADMIN bypasses every permission check in the API guard, so the account
   * holds no grant rows at all. Rendering that literally showed every box
   * unticked for someone who can do everything — the opposite of the truth.
   */
  const bypassesChecks = user.role === 'SUPER_ADMIN';

  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [access, setAccess] = useState<AccessValue>({
    permissions: new Set(),
    allOffices: false,
    officeIds: new Set(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  // External system → effect. Loads once per mounted instance.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getPermissionCatalog(), getUserGrants(user.id)])
      .then(([cat, grants]) => {
        if (cancelled) return;
        if (cat.error || grants.error) {
          setError(cat.error ?? grants.error ?? 'Failed to load.');
          return;
        }
        setCatalog(cat.catalog ?? null);
        setAccess({
          permissions: new Set(grants.grants?.permissions ?? []),
          allOffices: grants.grants?.allOfficesScope ?? false,
          officeIds: new Set(grants.grants?.officeIds ?? []),
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateUserGrants(user.id, {
        permissions: [...access.permissions],
        allOfficesScope: access.allOffices,
        officeIds: [...access.officeIds],
      });
      if (res.error) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Permissions &amp; office scope — {user.firstName} {user.lastName}
          </DialogTitle>
          <DialogDescription>
            What this person can do, and whose AIP records they can do it to.
            Both must allow an action for it to succeed.
          </DialogDescription>
        </DialogHeader>

        {bypassesChecks && (
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-medium">
                Super Admins bypass permission and office-scope checks.
              </span>{' '}
              This account can already do everything, on every office, so there
              is nothing to grant. Change the role to Staff or Head first if you
              need to scope it.
            </p>
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Loading…
          </p>
        ) : (
          // The dialog scrolls itself now; a nested scroll region here just
          // trapped the wheel over the access list.
          <AccessFields
            catalog={catalog}
            clusters={clusters}
            value={access}
            onChange={setAccess}
            bypassed={bypassesChecks}
          />
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}
        {saved && !error && (
          <p className="text-sm text-emerald-600">Grants saved.</p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={isPending || loading || bypassesChecks}
            title={
              bypassesChecks
                ? 'Super Admins bypass these checks — nothing to save'
                : undefined
            }
          >
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useActionState, useState, useTransition } from 'react';
import { Plus, Pencil, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { PapSectorRecord } from '@/lib/api';
import {
  createPapSector,
  updatePapSector,
  deactivatePapSector,
  restorePapSector,
  type ActionState,
} from './_actions';

function PapSectorForm({
  sector,
  formAction,
  isPending,
  state,
}: {
  sector?: PapSectorRecord;
  formAction: (payload: FormData) => void;
  isPending: boolean;
  state: ActionState;
}) {
  return (
    <form action={formAction} className="space-y-4">
      {!sector && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="ps-code">
            Code
          </label>
          <Input id="ps-code" name="code" placeholder="e.g. 1000" required />
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="ps-name">
          Name
        </label>
        <Input id="ps-name" name="name" defaultValue={sector?.name} required />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="ps-sub">
          Subsector code{' '}
          <span className="text-neutral-400 font-normal">(optional)</span>
        </label>
        <Input
          id="ps-sub"
          name="subsectorCode"
          defaultValue={sector?.subsectorCode ?? ''}
        />
      </div>
      {state && 'error' in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : sector ? 'Save changes' : 'Add sector'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function PapSectorList({
  sectors,
}: {
  sectors: PapSectorRecord[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PapSectorRecord | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createAction, isCreating] = useActionState<
    ActionState,
    FormData
  >(async (prev, fd) => {
    const result = await createPapSector(prev, fd);
    if (result && 'success' in result) setCreating(false);
    return result;
  }, undefined);

  const [editState, editAction, isEditing] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      if (!editing) return prev;
      const result = await updatePapSector(editing.id, prev, fd);
      if (result && 'success' in result) setEditing(null);
      return result;
    },
    undefined,
  );

  function toggleActive(id: string, currentlyActive: boolean) {
    setPendingId(id);
    startTransition(async () => {
      if (currentlyActive) await deactivatePapSector(id);
      else await restorePapSector(id);
      setPendingId(null);
    });
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" />
          Add sector
        </Button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell w-28">Subsector</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sectors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-neutral-400">
                  No PAP sectors found.
                </TableCell>
              </TableRow>
            ) : (
              sectors.map((s) => (
                <TableRow key={s.id} className={cn(!s.isActive && 'opacity-50')}>
                  <TableCell className="font-mono text-sm font-medium">
                    {s.code}
                  </TableCell>
                  <TableCell className="text-neutral-900">{s.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-neutral-500">
                    {s.subsectorCode ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.isActive ? 'default' : 'secondary'}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setEditing(s)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={pendingId === s.id}
                        onClick={() => toggleActive(s.id, s.isActive)}
                      >
                        {s.isActive ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            Restore
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add PAP Sector</DialogTitle>
          </DialogHeader>
          <PapSectorForm
            formAction={createAction}
            isPending={isCreating}
            state={createState}
          />
        </DialogContent>
      </Dialog>

      {editing && (
        <Dialog
          open={!!editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit PAP Sector — {editing.code}</DialogTitle>
            </DialogHeader>
            <PapSectorForm
              key={editing.id}
              sector={editing}
              formAction={editAction}
              isPending={isEditing}
              state={editState}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

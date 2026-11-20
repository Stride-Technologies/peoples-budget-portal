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
import type { SglgIndicatorRecord } from '@/lib/api';
import {
  createSglgIndicator,
  updateSglgIndicator,
  deactivateSglgIndicator,
  restoreSglgIndicator,
  type ActionState,
} from './_actions';

function SglgForm({
  indicator,
  formAction,
  isPending,
  state,
}: {
  indicator?: SglgIndicatorRecord;
  formAction: (payload: FormData) => void;
  isPending: boolean;
  state: ActionState;
}) {
  return (
    <form action={formAction} className="space-y-4">
      {!indicator && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="sglg-code">
            Code
          </label>
          <Input
            id="sglg-code"
            name="code"
            placeholder="e.g. FA_01"
            required
          />
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="sglg-pillar">
          Pillar
        </label>
        <Input
          id="sglg-pillar"
          name="pillar"
          defaultValue={indicator?.pillar}
          placeholder="e.g. Financial Administration"
          required
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="sglg-name">
          Name
        </label>
        <Input
          id="sglg-name"
          name="name"
          defaultValue={indicator?.name}
          required
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="sglg-year">
          DILG year
        </label>
        <Input
          id="sglg-year"
          name="dilgYear"
          type="number"
          min={2000}
          defaultValue={indicator?.dilgYear ?? new Date().getFullYear()}
          required
        />
      </div>
      {state && 'error' in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : indicator ? 'Save changes' : 'Add indicator'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function SglgIndicatorList({
  indicators,
}: {
  indicators: SglgIndicatorRecord[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SglgIndicatorRecord | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createAction, isCreating] = useActionState<
    ActionState,
    FormData
  >(async (prev, fd) => {
    const result = await createSglgIndicator(prev, fd);
    if (result && 'success' in result) setCreating(false);
    return result;
  }, undefined);

  const [editState, editAction, isEditing] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      if (!editing) return prev;
      const result = await updateSglgIndicator(editing.id, prev, fd);
      if (result && 'success' in result) setEditing(null);
      return result;
    },
    undefined,
  );

  function toggleActive(id: string, currentlyActive: boolean) {
    setPendingId(id);
    startTransition(async () => {
      if (currentlyActive) await deactivateSglgIndicator(id);
      else await restoreSglgIndicator(id);
      setPendingId(null);
    });
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" />
          Add indicator
        </Button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Code</TableHead>
              <TableHead className="hidden md:table-cell">Pillar</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-16">Year</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {indicators.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-neutral-400">
                  No SGLG indicators found.
                </TableCell>
              </TableRow>
            ) : (
              indicators.map((i) => (
                <TableRow key={i.id} className={cn(!i.isActive && 'opacity-50')}>
                  <TableCell className="font-mono text-xs font-medium text-neutral-700">
                    {i.code}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-neutral-500">
                    {i.pillar}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-900">{i.name}</TableCell>
                  <TableCell className="text-sm text-neutral-500">
                    {i.dilgYear}
                  </TableCell>
                  <TableCell>
                    <Badge variant={i.isActive ? 'default' : 'secondary'}>
                      {i.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setEditing(i)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={pendingId === i.id}
                        onClick={() => toggleActive(i.id, i.isActive)}
                      >
                        {i.isActive ? (
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
            <DialogTitle>Add SGLG Indicator</DialogTitle>
          </DialogHeader>
          <SglgForm
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
              <DialogTitle>Edit SGLG Indicator — {editing.code}</DialogTitle>
            </DialogHeader>
            <SglgForm
              key={editing.id}
              indicator={editing}
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

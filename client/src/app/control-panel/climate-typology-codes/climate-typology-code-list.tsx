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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ClimateTypologyCodeRecord } from '@/lib/api';
import {
  createClimateTypologyCode,
  updateClimateTypologyCode,
  deactivateClimateTypologyCode,
  restoreClimateTypologyCode,
  type ActionState,
} from './_actions';

const PILLARS = [
  { value: 'ADAPTATION', label: 'Adaptation' },
  { value: 'MITIGATION', label: 'Mitigation' },
  { value: 'CROSSCUTTING', label: 'Crosscutting' },
] as const;

const PILLAR_COLORS: Record<string, string> = {
  ADAPTATION: 'bg-teal-50 text-teal-700 border-teal-200',
  MITIGATION: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CROSSCUTTING: 'bg-blue-50 text-blue-700 border-blue-200',
};

function ClimateCodeForm({
  code,
  formAction,
  isPending,
  state,
}: {
  code?: ClimateTypologyCodeRecord;
  formAction: (payload: FormData) => void;
  isPending: boolean;
  state: ActionState;
}) {
  const [pillar, setPillar] = useState<string>(code?.pillar ?? 'ADAPTATION');

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="pillar" value={pillar} />
      {!code && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="cc-code">
            Code
          </label>
          <Input
            id="cc-code"
            name="code"
            placeholder="e.g. CCA_001"
            required
          />
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700">Pillar</label>
        <Select value={pillar} onValueChange={(v) => setPillar(v ?? '')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PILLARS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="cc-name">
          Name
        </label>
        <Input id="cc-name" name="name" defaultValue={code?.name} required />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="cc-desc">
          Description{' '}
          <span className="text-neutral-400 font-normal">(optional)</span>
        </label>
        <Input
          id="cc-desc"
          name="description"
          defaultValue={code?.description ?? ''}
        />
      </div>
      {state && 'error' in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : code ? 'Save changes' : 'Add code'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function ClimateTypologyCodeList({
  codes,
}: {
  codes: ClimateTypologyCodeRecord[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ClimateTypologyCodeRecord | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createAction, isCreating] = useActionState<
    ActionState,
    FormData
  >(async (prev, fd) => {
    const result = await createClimateTypologyCode(prev, fd);
    if (result && 'success' in result) setCreating(false);
    return result;
  }, undefined);

  const [editState, editAction, isEditing] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      if (!editing) return prev;
      const result = await updateClimateTypologyCode(editing.id, prev, fd);
      if (result && 'success' in result) setEditing(null);
      return result;
    },
    undefined,
  );

  function toggleActive(id: string, currentlyActive: boolean) {
    setPendingId(id);
    startTransition(async () => {
      if (currentlyActive) await deactivateClimateTypologyCode(id);
      else await restoreClimateTypologyCode(id);
      setPendingId(null);
    });
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" />
          Add code
        </Button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Code</TableHead>
              <TableHead className="w-32">Pillar</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-neutral-400">
                  No climate typology codes found.
                </TableCell>
              </TableRow>
            ) : (
              codes.map((c) => (
                <TableRow key={c.id} className={cn(!c.isActive && 'opacity-50')}>
                  <TableCell className="font-mono text-xs font-medium text-neutral-700">
                    {c.code}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium',
                        PILLAR_COLORS[c.pillar],
                      )}
                    >
                      {c.pillar}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-neutral-900">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant={c.isActive ? 'default' : 'secondary'}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setEditing(c)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={pendingId === c.id}
                        onClick={() => toggleActive(c.id, c.isActive)}
                      >
                        {c.isActive ? (
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
            <DialogTitle>Add Climate Typology Code</DialogTitle>
          </DialogHeader>
          <ClimateCodeForm
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
              <DialogTitle>Edit Code — {editing.code}</DialogTitle>
            </DialogHeader>
            <ClimateCodeForm
              key={editing.id}
              code={editing}
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

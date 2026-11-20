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
import type { UacsObjectRecord } from '@/lib/api';
import {
  createUacsObject,
  updateUacsObject,
  deactivateUacsObject,
  restoreUacsObject,
  type ActionState,
} from './_actions';

const EXPENSE_CLASSES = [
  { value: 'PS', label: 'PS — Personnel Services' },
  { value: 'MOOE', label: 'MOOE — Maintenance & Operating' },
  { value: 'FE', label: 'FE — Financial Expenses' },
  { value: 'CO', label: 'CO — Capital Outlay' },
] as const;

const CLASS_COLORS: Record<string, string> = {
  PS: 'bg-green-50 text-green-700 border-green-200',
  MOOE: 'bg-blue-50 text-blue-700 border-blue-200',
  FE: 'bg-rose-50 text-rose-700 border-rose-200',
  CO: 'bg-purple-50 text-purple-700 border-purple-200',
};

function UacsForm({
  obj,
  formAction,
  isPending,
  state,
}: {
  obj?: UacsObjectRecord;
  formAction: (payload: FormData) => void;
  isPending: boolean;
  state: ActionState;
}) {
  const [expenseClass, setExpenseClass] = useState<string>(
    obj?.expenseClass ?? 'MOOE',
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="expenseClass" value={expenseClass} />
      {!obj && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="uacs-code">
            Code
          </label>
          <Input
            id="uacs-code"
            name="code"
            placeholder="e.g. 5020301000"
            required
          />
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="uacs-desc">
          Description
        </label>
        <Input
          id="uacs-desc"
          name="description"
          defaultValue={obj?.description}
          required
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700">Expense class</label>
        <Select value={expenseClass} onValueChange={(v) => setExpenseClass(v ?? '')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CLASSES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {state && 'error' in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : obj ? 'Save changes' : 'Add object'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function UacsObjectList({
  objects,
}: {
  objects: UacsObjectRecord[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UacsObjectRecord | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createAction, isCreating] = useActionState<
    ActionState,
    FormData
  >(async (prev, fd) => {
    const result = await createUacsObject(prev, fd);
    if (result && 'success' in result) setCreating(false);
    return result;
  }, undefined);

  const [editState, editAction, isEditing] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      if (!editing) return prev;
      const result = await updateUacsObject(editing.id, prev, fd);
      if (result && 'success' in result) setEditing(null);
      return result;
    },
    undefined,
  );

  function toggleActive(id: string, currentlyActive: boolean) {
    setPendingId(id);
    startTransition(async () => {
      if (currentlyActive) await deactivateUacsObject(id);
      else await restoreUacsObject(id);
      setPendingId(null);
    });
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" />
          Add object
        </Button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-16">Class</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {objects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-neutral-400">
                  No UACS objects found.
                </TableCell>
              </TableRow>
            ) : (
              objects.map((o) => (
                <TableRow key={o.id} className={cn(!o.isActive && 'opacity-50')}>
                  <TableCell className="font-mono text-xs font-medium text-neutral-700">
                    {o.code}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-900">
                    {o.description}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium',
                        CLASS_COLORS[o.expenseClass],
                      )}
                    >
                      {o.expenseClass}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={o.isActive ? 'default' : 'secondary'}>
                      {o.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setEditing(o)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={pendingId === o.id}
                        onClick={() => toggleActive(o.id, o.isActive)}
                      >
                        {o.isActive ? (
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
            <DialogTitle>Add UACS Object</DialogTitle>
          </DialogHeader>
          <UacsForm
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
              <DialogTitle>Edit UACS Object — {editing.code}</DialogTitle>
            </DialogHeader>
            <UacsForm
              key={editing.id}
              obj={editing}
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

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
import type { SdgGoalRecord } from '@/lib/api';
import {
  createSdgGoal,
  updateSdgGoal,
  deactivateSdgGoal,
  restoreSdgGoal,
  type ActionState,
} from './_actions';

function SdgForm({
  goal,
  formAction,
  isPending,
  state,
}: {
  goal?: SdgGoalRecord;
  formAction: (payload: FormData) => void;
  isPending: boolean;
  state: ActionState;
}) {
  return (
    <form action={formAction} className="space-y-4">
      {!goal && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="sdg-code">
            Code
          </label>
          <Input id="sdg-code" name="code" placeholder="e.g. SDG-01" required />
          <p className="text-xs text-neutral-500">
            Zero-pad the number so goals sort in order.
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="sdg-name">
          Name
        </label>
        <Input
          id="sdg-name"
          name="name"
          defaultValue={goal?.name}
          placeholder="e.g. No Poverty"
          required
        />
      </div>
      {state && 'error' in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : goal ? 'Save changes' : 'Add goal'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function SdgGoalList({ goals }: { goals: SdgGoalRecord[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SdgGoalRecord | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createAction, isCreating] = useActionState<
    ActionState,
    FormData
  >(async (prev, fd) => {
    const result = await createSdgGoal(prev, fd);
    if (result && 'success' in result) setCreating(false);
    return result;
  }, undefined);

  const [editState, editAction, isEditing] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      if (!editing) return prev;
      const result = await updateSdgGoal(editing.id, prev, fd);
      if (result && 'success' in result) setEditing(null);
      return result;
    },
    undefined,
  );

  function toggleActive(id: string, currentlyActive: boolean) {
    setPendingId(id);
    startTransition(async () => {
      if (currentlyActive) await deactivateSdgGoal(id);
      else await restoreSdgGoal(id);
      setPendingId(null);
    });
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" />
          Add goal
        </Button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {goals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-neutral-400">
                  No SDG goals found.
                </TableCell>
              </TableRow>
            ) : (
              goals.map((g) => (
                <TableRow key={g.id} className={cn(!g.isActive && 'opacity-50')}>
                  <TableCell className="font-mono text-xs font-medium text-neutral-700">
                    {g.code}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-900">{g.name}</TableCell>
                  <TableCell>
                    <Badge variant={g.isActive ? 'default' : 'secondary'}>
                      {g.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setEditing(g)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={pendingId === g.id}
                        onClick={() => toggleActive(g.id, g.isActive)}
                      >
                        {g.isActive ? (
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
            <DialogTitle>Add SDG Goal</DialogTitle>
          </DialogHeader>
          <SdgForm
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
              <DialogTitle>Edit SDG Goal — {editing.code}</DialogTitle>
            </DialogHeader>
            <SdgForm
              key={editing.id}
              goal={editing}
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

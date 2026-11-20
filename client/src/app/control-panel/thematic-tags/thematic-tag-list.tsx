'use client';

import { useActionState, useState, useTransition } from 'react';
import { Pencil, EyeOff, Eye } from 'lucide-react';
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
import type { ThematicTagWithUsage } from '@/lib/api';
import {
  renameThematicTag,
  setThematicTagActive,
  type ActionState,
} from './_actions';
import { AddThematicTagCombobox } from './add-thematic-tag-combobox';

function RenameThematicTagForm({
  tag,
  formAction,
  isPending,
  state,
}: {
  tag: ThematicTagWithUsage;
  formAction: (payload: FormData) => void;
  isPending: boolean;
  state: ActionState;
}) {
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="tt-name">
          Name
        </label>
        <Input
          id="tt-name"
          name="name"
          placeholder="e.g. Senior Citizens"
          defaultValue={tag.name}
          maxLength={100}
          required
          autoFocus
        />
      </div>
      {state && 'error' in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function ThematicTagList({
  tags,
}: {
  tags: ThematicTagWithUsage[];
}) {
  const [editing, setEditing] = useState<ThematicTagWithUsage | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [editState, editAction, isEditing] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      if (!editing) return prev;
      const result = await renameThematicTag(editing.id, prev, fd);
      if (result && 'success' in result) setEditing(null);
      return result;
    },
    undefined,
  );

  function toggleActive(id: string, currentlyActive: boolean) {
    setPendingId(id);
    startTransition(async () => {
      await setThematicTagActive(id, !currentlyActive);
      setPendingId(null);
    });
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <AddThematicTagCombobox tags={tags} />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">In use</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-neutral-400">
                  No thematic tags found.
                </TableCell>
              </TableRow>
            ) : (
              tags.map((t) => (
                <TableRow key={t.id} className={cn(!t.isActive && 'opacity-50')}>
                  <TableCell className="text-sm text-neutral-900">{t.name}</TableCell>
                  <TableCell className="text-sm tabular-nums text-neutral-500">
                    {t.usageCount} {t.usageCount === 1 ? 'row' : 'rows'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.isActive ? 'default' : 'secondary'}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setEditing(t)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={pendingId === t.id}
                        onClick={() => toggleActive(t.id, t.isActive)}
                      >
                        {t.isActive ? (
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

      {editing && (
        <Dialog
          open={!!editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rename Tag — {editing.name}</DialogTitle>
            </DialogHeader>
            <RenameThematicTagForm
              key={editing.id}
              tag={editing}
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

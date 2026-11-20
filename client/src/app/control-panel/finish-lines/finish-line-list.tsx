'use client';

import { useActionState, useState, useTransition } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import type { FinishLineRecord, SubFinishLineRecord } from '@/lib/api';
import {
  updateFinishLine,
  createSubFinishLine,
  updateSubFinishLine,
  deactivateSubFinishLine,
  type ActionState,
} from './_actions';
import { GOAL, GOALS, goal, goals } from '@/lib/goal-label';


// ─── Edit finish line dialog ──────────────────────────────────────────────────

function EditFinishLineDialog({
  finishLine,
  open,
  onOpenChange,
}: {
  finishLine: FinishLineRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [color, setColor] = useState(finishLine.color ?? '');
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (prevState: ActionState, formData: FormData) => {
      const result = await updateFinishLine(finishLine.id, prevState, formData);
      if (result && 'success' in result) onOpenChange(false);
      return result;
    },
    undefined,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {GOAL}</DialogTitle>
          <DialogDescription>{GOAL} {finishLine.visionNumber ?? '—'}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700" htmlFor="fl-vision">
              Number
            </label>
            <Input id="fl-vision" name="visionNumber" type="number" min={1} defaultValue={finishLine.visionNumber ?? ''} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700" htmlFor="fl-name">
              Name
            </label>
            <Input id="fl-name" name="name" defaultValue={finishLine.name} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700" htmlFor="fl-fullname">
              Full name
            </label>
            <Input id="fl-fullname" name="fullName" defaultValue={finishLine.fullName} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700" htmlFor="fl-shortname">
                Short name
              </label>
              <Input
                id="fl-shortname"
                name="shortName"
                placeholder="e.g. Green Growth"
                defaultValue={finishLine.shortName ?? ''}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700" htmlFor="fl-color">
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Color picker"
                  value={finishLine.color ?? '#000000'}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-neutral-200 bg-white p-1"
                />
                <Input
                  id="fl-color"
                  name="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#4C9F38"
                  className="font-mono"
                />
              </div>
            </div>
          </div>
          {state && 'error' in state && <p className="text-sm text-red-600">{state.error}</p>}
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add sub-finish-line dialog ───────────────────────────────────────────────

function AddSubFinishLineDialog({
  finishLine,
  open,
  onOpenChange,
}: {
  finishLine: FinishLineRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (prevState: ActionState, formData: FormData) => {
      const result = await createSubFinishLine(finishLine.id, prevState, formData);
      if (result && 'success' in result) onOpenChange(false);
      return result;
    },
    undefined,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Sub-{GOAL}</DialogTitle>
          <DialogDescription>Under: {finishLine.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700" htmlFor="sfl-code">
              Code <span className="text-destructive">*</span>
            </label>
            <Input id="sfl-code" name="code" placeholder="e.g. FL1-A" required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700" htmlFor="sfl-name">
              Name <span className="text-destructive">*</span>
            </label>
            <Input id="sfl-name" name="name" placeholder={`Sub-${goal} name`} required />
          </div>
          {state && 'error' in state && <p className="text-sm text-red-600">{state.error}</p>}
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isPending}>{isPending ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit sub-finish-line dialog ──────────────────────────────────────────────

function EditSubFinishLineDialog({
  sfl,
  open,
  onOpenChange,
}: {
  sfl: SubFinishLineRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (prevState: ActionState, formData: FormData) => {
      const result = await updateSubFinishLine(sfl.id, prevState, formData);
      if (result && 'success' in result) onOpenChange(false);
      return result;
    },
    undefined,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Sub-{GOAL}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700" htmlFor="sfl-edit-code">
              Code <span className="text-destructive">*</span>
            </label>
            <Input id="sfl-edit-code" name="code" defaultValue={sfl.code} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700" htmlFor="sfl-edit-name">
              Name <span className="text-destructive">*</span>
            </label>
            <Input id="sfl-edit-name" name="name" defaultValue={sfl.name} required />
          </div>
          {state && 'error' in state && <p className="text-sm text-red-600">{state.error}</p>}
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-finish lines panel ───────────────────────────────────────────────────

function SubFinishLinePanel({ finishLine }: { finishLine: FinishLineRecord }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SubFinishLineRecord | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDeactivate(id: string) {
    startTransition(async () => {
      await deactivateSubFinishLine(id);
    });
  }

  return (
    <div className="bg-neutral-50 border-t border-neutral-200 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
          Sub-{GOALS}
        </span>
        <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => setAdding(true)}>
          <Plus className="w-3 h-3" /> Add
        </Button>
      </div>

      {finishLine.subFinishLines.length === 0 ? (
        <p className="text-xs text-neutral-400 py-1">No sub-{goals} yet.</p>
      ) : (
        <div className="space-y-1">
          {finishLine.subFinishLines.map((sfl) => (
            <div key={sfl.id} className="flex items-center justify-between rounded-md bg-white border border-neutral-200 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs font-semibold text-neutral-400 shrink-0">{sfl.code}</span>
                <span className="text-sm text-neutral-800 truncate">{sfl.name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(sfl)}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  disabled={isPending}
                  onClick={() => handleDeactivate(sfl.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddSubFinishLineDialog
          finishLine={finishLine}
          open={adding}
          onOpenChange={setAdding}
        />
      )}
      {editing && (
        <EditSubFinishLineDialog
          key={editing.id}
          sfl={editing}
          open={!!editing}
          onOpenChange={(open) => { if (!open) setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── Finish line row ──────────────────────────────────────────────────────────

function FinishLineRow({ fl }: { fl: FinishLineRecord }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <>
      <TableRow>
        <TableCell className="font-semibold text-neutral-400 w-12">
          {fl.visionNumber ?? '—'}
        </TableCell>
        <TableCell>
          <div className="flex items-start gap-2">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: fl.color ?? 'transparent' }}
              title={fl.color ?? 'No color set'}
            />
            <div className="min-w-0">
              <p className="font-medium text-neutral-900 leading-snug">{fl.name}</p>
              {fl.shortName && (
                <p className="text-xs font-medium text-neutral-400 mt-0.5 leading-snug">
                  {fl.shortName}
                </p>
              )}
              <p className="text-xs text-neutral-500 mt-0.5 lg:hidden leading-snug">{fl.fullName}</p>
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden lg:table-cell text-sm text-neutral-600 max-w-xs">
          {fl.fullName}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {fl.finishLineClusters.map((flc) => (
              <Badge key={flc.cluster.id} variant="secondary" className="text-xs">
                {flc.cluster.name}
              </Badge>
            ))}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={fl.subFinishLines.length > 0 ? 'secondary' : 'outline'} className="text-xs tabular-nums">
            {fl.subFinishLines.length}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Sub-lines
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="p-0">
            <SubFinishLinePanel finishLine={fl} />
          </TableCell>
        </TableRow>
      )}

      {editing && (
        <EditFinishLineDialog
          key={fl.id}
          finishLine={fl}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
    </>
  );
}

// ─── Main list ────────────────────────────────────────────────────────────────

export default function FinishLineList({ finishLines }: { finishLines: FinishLineRecord[] }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="hidden lg:table-cell">Full name</TableHead>
            <TableHead>Clusters</TableHead>
            <TableHead className="w-20">Sub-lines</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {finishLines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-neutral-400">
                No {goals} found.
              </TableCell>
            </TableRow>
          ) : (
            finishLines.map((fl) => <FinishLineRow key={fl.id} fl={fl} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}

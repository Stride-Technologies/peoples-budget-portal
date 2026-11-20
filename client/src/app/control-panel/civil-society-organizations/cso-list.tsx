'use client';

import { useActionState, useState, useTransition } from 'react';
import { Plus, Pencil, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { CsoRecord, ClusterRecord } from '@/lib/api';
import {
  createCso,
  updateCso,
  deactivateCso,
  restoreCso,
  type ActionState,
} from './_actions';

function CsoForm({
  cso,
  clusters,
  formAction,
  isPending,
  state,
}: {
  cso?: CsoRecord;
  clusters: ClusterRecord[];
  formAction: (payload: FormData) => void;
  isPending: boolean;
  state: ActionState;
}) {
  const [clusterId, setClusterId] = useState(cso?.clusterId ?? '');
  const handleClusterChange = (value: string | null) => setClusterId(value ?? '');

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="clusterId" value={clusterId} />
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="cso-name">
          Name
        </label>
        <Input id="cso-name" name="name" defaultValue={cso?.name} required />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700" htmlFor="cso-code">
          Code <span className="text-neutral-400 font-normal">(optional)</span>
        </label>
        <Input
          id="cso-code"
          name="code"
          placeholder="e.g. 001"
          defaultValue={cso?.code ?? ''}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700">Cluster</label>
        <Select value={clusterId} onValueChange={handleClusterChange} required>
          <SelectTrigger>
            <SelectValue placeholder="Select cluster…" />
          </SelectTrigger>
          <SelectContent>
            {clusters.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-start gap-2.5">
        <Checkbox
          id="cso-can-endorse"
          name="canEndorse"
          defaultChecked={cso?.canEndorse ?? false}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <label
            htmlFor="cso-can-endorse"
            className="text-sm font-medium text-neutral-700"
          >
            Endorser
          </label>
          <p className="text-xs text-neutral-500">
            Lets this CSO’s representative endorse AIP programs as NCPC. Their
            head is invited through the Users page.
          </p>
        </div>
      </div>
      {state && 'error' in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending || !clusterId}>
          {isPending ? 'Saving…' : cso ? 'Save changes' : 'Add organization'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function CsoList({
  csos,
  clusters,
}: {
  csos: CsoRecord[];
  clusters: ClusterRecord[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CsoRecord | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createAction, isCreating] = useActionState<
    ActionState,
    FormData
  >(async (prev, fd) => {
    const result = await createCso(prev, fd);
    if (result && 'success' in result) setCreating(false);
    return result;
  }, undefined);

  const [editState, editAction, isEditing] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      if (!editing) return prev;
      const result = await updateCso(editing.id, prev, fd);
      if (result && 'success' in result) setEditing(null);
      return result;
    },
    undefined,
  );

  function toggleActive(id: string, currentlyActive: boolean) {
    setPendingId(id);
    startTransition(async () => {
      if (currentlyActive) await deactivateCso(id);
      else await restoreCso(id);
      setPendingId(null);
    });
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" />
          Add organization
        </Button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Cluster</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {csos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-neutral-400">
                  No organizations found.
                </TableCell>
              </TableRow>
            ) : (
              csos.map((cso) => (
                <TableRow key={cso.id} className={cn(!cso.isActive && 'opacity-50')}>
                  <TableCell className="font-mono text-xs text-neutral-500">
                    {cso.code ?? '—'}
                  </TableCell>
                  <TableCell className="font-medium text-neutral-900">
                    <span className="inline-flex items-center gap-2">
                      {cso.name}
                      {cso.canEndorse && (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase tracking-wide text-blue-700 border-blue-200"
                        >
                          Endorser
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    {cso.cluster && (
                      <Badge variant="secondary" className="text-xs">
                        {cso.cluster.name}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cso.isActive ? 'default' : 'secondary'}>
                      {cso.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setEditing(cso)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={pendingId === cso.id}
                        onClick={() => toggleActive(cso.id, cso.isActive)}
                      >
                        {cso.isActive ? (
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
            <DialogTitle>Add Civil Society Organization</DialogTitle>
          </DialogHeader>
          <CsoForm
            clusters={clusters}
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
              <DialogTitle>Edit Organization — {editing.name}</DialogTitle>
            </DialogHeader>
            <CsoForm
              key={editing.id}
              cso={editing}
              clusters={clusters}
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

'use client';

import { Fragment, useActionState, useMemo, useState, useTransition } from 'react';
import { Plus, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import type {
  ClusterRecord,
  OfficeRecord,
  OfficeType,
  PapSectorRecord,
} from '@/lib/api';
import {
  createOffice,
  updateOffice,
  saveOfficeEdits,
  type ActionState,
  type OfficeEdit,
} from './_actions';

const OFFICE_TYPES = [
  { value: 'MANDATORY', label: 'Mandatory' },
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'OTHERS', label: 'Others' },
] as const;

const TYPE_COLORS: Record<string, string> = {
  MANDATORY: 'bg-blue-50 text-blue-700 border-blue-200',
  OPTIONAL: 'bg-amber-50 text-amber-700 border-amber-200',
  OTHERS: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

const TYPE_LABEL = Object.fromEntries(
  OFFICE_TYPES.map((t) => [t.value, t.label]),
) as Record<string, string>;

/** Sentinel for "no PAP sector" — Base UI's Select cannot hold an empty value. */
const NO_SECTOR = '__none__';
/** Offices with no type sort into their own trailing section. */
const UNTYPED = '__untyped__';

/**
 * Base UI needs `items` on `Select.Root` to render a label in the trigger —
 * without it `Select.Value` shows the raw value, which for cluster and PAP
 * sector is a UUID.
 */
const TYPE_ITEMS: Record<string, string> = {
  ...TYPE_LABEL,
  [UNTYPED]: 'No type',
};

const clusterItemsOf = (clusters: ClusterRecord[]): Record<string, string> =>
  Object.fromEntries(clusters.map((c) => [c.id, c.name]));

const sectorItemsOf = (sectors: PapSectorRecord[]): Record<string, string> => ({
  [NO_SECTOR]: '—',
  ...Object.fromEntries(sectors.map((s) => [s.id, s.code])),
});

const TYPE_ORDER: Record<string, number> = {
  MANDATORY: 0,
  OPTIONAL: 1,
  OTHERS: 2,
  [UNTYPED]: 3,
};

/** The inline-editable fields, as staged in local state. */
type Draft = {
  officeCode: string;
  officeType: string;
  clusterId: string;
  papSectorId: string;
};

function draftOf(o: OfficeRecord): Draft {
  return {
    officeCode: o.officeCode ?? '',
    officeType: o.officeType ?? UNTYPED,
    clusterId: o.clusterId,
    papSectorId: o.papSectorId ?? NO_SECTOR,
  };
}

// ─── Add / edit dialog form ──────────────────────────────────────────────────

function OfficeForm({
  office,
  clusters,
  papSectors,
  formAction,
  isPending,
  state,
}: Readonly<{
  office?: OfficeRecord;
  clusters: ClusterRecord[];
  papSectors: PapSectorRecord[];
  formAction: (payload: FormData) => void;
  isPending: boolean;
  state: ActionState;
}>) {
  const [officeType, setOfficeType] = useState<string>(
    office?.officeType ?? 'MANDATORY',
  );
  const [clusterId, setClusterId] = useState(office?.clusterId ?? '');
  const [papSectorId, setPapSectorId] = useState(office?.papSectorId ?? NO_SECTOR);
  const [canEndorse, setCanEndorse] = useState(office?.canEndorse ?? false);
  const [isActive, setIsActive] = useState(office?.isActive ?? true);
  const [form7Column, setForm7Column] = useState<string>(office?.form7Column ?? '');
  const clusterItems = useMemo(() => clusterItemsOf(clusters), [clusters]);
  const sectorItems = useMemo(() => sectorItemsOf(papSectors), [papSectors]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="officeType" value={officeType} />
      <input type="hidden" name="clusterId" value={clusterId} />
      <input
        type="hidden"
        name="papSectorId"
        value={papSectorId === NO_SECTOR ? '' : papSectorId}
      />
      <input type="hidden" name="canEndorse" value={String(canEndorse)} />
      <input type="hidden" name="isActive" value={String(isActive)} />
      <input type="hidden" name="form7Column" value={form7Column} />

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="of-acronym">
            Acronym
          </label>
          <Input
            id="of-acronym"
            name="acronym"
            defaultValue={office?.acronym}
            placeholder="CMO"
            required
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="of-name">
            Full name
          </label>
          <Input
            id="of-name"
            name="name"
            defaultValue={office?.name}
            placeholder="Office of the Mayor"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="of-code">
            Office code
          </label>
          <Input
            id="of-code"
            name="officeCode"
            defaultValue={office?.officeCode ?? ''}
            placeholder="01"
          />
          <p className="text-xs text-neutral-400">
            Free text — enter it exactly as the coding sheet has it, suffix
            included (e.g. <span className="font-mono">11 (1)</span>).
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700">Office type</label>
          <Select
            items={TYPE_ITEMS}
            value={officeType}
            onValueChange={(v) => setOfficeType(v ?? '')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OFFICE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700">Cluster</label>
          <Select
            items={clusterItems}
            value={clusterId}
            onValueChange={(v) => setClusterId(v ?? '')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a cluster" />
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
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700">PAP sector</label>
          <Select
            items={sectorItems}
            value={papSectorId}
            onValueChange={(v) => setPapSectorId(v ?? '')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SECTOR}>— none —</SelectItem>
              {papSectors.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* The header block of the office's printed AB sheet. All optional — the
          city leaves Vision and Mission blank on several sheets — and none of
          them are AIP code segments, so editing one restates nothing. */}
      <div className="space-y-3 rounded-lg border border-neutral-200 p-3">
        <p className="text-sm font-medium text-neutral-700">AB sheet header</p>
        <p className="-mt-2 text-xs text-neutral-400">
          Printed above the PPA table on this office&rsquo;s Annual Budget sheet.
          Leave blank if the office has not settled the wording.
        </p>

        <div className="space-y-1.5">
          <label className="text-sm text-neutral-700" htmlFor="of-mandate">
            Mandate / Legal Basis
          </label>
          <Textarea
            id="of-mandate"
            name="mandateLegalBasis"
            defaultValue={office?.mandateLegalBasis ?? ''}
            rows={2}
            placeholder="Exercise general supervision and control over all programs…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-700" htmlFor="of-vision">
              Vision
            </label>
            <Textarea
              id="of-vision"
              name="vision"
              defaultValue={office?.vision ?? ''}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-neutral-700" htmlFor="of-mission">
              Mission
            </label>
            <Textarea
              id="of-mission"
              name="mission"
              defaultValue={office?.mission ?? ''}
              rows={3}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-neutral-700" htmlFor="of-outcomes">
            Organizational outcomes
          </label>
          <Textarea
            id="of-outcomes"
            name="organizationalOutcomes"
            defaultValue={(office?.organizationalOutcomes ?? []).join('\n')}
            rows={3}
            placeholder="One outcome per line"
          />
          <p className="text-xs text-neutral-400">
            One per line — each becomes its own row on the printed sheet.
          </p>
        </div>
      </div>

      {/* LBP Form 7 (specs/008): which sector column this office's money
          prints in. Special funds are funds, not offices (specs/016): their
          lump sums are built from rows' fund sources. Independent of the office
          type, which is an AIP code segment. */}
      <div className="space-y-3 rounded-lg border border-neutral-200 p-3">
        <p className="text-sm font-medium text-neutral-700">LBP Form 7</p>
        <div className="space-y-1.5">
          <label className="text-sm text-neutral-700" htmlFor="of-form7">
            Form 7 column
          </label>
          <select
            id="of-form7"
            value={form7Column}
            onChange={(e) => setForm7Column(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">— not set (listed on the Form 7 notes) —</option>
            <option value="GENERAL_PUBLIC">General Public Services</option>
            <option value="SOCIAL">Social Services</option>
            <option value="ECONOMIC">Economic Services</option>
            <option value="ECONOMIC_ENTERPRISE">Economic Enterprises</option>
          </select>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-neutral-200 p-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={canEndorse}
            onChange={(e) => setCanEndorse(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          <span className="text-sm text-neutral-700">
            This office records advisory endorsements
          </span>
        </label>
        {/* Only when editing: a new office is always created active. */}
        {office && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-neutral-700">
              Active — inactive offices are hidden from proponents but keep their
              submissions
            </span>
          </label>
        )}
      </div>

      {state && 'error' in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <DialogFooter showCloseButton>
        <Button type="submit" disabled={isPending || !clusterId}>
          {isPending ? 'Saving…' : office ? 'Save changes' : 'Add office'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── List ────────────────────────────────────────────────────────────────────

export default function OfficeList({
  offices,
  clusters,
  papSectors,
}: Readonly<{
  offices: OfficeRecord[];
  clusters: ClusterRecord[];
  papSectors: PapSectorRecord[];
}>) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OfficeRecord | null>(null);
  const [, startTransition] = useTransition();

  // Staged inline edits, keyed by office id. Nothing is live until Save.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const clusterItems = useMemo(() => clusterItemsOf(clusters), [clusters]);
  const sectorItems = useMemo(() => sectorItemsOf(papSectors), [papSectors]);

  const [addState, addFormAction, isAdding] = useActionState<ActionState, FormData>(
    async (prev: ActionState, formData: FormData) => {
      const result = await createOffice(prev, formData);
      if (result && 'success' in result) setCreating(false);
      return result;
    },
    undefined,
  );

  /** Current value of a row: the staged draft if any, else the server row. */
  const current = (o: OfficeRecord): Draft => drafts[o.id] ?? draftOf(o);

  const rows = useMemo(() => {
    return [...offices].sort((a, b) => {
      const ta = TYPE_ORDER[current(a).officeType] ?? 3;
      const tb = TYPE_ORDER[current(b).officeType] ?? 3;
      if (ta !== tb) return ta - tb;
      const ca = current(a).officeCode;
      const cb = current(b).officeCode;
      if (ca !== cb) return ca.localeCompare(cb, undefined, { numeric: true });
      return a.acronym.localeCompare(b.acronym);
    });
    // `drafts` is read through `current`, so a staged type change re-sections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offices, drafts]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of offices) {
      const t = current(o).officeType;
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offices, drafts]);

  /**
   * Offices sharing a code AND type emit identical AIP reference codes. That is
   * legitimate — several offices sit on CMO's `01` — so this only flags them.
   */
  const clashes = useMemo(() => {
    const byKey = new Map<string, string[]>();
    for (const o of offices) {
      const d = current(o);
      if (!d.officeCode.trim() || d.officeType === UNTYPED) continue;
      const key = `${d.officeCode.trim()}/${d.officeType}`;
      byKey.set(key, [...(byKey.get(key) ?? []), o.acronym]);
    }
    const out = new Map<string, string[]>();
    for (const o of offices) {
      const d = current(o);
      const key = `${d.officeCode.trim()}/${d.officeType}`;
      const others = (byKey.get(key) ?? []).filter((a) => a !== o.acronym);
      if (others.length) out.set(o.id, others);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offices, drafts]);

  function stage(office: OfficeRecord, patch: Partial<Draft>) {
    setSaveError(null);
    setDrafts((prev) => {
      const next = { ...prev, [office.id]: { ...current(office), ...patch } };
      // Editing a row back to its server values un-stages it.
      const base = draftOf(office);
      const d = next[office.id];
      if (
        d.officeCode === base.officeCode &&
        d.officeType === base.officeType &&
        d.clusterId === base.clusterId &&
        d.papSectorId === base.papSectorId
      ) {
        delete next[office.id];
      }
      return next;
    });
  }

  const dirtyIds = Object.keys(drafts);

  function discard() {
    setDrafts({});
    setSaveError(null);
  }

  function save() {
    setSaving(true);
    setSaveError(null);
    const edits: OfficeEdit[] = dirtyIds.map((id) => {
      const d = drafts[id];
      return {
        id,
        officeCode: d.officeCode.trim() || undefined,
        officeType:
          d.officeType === UNTYPED ? undefined : (d.officeType as OfficeType),
        clusterId: d.clusterId,
        papSectorId: d.papSectorId === NO_SECTOR ? null : d.papSectorId,
      };
    });
    startTransition(async () => {
      const result = await saveOfficeEdits(edits);
      // Clear only what landed, so a partial failure keeps the rest pending.
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of result.savedIds) delete next[id];
        return next;
      });
      if (result.error) setSaveError(result.error);
      setSaving(false);
    });
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-neutral-500">
          Edit the code, type, cluster and PAP sector inline — changes apply only
          when you save. Changing a code or type renumbers the AIP codes of that
          office&apos;s unapproved submissions.
        </p>
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" />
          Add office
        </Button>
      </div>

      {saveError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {saveError}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        {/* table-fixed so the dropdown columns keep one width regardless of the
            label inside them; Name is the only column left to absorb slack. */}
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Type</TableHead>
              <TableHead className="w-44">Cluster</TableHead>
              <TableHead className="w-28">PAP sector</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-neutral-400">
                  No offices yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((office, index) => {
                const d = current(office);
                const isDirty = !!drafts[office.id];
                const startsSection =
                  index === 0 || current(rows[index - 1]).officeType !== d.officeType;
                const clash = clashes.get(office.id);

                return (
                  <Fragment key={office.id}>
                    {startsSection && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={7}
                          className="border-t border-neutral-200 bg-neutral-50 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                                TYPE_COLORS[d.officeType] ?? TYPE_COLORS.OTHERS,
                              )}
                            >
                              {TYPE_LABEL[d.officeType] ?? 'No type'}
                            </span>
                            <span className="text-xs text-neutral-400">
                              {counts.get(d.officeType)}{' '}
                              {counts.get(d.officeType) === 1 ? 'office' : 'offices'}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow
                      className={cn(
                        !office.isActive && 'opacity-50',
                        isDirty && 'bg-blue-50/50',
                      )}
                    >
                      <TableCell>
                        <Input
                          value={d.officeCode}
                          onChange={(e) =>
                            stage(office, { officeCode: e.target.value })
                          }
                          aria-label={`Office code for ${office.acronym}`}
                          className="h-7 w-full font-mono text-sm tabular-nums"
                        />
                      </TableCell>
                      {/* whitespace-normal overrides TableCell's nowrap so a long
                          office name wraps inside the column instead of running
                          over the one beside it. */}
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col">
                          <span className="font-medium text-neutral-900">
                            {office.acronym}
                          </span>
                          {office.name !== office.acronym && (
                            <span className="text-xs text-neutral-500">
                              {office.name}
                            </span>
                          )}
                          {clash && (
                            <span
                              className="mt-0.5 text-xs text-amber-700"
                              title={`Same code and office type as ${clash.join(', ')} — every one of them emits the same AIP reference code.`}
                            >
                              Shares code with {clash.length}{' '}
                              {clash.length === 1 ? 'office' : 'offices'}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          items={TYPE_ITEMS}
                          value={d.officeType}
                          onValueChange={(v) =>
                            stage(office, { officeType: v ?? UNTYPED })
                          }
                        >
                          <SelectTrigger
                            className="h-7 w-full gap-1 border-transparent bg-transparent px-1.5 text-xs font-normal text-neutral-500 shadow-none hover:bg-neutral-100 hover:text-neutral-800 [&>span]:truncate"
                            aria-label={`Office type for ${office.acronym}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OFFICE_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          items={clusterItems}
                          value={d.clusterId}
                          onValueChange={(v) => v && stage(office, { clusterId: v })}
                        >
                          <SelectTrigger
                            className="h-7 w-full gap-1 border-transparent bg-transparent px-1.5 text-xs font-normal text-neutral-500 shadow-none hover:bg-neutral-100 hover:text-neutral-800 [&>span]:truncate"
                            aria-label={`Cluster for ${office.acronym}`}
                          >
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {clusters.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          items={sectorItems}
                          value={d.papSectorId}
                          onValueChange={(v) =>
                            stage(office, { papSectorId: v ?? NO_SECTOR })
                          }
                        >
                          <SelectTrigger
                            className="h-7 w-full gap-1 border-transparent bg-transparent px-1.5 font-mono text-xs font-normal text-neutral-500 shadow-none hover:bg-neutral-100 hover:text-neutral-800 [&>span]:truncate"
                            aria-label={`PAP sector for ${office.acronym}`}
                          >
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_SECTOR}>—</SelectItem>
                            {papSectors.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.code} — {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={office.isActive ? 'default' : 'secondary'}>
                          {office.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={`Edit ${office.acronym}`}
                          aria-label={`Edit ${office.acronym}`}
                          onClick={() => setEditing(office)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {dirtyIds.length > 0 && (
        <div className="sticky bottom-0 mt-3 flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-lg">
          <span className="text-sm text-neutral-600">
            <strong>{dirtyIds.length}</strong>{' '}
            {dirtyIds.length === 1 ? 'office' : 'offices'} changed
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={saving}
            onClick={discard}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Discard
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Office</DialogTitle>
          </DialogHeader>
          <OfficeForm
            clusters={clusters}
            papSectors={papSectors}
            formAction={addFormAction}
            isPending={isAdding}
            state={addState}
          />
        </DialogContent>
      </Dialog>

      {editing && (
        <OfficeEditDialog
          key={editing.id}
          office={editing}
          clusters={clusters}
          papSectors={papSectors}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function OfficeEditDialog({
  office,
  clusters,
  papSectors,
  onClose,
}: Readonly<{
  office: OfficeRecord;
  clusters: ClusterRecord[];
  papSectors: PapSectorRecord[];
  onClose: () => void;
}>) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (prev: ActionState, formData: FormData) => {
      const result = await updateOffice(office.id, prev, formData);
      if (result && 'success' in result) onClose();
      return result;
    },
    undefined,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit Office — {office.acronym}
          </DialogTitle>
        </DialogHeader>
        <OfficeForm
          office={office}
          clusters={clusters}
          papSectors={papSectors}
          formAction={formAction}
          isPending={isPending}
          state={state}
        />
      </DialogContent>
    </Dialog>
  );
}

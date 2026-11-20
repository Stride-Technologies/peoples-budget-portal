'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { ClusterRecord, PermissionCatalog } from '@/lib/api';

export interface AccessValue {
  permissions: Set<string>;
  allOffices: boolean;
  officeIds: Set<string>;
}

interface AccessFieldsProps {
  catalog: PermissionCatalog | null;
  clusters: ClusterRecord[];
  value: AccessValue;
  onChange: (next: AccessValue) => void;
  /** Renders every box ticked and locked — used for the SUPER_ADMIN bypass. */
  bypassed?: boolean;
}

/**
 * The two authorization dimensions as one form section: permission keys and
 * office scope (Phase 1 §5).
 *
 * Shared by the invite dialog and the grants dialog deliberately. They ask the
 * same question at different moments — "what access should this person have?" —
 * and duplicating the UI is how the two drift until granting at invite time and
 * granting afterwards quietly disagree.
 */
export default function AccessFields({
  catalog,
  clusters,
  value,
  onChange,
  bypassed = false,
}: Readonly<AccessFieldsProps>) {
  const [officeSearch, setOfficeSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const byModule = useMemo(() => {
    const groups = new Map<string, PermissionCatalog['permissions']>();
    for (const p of catalog?.permissions ?? []) {
      const list = groups.get(p.module) ?? [];
      list.push(p);
      groups.set(p.module, list);
    }
    return [...groups.entries()];
  }, [catalog]);

  const visibleClusters = useMemo(() => {
    const needle = officeSearch.trim().toLowerCase();
    if (!needle) return clusters;
    return clusters
      .map((c) => ({
        ...c,
        offices: c.offices.filter(
          (o) =>
            o.name.toLowerCase().includes(needle) ||
            o.acronym.toLowerCase().includes(needle),
        ),
      }))
      .filter((c) => c.offices.length > 0);
  }, [clusters, officeSearch]);

  const totalOffices = clusters.reduce((n, c) => n + c.offices.length, 0);

  const setPermissions = (permissions: Set<string>) =>
    onChange({ ...value, permissions });

  function togglePermission(key: string) {
    const next = new Set(value.permissions);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPermissions(next);
  }

  function toggleOffice(id: string) {
    const next = new Set(value.officeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...value, officeIds: next });
  }

  /**
   * A cluster header ticks its offices individually — only offices are ever
   * stored, so moving one between clusters never changes anyone's access.
   */
  function toggleCluster(cluster: ClusterRecord, checked: boolean) {
    const next = new Set(value.officeIds);
    for (const office of cluster.offices) {
      if (checked) next.add(office.id);
      else next.delete(office.id);
    }
    onChange({ ...value, officeIds: next });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Templates ──────────────────────────────────────────────────── */}
      {!bypassed && (
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Apply a template</h3>
            <Badge variant="secondary" className="font-normal">
              starting point — edit freely after
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.keys(catalog?.templates ?? {}).map((name) => (
              <Button
                key={name}
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setPermissions(new Set(catalog?.templates[name] ?? []))
                }
              >
                {name}
              </Button>
            ))}
          </div>
        </section>
      )}

      {/* ── Permissions ────────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2">
        {byModule.map(([module, perms]) => (
          <div key={module} className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold capitalize">
                {module.replace(/-/g, ' ')}
              </h4>
              <span className="text-muted-foreground text-xs">
                {bypassed
                  ? `all ${perms.length}`
                  : `${perms.filter((p) => value.permissions.has(p.key)).length} of ${perms.length}`}
              </span>
            </div>
            <div className="grid gap-2">
              {perms.map((p) => (
                <label
                  key={p.key}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
                  <Checkbox
                    checked={bypassed || value.permissions.has(p.key)}
                    disabled={bypassed}
                    onCheckedChange={() => togglePermission(p.key)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{p.key}</span>
                    {!p.enforced && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-[10px] font-normal"
                      >
                        not enforced yet
                      </Badge>
                    )}
                    <span className="text-muted-foreground block text-xs">
                      {p.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── Office scope ───────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Office scope</h3>

        <label className="mb-3 flex cursor-pointer items-start justify-between gap-3 rounded-md border p-3">
          <span>
            <span className="text-sm font-medium">All offices</span>
            <span className="text-muted-foreground block text-xs">
              Every office&rsquo;s AIP records, current and future
            </span>
          </span>
          <Checkbox
            checked={bypassed || value.allOffices}
            disabled={bypassed}
            onCheckedChange={(v) => onChange({ ...value, allOffices: v })}
          />
        </label>

        {!value.allOffices && !bypassed && (
          <>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm">
                Or select specific offices{' '}
                <Badge variant="secondary" className="font-normal">
                  {value.officeIds.size} of {totalOffices} selected
                </Badge>
              </span>
              <Input
                value={officeSearch}
                onChange={(e) => setOfficeSearch(e.target.value)}
                placeholder="Search offices…"
                className="w-52"
              />
            </div>

            <div className="rounded-md border">
              {visibleClusters.map((cluster) => {
                const selected = cluster.offices.filter((o) =>
                  value.officeIds.has(o.id),
                ).length;
                const all =
                  selected > 0 && selected === cluster.offices.length;
                const isOpen =
                  expanded.has(cluster.id) || officeSearch.length > 0;

                return (
                  <div key={cluster.id} className="border-b last:border-0">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Checkbox
                        checked={
                          all ? true : selected > 0 ? 'indeterminate' : false
                        }
                        onCheckedChange={(v) => toggleCluster(cluster, v)}
                      />
                      <button
                        type="button"
                        onClick={() => toggleExpanded(cluster.id)}
                        className="flex flex-1 items-center gap-2 text-left"
                      >
                        <span className="text-sm font-medium">
                          {cluster.name}
                        </span>
                        <span className="text-muted-foreground ml-auto text-xs">
                          {selected} of {cluster.offices.length}
                        </span>
                        {isOpen ? (
                          <ChevronDown className="size-4 opacity-60" />
                        ) : (
                          <ChevronRight className="size-4 opacity-60" />
                        )}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="grid gap-2 px-3 pb-3 pl-9 sm:grid-cols-2">
                        {cluster.offices.map((office) => (
                          <label
                            key={office.id}
                            className="flex cursor-pointer items-center gap-2 text-xs"
                          >
                            <Checkbox
                              checked={value.officeIds.has(office.id)}
                              onCheckedChange={() => toggleOffice(office.id)}
                            />
                            <span className="font-mono">{office.acronym}</span>
                            <span className="text-muted-foreground truncate">
                              {office.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-muted-foreground mt-2 text-xs">
              Selecting a cluster grants its offices individually. If an office
              later moves to another cluster, this person&rsquo;s access is
              unchanged.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Pencil, History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/select";
import type {
  OfficeRecord,
  UserRecord,
  UserAuditLogRecord,
  UpdateUserPayload,
} from "@/lib/api";
import { updateUser, getUserAuditLog } from "./_actions";

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Always non-null; the parent keys this component by `user.id` so a fresh
  // instance (with state initialised from props) mounts per edited user.
  user: UserRecord;
  offices: OfficeRecord[];
  currentUserRole: string;
}

export default function EditDialog({
  open,
  onOpenChange,
  user,
  offices,
  currentUserRole,
}: Readonly<EditDialogProps>) {
  const isSuperAdmin = currentUserRole === "SUPER_ADMIN";
  const isLguMember =
    user.identityType === "LGU" || user.identityType === "LFC";
  const canEditOffice = isSuperAdmin && isLguMember;

  const originalOfficeId = user.lguusers[0]?.officeId ?? "";

  const [role, setRole] = useState(user.role);
  const [officeId, setOfficeId] = useState(originalOfficeId);
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [logs, setLogs] = useState<UserAuditLogRecord[] | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(true);

  // Load the audit trail once per mounted instance (external system → effect).
  useEffect(() => {
    let cancelled = false;
    getUserAuditLog(user.id)
      .then((res) => {
        if (cancelled) return;
        if (res.error) setLogsError(res.error);
        else setLogs(res.logs ?? []);
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const officesByCluster = useMemo(() => {
    const map = new Map<string, OfficeRecord[]>();
    for (const office of offices) {
      const cluster = office.cluster.name;
      if (!map.has(cluster)) map.set(cluster, []);
      map.get(cluster)!.push(office);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [offices]);
  const hasChanges =
    role !== user.role ||
    isActive !== user.isActive ||
    (canEditOffice && officeId !== originalOfficeId);

  function handleSave() {
    setError(null);

    const payload: UpdateUserPayload = {};
    if (role !== user.role) payload.role = role;
    if (isActive !== user.isActive) payload.isActive = isActive;
    if (canEditOffice && officeId && officeId !== originalOfficeId) {
      payload.officeId = officeId;
    }

    startTransition(async () => {
      const result = await updateUser(user.id, payload);
      if (result.error) {
        setError(result.error);
      } else {
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-blue-600" />
            Edit User
          </DialogTitle>
          <DialogDescription>
            {user.firstName} {user.lastName} · {user.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">
                Role
              </label>
              <Select value={role} onValueChange={(v) => setRole(v ?? role)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  {isSuperAdmin && <SelectItem value="HEAD">Head</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">
                Status
              </label>
              <Select
                value={isActive ? "active" : "inactive"}
                onValueChange={(v) => setIsActive(v === "active")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Deactivated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {canEditOffice && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">
                Office
              </label>
              <Select
                value={officeId}
                onValueChange={(v) => setOfficeId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value: string | null) => {
                      if (!value) return "Select office";
                      for (const [, offices] of officesByCluster) {
                        const office = offices.find((o) => o.id === value);
                        if (office)
                          return `${office.acronym}${office.name === office.acronym ? "" : ` — ${office.name}`}`;
                      }
                      return "Select office";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {officesByCluster.map(([cluster, offices]) => (
                    <SelectGroup key={cluster}>
                      <SelectLabel>{cluster}</SelectLabel>
                      {offices.map((office) => (
                        <SelectItem key={office.id} value={office.id}>
                          {office.acronym}
                          {office.name === office.acronym
                            ? ""
                            : ` — ${office.name}`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isActive && user.isActive && (
            <p className="text-xs text-amber-600">
              Deactivating blocks login and revokes this user&apos;s active
              sessions.
            </p>
          )}

          {/* Audit trail */}
          <div className="rounded-md border border-neutral-200 bg-neutral-50/60">
            <div className="flex items-center gap-1.5 border-b border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600">
              <History className="w-3.5 h-3.5" />
              Change history
            </div>
            <div className="max-h-40 overflow-y-auto px-3 py-2">
              {logsLoading && (
                <p className="text-xs text-neutral-400">Loading…</p>
              )}
              {logsError && (
                <p className="text-xs text-red-600">{logsError}</p>
              )}
              {logs && logs.length === 0 && !logsLoading && (
                <p className="text-xs text-neutral-400">No changes recorded.</p>
              )}
              {logs && logs.length > 0 && (
                <ul className="space-y-2">
                  {logs.map((log) => (
                    <li key={log.id} className="text-xs text-neutral-700">
                      <span className="font-medium">{log.summary}</span>
                      <span className="block text-[11px] text-neutral-400">
                        {log.actor.firstName} {log.actor.lastName} ·{" "}
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleSave} disabled={isPending || !hasChanges}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

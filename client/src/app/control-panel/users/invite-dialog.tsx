"use client";

import { useActionState, useEffect, useState, useMemo } from "react";
import { UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/select";
import AccessFields, {
  type AccessValue,
} from "@/components/control-panel/access-fields";
import type {
  OfficeRecord,
  ClusterRecord,
  CsoRecord,
  PermissionCatalog,
} from "@/lib/api";
import { getPermissionCatalog, inviteUser, type InviteState } from "./_actions";

const NCPC_UMBRELLA = "__umbrella__";

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offices: OfficeRecord[];
  csos: CsoRecord[];
  clusters: ClusterRecord[];
  currentUserRole: string;
}

export default function InviteDialog({
  open,
  onOpenChange,
  offices,
  csos,
  clusters,
  currentUserRole,
}: Readonly<InviteDialogProps>) {
  const [state, formAction, isPending] = useActionState<InviteState, FormData>(
    async (prevState: InviteState, formData: FormData) => {
      const result = await inviteUser(prevState, formData);
      if (result && "success" in result) {
        onOpenChange(false);
      }
      return result;
    },
    undefined,
  );
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [access, setAccess] = useState<AccessValue>({
    permissions: new Set(),
    allOffices: false,
    officeIds: new Set(),
  });
  const [role, setRole] = useState("STAFF");
  const [identityType, setIdentityType] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [civilSocietyOrganizationId, setCivilSocietyOrganizationId] =
    useState("");
  const isSuperAdminInvite = role === "SUPER_ADMIN";

  // External system → effect. The catalog is static, so one fetch per open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const res = await getPermissionCatalog();
      if (!cancelled && res.catalog) setCatalog(res.catalog);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);
  const canInviteSuperAdmin = currentUserRole === "SUPER_ADMIN";

  // Group offices by cluster name
  const officesByCluster = useMemo(() => {
    const map = new Map<string, OfficeRecord[]>();
    for (const office of offices) {
      const cluster = office.cluster.name;
      if (!map.has(cluster)) map.set(cluster, []);
      map.get(cluster)!.push(office);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [offices]);

  const needsOffice = identityType === "LGU" || identityType === "LFC";
  const isNcpc = identityType === "NCPC";

  // NCPC invites provision reviewers (#102): the umbrella head reads the whole
  // city, a CSO representative their CSO's cluster. Any active CSO qualifies —
  // `canEndorse` gated the archived endorsement step, not reading or commenting.
  const ncpcCsos = useMemo(() => csos.filter((c) => c.isActive), [csos]);

  function handleRoleChange(v: string | null) {
    const val = v ?? "STAFF";
    setRole(val);
    if (val === "SUPER_ADMIN") {
      setIdentityType("");
      setOfficeId("");
      setCivilSocietyOrganizationId("");
    }
  }

  // Reset org fields when identity type changes
  function handleIdentityChange(v: string | null) {
    const val = v ?? "";
    setIdentityType(val);
    setOfficeId("");
    setCivilSocietyOrganizationId("");
  }

  // CSO is optional for NCPC: an empty value designates the umbrella head.
  const canSubmit =
    (isSuperAdminInvite || !!identityType) &&
    (!needsOffice || !!officeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" />
            Invite User
          </DialogTitle>
          <DialogDescription>
            Send an invitation email to grant access to this portal.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="role" value={role} />
          {!isSuperAdminInvite && (
            <input type="hidden" name="identityType" value={identityType} />
          )}
          {needsOffice && (
            <input type="hidden" name="officeId" value={officeId} />
          )}
          {isNcpc && civilSocietyOrganizationId && (
            <input
              type="hidden"
              name="civilSocietyOrganizationId"
              value={civilSocietyOrganizationId}
            />
          )}
          {!isSuperAdminInvite && (
            <>
              <input
                type="hidden"
                name="permissions"
                value={JSON.stringify([...access.permissions])}
              />
              <input
                type="hidden"
                name="allOfficesScope"
                value={String(access.allOffices)}
              />
              <input
                type="hidden"
                name="officeScopeIds"
                value={JSON.stringify([...access.officeIds])}
              />
            </>
          )}

          <div className={isSuperAdminInvite ? "grid gap-3" : "grid grid-cols-2 gap-3"}>
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-neutral-700"
                htmlFor="firstName"
              >
                First name
              </label>
              <Input
                id="firstName"
                name="firstName"
                placeholder="Juan"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-neutral-700"
                htmlFor="lastName"
              >
                Last name
              </label>
              <Input
                id="lastName"
                name="lastName"
                placeholder="Dela Cruz"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-neutral-700"
              htmlFor="email"
            >
              Email address
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="juan@example.gov.ph"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">
                Role
              </label>
              <Select value={role} onValueChange={handleRoleChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="HEAD">Head</SelectItem>
                  {canInviteSuperAdmin && (
                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {!isSuperAdminInvite && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-700">
                  Identity type
                </label>
                <Select value={identityType} onValueChange={handleIdentityChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LGU">LGU</SelectItem>
                    <SelectItem value="LFC">LFC</SelectItem>
                    <SelectItem value="NCPC">NCPC</SelectItem>
                    <SelectItem value="DEVELOPER">Developer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {needsOffice && (
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

          {isNcpc && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700">
                NCPC organization
              </label>
              <Select
                value={civilSocietyOrganizationId || NCPC_UMBRELLA}
                onValueChange={(v) =>
                  setCivilSocietyOrganizationId(
                    !v || v === NCPC_UMBRELLA ? "" : v,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NCPC_UMBRELLA}>
                    NCPC umbrella head (no CSO)
                  </SelectItem>
                  {ncpcCsos.map((cso) => (
                    <SelectItem key={cso.id} value={cso.id}>
                      {cso.name}
                      {cso.code ? ` (${cso.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-neutral-500">
                The umbrella head reviews the whole LGU&apos;s AIP; a CSO
                representative reviews the programs of their CSO&apos;s cluster.
              </p>
            </div>
          )}

          {isSuperAdminInvite ? (
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              Super Admins bypass permission and office-scope checks, so there is
              nothing to grant here.
            </p>
          ) : (
            <div className="space-y-2 border-t pt-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">
                  Access
                </h3>
                <p className="text-xs text-neutral-500">
                  What they can do, and whose AIP records they can do it to. Both
                  must allow an action. Applied when they accept the invitation —
                  you can change it any time afterwards.
                </p>
              </div>
              {/* No inner scroll region: the dialog itself scrolls now, and two
                  nested scrollbars made the access list hard to get out of. */}
              <AccessFields
                catalog={catalog}
                clusters={clusters}
                value={access}
                onChange={setAccess}
              />
              {access.permissions.size === 0 && (
                <p className="text-xs text-amber-700">
                  No permissions selected — this account will be able to sign in
                  but not see or do anything until you grant some.
                </p>
              )}
            </div>
          )}

          {state && "error" in state && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isPending || !canSubmit}>
              {isPending ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

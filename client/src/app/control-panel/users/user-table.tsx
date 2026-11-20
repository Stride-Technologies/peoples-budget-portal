'use client';

import { useState, useTransition } from 'react';
import { UserPlus, RotateCcw, X, Pencil, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  UserRecord,
  OfficeRecord,
  ClusterRecord,
  CsoRecord,
} from '@/lib/api';
import { resendInvite, revokeInvite } from './_actions';
import InviteDialog from './invite-dialog';
import EditDialog from './edit-dialog';
import GrantsDialog from './grants-dialog';

function formatRole(role: string) {
  return role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function getUserStatus(
  user: UserRecord,
): 'active' | 'inactive' | 'pending' | 'expired' {
  if (user.isEmailVerified) return user.isActive ? 'active' : 'inactive';
  if (user.userInvites.length > 0) {
    const hasValid = user.userInvites.some(
      (inv) => new Date(inv.expiresAt) > new Date(),
    );
    return hasValid ? 'pending' : 'expired';
  }
  return 'expired';
}

const statusConfig = {
  active: { label: 'Active', variant: 'default' as const },
  inactive: { label: 'Deactivated', variant: 'destructive' as const },
  pending: { label: 'Pending', variant: 'secondary' as const },
  expired: { label: 'Expired', variant: 'outline' as const },
};

interface UserTableProps {
  users: UserRecord[];
  offices: OfficeRecord[];
  csos: CsoRecord[];
  clusters: ClusterRecord[];
  currentUserRole: string;
}

export default function UserTable({
  users,
  offices,
  csos,
  clusters,
  currentUserRole,
}: Readonly<UserTableProps>) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [grantsOpen, setGrantsOpen] = useState(false);
  const [grantsUser, setGrantsUser] = useState<UserRecord | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openInvite() {
    setInviteKey((k) => k + 1);
    setInviteOpen(true);
  }

  function openEdit(user: UserRecord) {
    setEditUser(user);
    setEditOpen(true);
  }

  function handleResend(userId: string) {
    setRowError(null);
    setActionId(userId + '-resend');
    startTransition(async () => {
      const result = await resendInvite(userId);
      setActionId(null);
      if (result.error) setRowError(result.error);
    });
  }

  function handleRevoke(userId: string) {
    setRowError(null);
    setActionId(userId + '-revoke');
    startTransition(async () => {
      const result = await revokeInvite(userId);
      setActionId(null);
      if (result.error) setRowError(result.error);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        {rowError && (
          <p className="text-sm text-red-600">{rowError}</p>
        )}
        <div className="ml-auto">
          <Button onClick={openInvite} size="sm" className="gap-1.5">
            <UserPlus className="w-4 h-4" />
            Invite user
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Identity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-neutral-400">
                  No users yet. Invite someone to get started.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const status = getUserStatus(user);
                const { label, variant } = statusConfig[status];
                const hasInvite = user.userInvites.length > 0 && !user.isEmailVerified;
                const canEdit = user.isEmailVerified && user.role !== 'SUPER_ADMIN';
                const isResending = actionId === user.id + '-resend' && isPending;
                const isRevoking = actionId === user.id + '-revoke' && isPending;

                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-neutral-900">
                      {user.firstName} {user.lastName}
                    </TableCell>
                    <TableCell className="text-neutral-600">{user.email}</TableCell>
                    <TableCell>{formatRole(user.role)}</TableCell>
                    <TableCell>
                      {user.identityType === 'DEVELOPER' ? 'Developer' : (user.identityType ?? '—')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={variant}>{label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Edit user"
                            onClick={() => openEdit(user)}
                          >
                            <Pencil />
                            <span className="sr-only">Edit</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setGrantsUser(user);
                            setGrantsOpen(true);
                          }}
                          title="Permissions & office scope"
                        >
                          <KeyRound />
                          <span className="sr-only">
                            Permissions and office scope
                          </span>
                        </Button>
                        {hasInvite && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Resend invitation"
                              disabled={isPending}
                              onClick={() => handleResend(user.id)}
                            >
                              <RotateCcw className={isResending ? 'animate-spin' : ''} />
                              <span className="sr-only">Resend</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Revoke invitation"
                              disabled={isPending}
                              onClick={() => handleRevoke(user.id)}
                            >
                              <X className={isRevoking ? 'opacity-50' : ''} />
                              <span className="sr-only">Revoke</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <InviteDialog
        key={inviteKey}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        offices={offices}
        csos={csos}
        clusters={clusters}
        currentUserRole={currentUserRole}
      />

      {editUser && (
        <EditDialog
          key={editUser.id}
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditUser(null);
          }}
          user={editUser}
          offices={offices}
          currentUserRole={currentUserRole}
        />
      )}

      {grantsUser && (
        <GrantsDialog
          key={grantsUser.id}
          open={grantsOpen}
          onOpenChange={(open) => {
            setGrantsOpen(open);
            if (!open) setGrantsUser(null);
          }}
          user={grantsUser}
          clusters={clusters}
        />
      )}
    </>
  );
}

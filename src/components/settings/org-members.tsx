'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, Mail, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  inviteMember,
  cancelInvitation,
  updateMemberRole,
  removeMember,
} from '@/app/actions/members';

interface Member {
  id: string;
  email: string;
  fullName: string | null;
  role: string | null;
  createdAt: Date | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  createdAt: Date | null;
}

interface OrgMembersProps {
  members: Member[];
  invitations: Invitation[];
  currentUserId: string;
  currentUserRole: string;
}

export function OrgMembers({
  members: initialMembers,
  invitations: initialInvitations,
  currentUserId,
  currentUserRole,
}: OrgMembersProps) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('member');
  const [isPending, startTransition] = useTransition();
  const [confirmProps, showConfirm] = useConfirmDialog();

  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'admin' || isOwner;

  function handleInvite() {
    if (!inviteEmail.trim()) return;

    startTransition(async () => {
      const result = await inviteMember({ email: inviteEmail.trim(), role: inviteRole });
      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.emailSent === false) {
          toast.warning(`Invitation created, but the email to ${inviteEmail} could not be sent.`);
        } else {
          toast.success(`Invitation sent to ${inviteEmail}`);
        }
        setInviteEmail('');
        setInviteRole('member');
        if (result.invitation) {
          setInvitations(prev => [...prev, result.invitation as Invitation]);
        }
      }
    });
  }

  function handleCancelInvitation(invitationId: string) {
    startTransition(async () => {
      const result = await cancelInvitation(invitationId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Invitation canceled');
        setInvitations(prev => prev.filter(i => i.id !== invitationId));
      }
    });
  }

  function handleRoleChange(userId: string, newRole: string) {
    startTransition(async () => {
      const result = await updateMemberRole({ userId, role: newRole });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Role updated');
        setMembers(prev =>
          prev.map(m => (m.id === userId ? { ...m, role: newRole } : m))
        );
      }
    });
  }

  function handleRemoveMember(userId: string, name: string) {
    showConfirm({
      title: 'Remove Member',
      description: `Remove ${name} from the organization? They will lose all access.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        const result = await removeMember(userId);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success('Member removed');
          setMembers(prev => prev.filter(m => m.id !== userId));
        }
      },
    });
  }

  const roleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'owner': return 'default' as const;
      case 'admin': return 'secondary' as const;
      default: return 'outline' as const;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Organization Members
        </CardTitle>
        <CardDescription>
          Manage who has access to your organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Invite Form */}
        {isAdmin && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor="invite-email" className="text-sm font-medium mb-1 block">
                Invite by email
              </label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              />
            </div>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="w-[120px]" aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleInvite} disabled={isPending || !inviteEmail.trim()}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite
            </Button>
          </div>
        )}

        {/* Pending Invitations */}
        {isAdmin && invitations.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Pending Invitations</h4>
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{inv.email}</span>
                    <Badge variant="outline">{inv.role}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelInvitation(inv.id)}
                    disabled={isPending}
                    aria-label={`Cancel invitation for ${inv.email}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              {isAdmin && <TableHead className="w-[100px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isCurrentUser = member.id === currentUserId;
              const isMemberOwner = member.role === 'owner';

              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {member.fullName || 'Unnamed'}
                        {isCurrentUser && (
                          <span className="text-muted-foreground ml-1">(you)</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">{member.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isOwner && !isCurrentUser && !isMemberOwner ? (
                      <Select
                        value={member.role || 'member'}
                        onValueChange={(val) => handleRoleChange(member.id, val)}
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-[120px]" aria-label={`Role for ${member.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={roleBadgeVariant(member.role)}>
                        {member.role || 'member'}
                      </Badge>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {!isCurrentUser && !isMemberOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleRemoveMember(member.id, member.fullName || member.email)
                          }
                          disabled={isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <ConfirmDialog {...confirmProps} />
    </Card>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getLoginUrl } from '@/lib/config/storage';
import { Users, Plus, Search, MoreHorizontal, UserCheck, UserX, Trash2, Pencil, ChevronRight, ChevronDown, HardDrive, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { logger } from '@/lib/utils';
import { PageShell, PageHeader, PageBody } from '@/components/ui/page-shell';

interface WorkspaceInfo {
  id: string;
  name: string;
  owner_id: string;
  max_projects: number;
  max_deployments: number;
  max_storage_mb: number;
  role: string;
  created_at: string;
  updated_at: string;
}

interface UserInfo {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  active: boolean;
  workspaces: WorkspaceInfo[];
  projectCount: number;
  storageMb: number;
  lastActive: string | null;
  createdAt: string;
  updatedAt: string;
}


export function UsersView() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editUser, setEditUser] = useState<UserInfo | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    displayName: '',
    isAdmin: false,
    active: true,
    password: '',
  });
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Create form state
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    displayName: '',
    workspaceAssignment: 'new' as 'new' | 'existing' | 'none',
    workspaceId: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  const [availableWorkspaces, setAvailableWorkspaces] = useState<Array<{ id: string; name: string }>>([]);

  // Workspace grant state (in edit dialog)
  const [grantWorkspaceId, setGrantWorkspaceId] = useState('');
  const [grantRole, setGrantRole] = useState<'owner' | 'editor' | 'viewer'>('editor');
  const [grantingAccess, setGrantingAccess] = useState(false);

  // Expandable workspace detail state
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';
  const externalIdentity = !!process.env.NEXT_PUBLIC_GATEWAY_URL;

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (showCreateDialog || showEditDialog) {
      fetch('/api/admin/workspaces')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.workspaces) {
            setAvailableWorkspaces(data.workspaces.map((w: { id: string; name: string }) => ({ id: w.id, name: w.name })));
          }
        })
        .catch(() => {});
    }
  }, [showCreateDialog, showEditDialog]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401) {
        window.location.href = getLoginUrl();
        return;
      }
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data.users);
    } catch (err) {
      logger.error('[UsersView] Failed to load users:', err);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (user: UserInfo) => {
    setEditUser(user);
    setEditForm({
      displayName: user.displayName || '',
      isAdmin: user.isAdmin,
      active: user.active,
      password: '',
    });
    setShowEditPassword(false);
    setGrantWorkspaceId('');
    setGrantRole('editor');
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    if (editForm.password && editForm.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        displayName: editForm.displayName || undefined,
        active: editForm.active,
      };
      if (editForm.isAdmin !== editUser.isAdmin) {
        body.isAdmin = editForm.isAdmin;
      }
      if (editForm.password) {
        body.password = editForm.password;
      }
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update user');
      }
      toast.success('User updated');
      setShowEditDialog(false);
      setEditUser(null);
      await loadUsers();
    } catch (err) {
      logger.error('[UsersView] Failed to update user:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeRole = async (workspaceId: string, newRole: string) => {
    if (!editUser) return;
    try {
      const res = await fetch(`/api/admin/workspaces/${workspaceId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editUser.id, role: newRole }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to change role');
      }
      toast.success('Role updated');
      await loadUsers();
      const updated = (await (await fetch('/api/admin/users')).json()).users as UserInfo[];
      const refreshed = updated.find(u => u.id === editUser.id);
      if (refreshed) setEditUser(refreshed);
    } catch (err) {
      logger.error('[UsersView] Failed to change role:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to change role');
    }
  };

  const handleRevokeAccess = async (workspaceId: string) => {
    if (!editUser) return;
    try {
      const res = await fetch(`/api/admin/workspaces/${workspaceId}/access`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editUser.id }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to revoke access');
      }
      toast.success('Access revoked');
      await loadUsers();
      const updated = (await (await fetch('/api/admin/users')).json()).users as UserInfo[];
      const refreshed = updated.find(u => u.id === editUser.id);
      if (refreshed) setEditUser(refreshed);
    } catch (err) {
      logger.error('[UsersView] Failed to revoke access:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to revoke access');
    }
  };

  const handleGrantAccess = async () => {
    if (!editUser || !grantWorkspaceId) return;
    setGrantingAccess(true);
    try {
      const res = await fetch(`/api/admin/workspaces/${grantWorkspaceId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editUser.id, role: grantRole }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to grant access');
      }
      toast.success('Access granted');
      setGrantWorkspaceId('');
      setGrantRole('editor');
      await loadUsers();
      const updated = (await (await fetch('/api/admin/users')).json()).users as UserInfo[];
      const refreshed = updated.find(u => u.id === editUser.id);
      if (refreshed) setEditUser(refreshed);
    } catch (err) {
      logger.error('[UsersView] Failed to grant access:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to grant access');
    } finally {
      setGrantingAccess(false);
    }
  };

  const handleToggleActive = async (user: UserInfo) => {
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update user');
      }
      toast.success(user.active ? 'User deactivated' : 'User reactivated');
      await loadUsers();
    } catch (err) {
      logger.error('[UsersView] Failed to toggle user status:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleDelete = async (user: UserInfo) => {
    if (!confirm(`Deactivate user "${user.email}"? This will soft-delete their account.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete user');
      }
      toast.success('User deactivated');
      await loadUsers();
    } catch (err) {
      logger.error('[UsersView] Failed to delete user:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password) {
      toast.error('Email and password are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          displayName: createForm.displayName || undefined,
          workspaceAssignment: createForm.workspaceAssignment,
          workspaceId: createForm.workspaceId || undefined,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create user');
      }
      toast.success('User created');
      setShowCreateDialog(false);
      setCreateForm({ email: '', password: '', displayName: '', workspaceAssignment: 'new', workspaceId: '' });
      setShowPassword(false);
      await loadUsers();
    } catch (err) {
      logger.error('[UsersView] Failed to create user:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleExpand = (userId: string) => {
    setExpandedUserId(expandedUserId === userId ? null : userId);
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      user =>
        user.email.toLowerCase().includes(query) ||
        user.displayName?.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const roleBadgeVariant = (role: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (role) {
      case 'owner': return 'default';
      case 'editor': return 'secondary';
      default: return 'outline';
    }
  };

  // Workspaces the edit user does NOT already have access to
  const grantableWorkspaces = useMemo(() => {
    if (!editUser) return [];
    const existingIds = new Set(editUser.workspaces.map(ws => ws.id));
    return availableWorkspaces.filter(ws => !existingIds.has(ws.id));
  }, [editUser, availableWorkspaces]);

  if (!isServerMode) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>User management is only available in Server Mode</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size={48} color="#f97316" className="mx-auto" />
          <p className="mt-4">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageShell>
        <PageHeader title="Users">
          {!externalIdentity && (
            <div className="flex items-center shrink-0">
              <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                <span>New User</span>
              </Button>
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {externalIdentity && (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Users are managed externally
              </p>
            </div>
          )}
        </PageHeader>

        {/* User List */}
        <PageBody fill>
            {filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-16 w-16 text-muted-foreground mb-4" />
                {users.length === 0 ? (
                  <>
                    <h2 className="text-xl font-semibold mb-2">No Users Yet</h2>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Create your first user by clicking the &quot;New User&quot; button above.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold mb-2">No users found</h2>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Try adjusting your search criteria
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="@container flex-1 min-h-0 overflow-auto border rounded-lg">
                <table className="w-full table-auto border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="bg-muted p-[6px_10px] border-b select-none"></th>
                      <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none w-full">User</th>
                      <th className="@max-5xl:hidden bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Projects</th>
                      <th className="@max-5xl:hidden bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Storage</th>
                      <th className="@max-5xl:hidden bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Workspaces</th>
                      <th className="@max-5xl:hidden bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Active</th>
                      <th className="bg-muted p-[6px_10px] border-b select-none"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const isExpanded = expandedUserId === user.id;
                      return (
                        <React.Fragment key={user.id}>
                          <tr
                            className="border-b border-border/50 hover:bg-muted/50 cursor-pointer h-[44px]"
                            onClick={() => handleToggleExpand(user.id)}
                          >
                            <td className="p-[4px_10px] align-middle text-muted-foreground">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </td>
                            <td className="w-full p-[4px_10px] text-[13px] align-middle overflow-hidden" style={{ maxWidth: 0 }}>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-medium text-foreground text-[13px] truncate">{user.email}</span>
                                  {user.isAdmin && <Badge variant="destructive" className="text-[10px] shrink-0">admin</Badge>}
                                  {!user.active && <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">inactive</Badge>}
                                </div>
                                {user.displayName && <span className="block text-[11px] text-muted-foreground truncate">{user.displayName}</span>}
                              </div>
                            </td>
                            <td className="@max-5xl:hidden p-[4px_10px] text-[13px] text-muted-foreground align-middle whitespace-nowrap tabular-nums">{user.projectCount}</td>
                            <td className="@max-5xl:hidden p-[4px_10px] text-[13px] text-muted-foreground align-middle whitespace-nowrap tabular-nums">{user.storageMb} MB</td>
                            <td className="@max-5xl:hidden p-[4px_10px] text-[13px] text-muted-foreground align-middle whitespace-nowrap tabular-nums">{user.workspaces.length}</td>
                            <td className="@max-5xl:hidden p-[4px_10px] text-[13px] text-muted-foreground align-middle whitespace-nowrap">{user.lastActive ? formatDate(user.lastActive) : formatDate(user.createdAt)}</td>
                            <td className="p-[4px_10px] align-middle whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="xs" className="px-1">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleOpenEdit(user)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                                    {user.active ? (
                                      <>
                                        <UserX className="h-4 w-4 mr-2" />
                                        Deactivate
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck className="h-4 w-4 mr-2" />
                                        Reactivate
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(user)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-muted/30 border-b border-border/50">
                              <td></td>
                              <td colSpan={6} className="p-[4px_10px] pb-4 align-top">
                                {/* The stats the row drops at narrow widths. Shown only there, so the
                                    expanded panel does not repeat columns that are already on screen,
                                    and the figures stay reachable rather than disappearing with the
                                    columns. */}
                                <div className="@5xl:hidden mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
                                  <span>Projects <span className="text-foreground tabular-nums">{user.projectCount}</span></span>
                                  <span>Storage <span className="text-foreground tabular-nums">{user.storageMb} MB</span></span>
                                  <span>Workspaces <span className="text-foreground tabular-nums">{user.workspaces.length}</span></span>
                                  <span>Active <span className="text-foreground">{user.lastActive ? formatDate(user.lastActive) : formatDate(user.createdAt)}</span></span>
                                </div>
                                {user.workspaces.length > 0 ? (
                                  <div className="space-y-2">
                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                                      Workspaces ({user.workspaces.length})
                                    </div>
                                    {user.workspaces.map((ws) => (
                                      <div
                                        key={ws.id}
                                        className="flex items-center gap-3 text-sm p-2 rounded bg-background/60"
                                      >
                                        <HardDrive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <span className="font-medium truncate">{ws.name}</span>
                                          <Badge variant={roleBadgeVariant(ws.role)} className="text-[10px] shrink-0">{ws.role}</Badge>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                                          <span>{ws.max_projects} projects</span>
                                          <span>{ws.max_deployments} deployments</span>
                                          <span>Created {formatDate(ws.created_at)}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground py-2">
                                    No workspaces assigned
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </PageBody>
      </PageShell>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setEditUser(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Email</Label>
              <div className="text-sm font-medium">{editUser?.email}</div>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-displayName">Display Name</Label>
              <Input
                id="edit-displayName"
                value={editForm.displayName}
                onChange={(e) => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                placeholder="Display name"
              />
            </div>

            {/* Admin + Active toggles */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-admin"
                  checked={editForm.isAdmin}
                  onCheckedChange={(checked) => setEditForm(f => ({ ...f, isAdmin: checked }))}
                />
                <Label htmlFor="edit-admin">Admin</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-active"
                  checked={editForm.active}
                  onCheckedChange={(checked) => setEditForm(f => ({ ...f, active: checked }))}
                />
                <Label htmlFor="edit-active">Active</Label>
              </div>
            </div>

            {/* Password Reset */}
            {!externalIdentity && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-password">Reset Password</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                    onClick={() => {
                      const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
                      let pw = '';
                      const rng = new Uint32Array(16); crypto.getRandomValues(rng);
                      for (let i = 0; i < 16; i++) pw += chars[rng[i] % chars.length];
                      setEditForm(f => ({ ...f, password: pw }));
                      setShowEditPassword(true);
                    }}
                  >
                    Generate
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="edit-password"
                    type={showEditPassword ? 'text' : 'password'}
                    value={editForm.password}
                    onChange={(e) => setEditForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Leave blank to keep current"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {editForm.password && editForm.password.length > 0 && editForm.password.length < 8 && (
                  <p className="text-xs text-destructive">Minimum 8 characters</p>
                )}
              </div>
            )}

            {/* Workspace Memberships */}
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Workspaces ({editUser?.workspaces.length ?? 0})
              </div>
              {editUser && editUser.workspaces.length > 0 ? (
                <div className="space-y-1.5">
                  {editUser.workspaces.map((ws) => (
                    <div
                      key={ws.id}
                      className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50"
                    >
                      <span className="flex-1 min-w-0 truncate font-medium">{ws.name}</span>
                      <Select
                        value={ws.role}
                        onValueChange={(value) => handleChangeRole(ws.id, value)}
                      >
                        <SelectTrigger className="w-24 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">viewer</SelectItem>
                          <SelectItem value="editor">editor</SelectItem>
                          <SelectItem value="owner">owner</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRevokeAccess(ws.id)}
                        title="Revoke access"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No workspaces assigned</div>
              )}

              {/* Grant access to another workspace */}
              {grantableWorkspaces.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select value={grantWorkspaceId} onValueChange={setGrantWorkspaceId}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue placeholder="Add to workspace..." />
                    </SelectTrigger>
                    <SelectContent>
                      {grantableWorkspaces.map(ws => (
                        <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={grantRole} onValueChange={(v) => setGrantRole(v as 'owner' | 'editor' | 'viewer')}>
                    <SelectTrigger className="w-24 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">viewer</SelectItem>
                      <SelectItem value="editor">editor</SelectItem>
                      <SelectItem value="owner">owner</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    disabled={!grantWorkspaceId || grantingAccess}
                    onClick={handleGrantAccess}
                  >
                    {grantingAccess ? '...' : 'Grant'}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditUser(null); }}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="create-password">Password</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                  onClick={() => {
                    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
                    let pw = '';
                    const rng = new Uint32Array(16); crypto.getRandomValues(rng);
                    for (let i = 0; i < 16; i++) pw += chars[rng[i] % chars.length];
                    setCreateForm(f => ({ ...f, password: pw }));
                    setShowPassword(true);
                  }}
                >
                  Generate
                </button>
              </div>
              <div className="relative">
                <Input
                  id="create-password"
                  type={showPassword ? 'text' : 'password'}
                  value={createForm.password}
                  onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Minimum 8 characters"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-displayName">Display Name</Label>
              <Input
                id="create-displayName"
                value={createForm.displayName}
                onChange={(e) => setCreateForm(f => ({ ...f, displayName: e.target.value }))}
                placeholder="Display name (optional)"
              />
            </div>

            {/* Workspace Assignment */}
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Select
                value={createForm.workspaceAssignment}
                onValueChange={(value) => setCreateForm(f => ({
                  ...f,
                  workspaceAssignment: value as 'new' | 'existing' | 'none',
                  workspaceId: '',
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Create new workspace</SelectItem>
                  <SelectItem value="existing">Assign to existing workspace</SelectItem>
                  <SelectItem value="none">No workspace</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {createForm.workspaceAssignment === 'existing' && (
              <div className="space-y-2">
                <Label>Select Workspace</Label>
                <Select
                  value={createForm.workspaceId}
                  onValueChange={(value) => setCreateForm(f => ({ ...f, workspaceId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a workspace..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWorkspaces.map(ws => (
                      <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

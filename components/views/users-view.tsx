'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
    active: true,
  });

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

  // Expandable workspace detail state
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (showCreateDialog) {
      fetch('/api/admin/workspaces')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.workspaces) {
            setAvailableWorkspaces(data.workspaces.map((w: { id: string; name: string }) => ({ id: w.id, name: w.name })));
          }
        })
        .catch(() => {});
    }
  }, [showCreateDialog]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401) {
        window.location.href = '/admin/login';
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
      active: user.active,
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editForm.displayName || undefined,
          active: editForm.active,
        }),
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
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="pt-4 px-4 pb-3 sm:pt-6 sm:px-6 sm:pb-3 shrink-0">
          <div className="mx-auto max-w-7xl flex flex-col sm:flex-row gap-3">
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

            {/* Controls */}
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                <span>New User</span>
              </Button>
            </div>
          </div>
        </div>

        {/* User List */}
        <div className="flex-1 px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6 overflow-auto">
          <div className="mx-auto max-w-7xl">
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
              <div className="space-y-2">
                {filteredUsers.map((user) => {
                  const isExpanded = expandedUserId === user.id;
                  return (
                    <div key={user.id} className="rounded-lg border bg-card overflow-hidden">
                      <div
                        className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => handleToggleExpand(user.id)}
                      >
                        {/* Expand chevron */}
                        <div className="shrink-0 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{user.email}</span>
                            {user.isAdmin && (
                              <Badge variant="destructive" className="text-xs">admin</Badge>
                            )}
                            {!user.active && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">inactive</Badge>
                            )}
                            {user.workspaces.map(ws => (
                              <Badge key={ws.id} variant={roleBadgeVariant(ws.role)} className="text-xs">
                                {ws.name} ({ws.role})
                              </Badge>
                            ))}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                            {user.displayName && (
                              <span>{user.displayName}</span>
                            )}
                            <span>{user.projectCount} projects</span>
                            <span>
                              <HardDrive className="inline h-3 w-3 mr-0.5 relative -top-px" />
                              {user.storageMb} MB
                            </span>
                            {user.lastActive ? (
                              <span>Active {formatDate(user.lastActive)}</span>
                            ) : (
                              <span>Created {formatDate(user.createdAt)}</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
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
                      </div>

                      {/* Expanded workspace details */}
                      {isExpanded && (
                        <div className="border-t bg-muted/30 px-4 py-3 pl-12">
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
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium truncate">{ws.name}</span>
                                    </div>
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
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setEditUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-displayName">Display Name</Label>
              <Input
                id="edit-displayName"
                value={editForm.displayName}
                onChange={(e) => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                placeholder="Display name"
              />
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

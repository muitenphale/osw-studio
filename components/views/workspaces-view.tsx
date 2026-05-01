'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getLoginUrl } from '@/lib/config/storage';
import {
  Building2,
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Pencil,
  ChevronRight,
  ChevronDown,
  UserPlus,
  UserMinus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { logger } from '@/lib/utils';

interface WorkspaceMember {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  joinedAt: string;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
  maxProjects: number;
  maxDeployments: number;
  maxStorageMb: number;
  memberCount: number;
  projectCount: number;
  deploymentCount: number;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceDetail extends WorkspaceInfo {
  members: WorkspaceMember[];
}

export function WorkspacesView() {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [editWorkspace, setEditWorkspace] = useState<WorkspaceInfo | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    maxProjects: 3,
    maxDeployments: 1,
    maxStorageMb: 100,
  });

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    ownerEmail: '',
  });

  // Expand / member detail
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workspaceDetail, setWorkspaceDetail] = useState<WorkspaceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add member dialog
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [addMemberForm, setAddMemberForm] = useState({ email: '', role: 'editor' });
  const [addingMember, setAddingMember] = useState(false);

  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/workspaces');
      if (res.status === 401) {
        window.location.href = getLoginUrl();
        return;
      }
      if (!res.ok) throw new Error('Failed to load workspaces');
      const data = await res.json();
      setWorkspaces(data.workspaces);
    } catch (err) {
      logger.error('[WorkspacesView] Failed to load workspaces:', err);
      toast.error('Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (ws: WorkspaceInfo) => {
    setEditWorkspace(ws);
    setEditForm({
      name: ws.name,
      maxProjects: ws.maxProjects,
      maxDeployments: ws.maxDeployments,
      maxStorageMb: ws.maxStorageMb,
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editWorkspace) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/workspaces/${editWorkspace.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name || undefined,
          maxProjects: editForm.maxProjects,
          maxDeployments: editForm.maxDeployments,
          maxStorageMb: editForm.maxStorageMb,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update workspace');
      }
      toast.success('Workspace updated');
      setShowEditDialog(false);
      setEditWorkspace(null);
      await loadWorkspaces();
      // Refresh detail if expanded
      if (expandedId === editWorkspace.id) {
        await loadDetail(editWorkspace.id);
      }
    } catch (err) {
      logger.error('[WorkspacesView] Failed to update workspace:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update workspace');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.name || !createForm.ownerEmail) {
      toast.error('Workspace name and owner email are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          ownerEmail: createForm.ownerEmail,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create workspace');
      }
      toast.success('Workspace created');
      setShowCreateDialog(false);
      setCreateForm({ name: '', ownerEmail: '' });
      await loadWorkspaces();
    } catch (err) {
      logger.error('[WorkspacesView] Failed to create workspace:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ws: WorkspaceInfo) => {
    if (!confirm(`Delete workspace "${ws.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/workspaces/${ws.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete workspace');
      }
      toast.success('Workspace deleted');
      if (expandedId === ws.id) {
        setExpandedId(null);
        setWorkspaceDetail(null);
      }
      await loadWorkspaces();
    } catch (err) {
      logger.error('[WorkspacesView] Failed to delete workspace:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete workspace');
    }
  };

  const loadDetail = async (wsId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/workspaces/${wsId}`);
      if (!res.ok) throw new Error('Failed to load workspace details');
      const data = await res.json();
      setWorkspaceDetail(data);
    } catch (err) {
      logger.error('[WorkspacesView] Failed to load workspace details:', err);
      toast.error('Failed to load workspace details');
      setExpandedId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleToggleExpand = async (wsId: string) => {
    if (expandedId === wsId) {
      setExpandedId(null);
      setWorkspaceDetail(null);
      return;
    }
    setExpandedId(wsId);
    await loadDetail(wsId);
  };

  const handleAddMember = async () => {
    if (!expandedId || !addMemberForm.email) {
      toast.error('Email is required');
      return;
    }
    setAddingMember(true);
    try {
      const res = await fetch(`/api/admin/workspaces/${expandedId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addMemberForm.email, role: addMemberForm.role }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to add member');
      }
      toast.success('Member added');
      setShowAddMemberDialog(false);
      setAddMemberForm({ email: '', role: 'editor' });
      await loadDetail(expandedId);
      await loadWorkspaces();
    } catch (err) {
      logger.error('[WorkspacesView] Failed to add member:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (wsId: string, userId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from this workspace?`)) return;
    try {
      const res = await fetch(`/api/admin/workspaces/${wsId}/access`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to remove member');
      }
      toast.success('Member removed');
      await loadDetail(wsId);
      await loadWorkspaces();
    } catch (err) {
      logger.error('[WorkspacesView] Failed to remove member:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const filteredWorkspaces = useMemo(() => {
    if (!searchQuery) return workspaces;
    const query = searchQuery.toLowerCase();
    return workspaces.filter(
      ws =>
        ws.name.toLowerCase().includes(query) ||
        ws.ownerEmail?.toLowerCase().includes(query)
    );
  }, [workspaces, searchQuery]);

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

  const roleBadgeVariant = (role: string): 'default' | 'secondary' | 'outline' => {
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
          <p>Workspace management is only available in Server Mode</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size={48} color="#f97316" className="mx-auto" />
          <p className="mt-4">Loading workspaces...</p>
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
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search workspaces..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                <span>New Workspace</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Workspace List */}
        <div className="flex-1 px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6 overflow-auto">
          <div className="mx-auto max-w-7xl">
            {filteredWorkspaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
                {workspaces.length === 0 ? (
                  <>
                    <h2 className="text-xl font-semibold mb-2">No Workspaces Yet</h2>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Create your first workspace by clicking the &quot;New Workspace&quot; button above.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold mb-2">No workspaces found</h2>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Try adjusting your search criteria
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredWorkspaces.map((ws) => {
                  const isExpanded = expandedId === ws.id;
                  return (
                    <div key={ws.id} className="rounded-lg border bg-card overflow-hidden">
                      <div
                        className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => handleToggleExpand(ws.id)}
                      >
                        {/* Expand chevron */}
                        <div className="shrink-0 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>

                        {/* Workspace Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{ws.name}</span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                            {ws.ownerEmail && (
                              <span>Owner: {ws.ownerEmail}</span>
                            )}
                            <span>{ws.memberCount} {ws.memberCount === 1 ? 'member' : 'members'}</span>
                            <span>{ws.projectCount} {ws.projectCount === 1 ? 'project' : 'projects'}</span>
                            <span>Created {formatDate(ws.createdAt)}</span>
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
                            <DropdownMenuItem onClick={() => handleOpenEdit(ws)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(ws)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Expanded members section */}
                      {isExpanded && (
                        <div className="border-t bg-muted/30 px-4 py-3 pl-12">
                          {loadingDetail ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                              <Spinner size={16} color="#f97316" />
                              <span>Loading members...</span>
                            </div>
                          ) : workspaceDetail ? (
                            <div className="space-y-3">
                              {/* Stats row */}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>Max projects: {workspaceDetail.maxProjects}</span>
                                <span>Max deployments: {workspaceDetail.maxDeployments}</span>
                                <span>Max storage: {workspaceDetail.maxStorageMb} MB</span>
                                <span>Deployments: {workspaceDetail.deploymentCount}</span>
                              </div>

                              {/* Members */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Members ({workspaceDetail.members.length})
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowAddMemberDialog(true);
                                    }}
                                  >
                                    <UserPlus className="h-3 w-3" />
                                    Add Member
                                  </Button>
                                </div>
                                {workspaceDetail.members.length > 0 ? (
                                  <div className="space-y-1">
                                    {workspaceDetail.members.map((member) => (
                                      <div
                                        key={member.userId}
                                        className="flex items-center gap-3 text-sm p-2 rounded bg-background/60"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium truncate">{member.email}</span>
                                            <Badge variant={roleBadgeVariant(member.role)} className="text-xs">
                                              {member.role}
                                            </Badge>
                                          </div>
                                          {member.displayName && (
                                            <div className="text-xs text-muted-foreground">{member.displayName}</div>
                                          )}
                                        </div>
                                        <div className="text-xs text-muted-foreground shrink-0">
                                          {formatDate(member.joinedAt)}
                                        </div>
                                        {member.userId !== workspaceDetail.ownerId && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRemoveMember(ws.id, member.userId, member.email);
                                            }}
                                            title="Remove member"
                                          >
                                            <UserMinus className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground py-1">No members</div>
                                )}
                              </div>
                            </div>
                          ) : null}
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

      {/* Edit Workspace Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setEditWorkspace(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Workspace name"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-maxProjects">Max Projects</Label>
                <Input
                  id="edit-maxProjects"
                  type="number"
                  min={0}
                  value={editForm.maxProjects}
                  onChange={(e) => setEditForm(f => ({ ...f, maxProjects: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-maxDeployments">Max Deploys</Label>
                <Input
                  id="edit-maxDeployments"
                  type="number"
                  min={0}
                  value={editForm.maxDeployments}
                  onChange={(e) => setEditForm(f => ({ ...f, maxDeployments: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-maxStorage">Storage (MB)</Label>
                <Input
                  id="edit-maxStorage"
                  type="number"
                  min={0}
                  value={editForm.maxStorageMb}
                  onChange={(e) => setEditForm(f => ({ ...f, maxStorageMb: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditWorkspace(null); }}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Workspace Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Workspace name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-ownerEmail">Owner Email</Label>
              <Input
                id="create-ownerEmail"
                type="email"
                value={createForm.ownerEmail}
                onChange={(e) => setCreateForm(f => ({ ...f, ownerEmail: e.target.value }))}
                placeholder="owner@example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create Workspace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-member-email">User Email</Label>
              <Input
                id="add-member-email"
                type="email"
                value={addMemberForm.email}
                onChange={(e) => setAddMemberForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-member-role">Role</Label>
              <select
                id="add-member-role"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={addMemberForm.role}
                onChange={(e) => setAddMemberForm(f => ({ ...f, role: e.target.value }))}
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="owner">owner</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={addingMember}>
              {addingMember ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

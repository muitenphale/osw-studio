'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Skill, SkillGroup } from '@/lib/vfs/skills/types';
import { skillsService } from '@/lib/vfs/skills';
import { vfs } from '@/lib/vfs';
import { logger } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  Plus,
  Search,
  Download,
  Upload,
  Trash2,
  Edit,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Power,
  FolderTree,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { SkillEditor } from './SkillEditor';
import { usePagination } from '@/lib/hooks/use-pagination';
import { Pagination, PaginationRange } from '@/components/ui/pagination';

export function SkillsManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [groups, setGroups] = useState<SkillGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<Skill | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<SkillGroup | null>(null);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [evaluationEnabled, setEvaluationEnabled] = useState(false);
  const [enabledSkills, setEnabledSkills] = useState<Set<string>>(new Set());
  const [enabledGroups, setEnabledGroups] = useState<Set<string>>(new Set());
  const [showBuiltIn, setShowBuiltIn] = useState(true);
  const [showCustom, setShowCustom] = useState(true);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState<'create' | 'edit'>('create');
  const [groupBeingEdited, setGroupBeingEdited] = useState<SkillGroup | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [allSkills, allGroups] = await Promise.all([
        skillsService.getAllSkills(),
        skillsService.getAllGroups(),
      ]);
      setSkills(allSkills);
      setGroups(allGroups);
      await loadEnabledState(allSkills, allGroups);
    } catch (error) {
      logger.error('[SkillsManager] Failed to load skills/groups', error);
      toast.error('Failed to load skills');
    } finally {
      setLoading(false);
    }
  };

  const loadEnabledState = async (allSkills: Skill[], allGroups: SkillGroup[]) => {
    try {
      const isGlobalEnabled = await skillsService.isGloballyEnabled();
      setGlobalEnabled(isGlobalEnabled);
      const isEvalEnabled = await skillsService.isEvaluationEnabled();
      setEvaluationEnabled(isEvalEnabled);

      const enabled = new Set<string>();
      for (const skill of allSkills) {
        if (await skillsService.isSkillEnabled(skill.id)) enabled.add(skill.id);
      }
      setEnabledSkills(enabled);

      const enabledG = new Set<string>();
      for (const g of allGroups) {
        if (await skillsService.isGroupEnabled(g.id)) enabledG.add(g.id);
      }
      setEnabledGroups(enabledG);
    } catch (error) {
      logger.error('[SkillsManager] Failed to load enabled state', error);
    }
  };

  const handleGlobalToggle = async (enabled: boolean) => {
    try {
      await skillsService.setGlobalEnabled(enabled);
      setGlobalEnabled(enabled);
      await vfs.reloadTransientSkills();
      toast.success(enabled ? 'Skills enabled' : 'Skills disabled');
    } catch {
      toast.error('Failed to update skills state');
    }
  };

  const handleEvaluationToggle = async (enabled: boolean) => {
    try {
      await skillsService.setEvaluationEnabled(enabled);
      setEvaluationEnabled(enabled);
      toast.success(enabled ? 'Skill evaluation enabled' : 'Skill evaluation disabled');
    } catch {
      toast.error('Failed to update evaluation state');
    }
  };

  const handleBulkSkillToggle = async (skillIds: string[], enabled: boolean) => {
    if (skillIds.length === 0) {
      toast.error('No skills to update');
      return;
    }
    try {
      for (const id of skillIds) {
        if (enabled) await skillsService.enableSkill(id);
        else await skillsService.disableSkill(id);
      }
      setEnabledSkills(prev => {
        const next = new Set(prev);
        for (const id of skillIds) {
          if (enabled) next.add(id);
          else next.delete(id);
        }
        return next;
      });
      await vfs.reloadTransientSkills();
      toast.success(`${enabled ? 'Enabled' : 'Disabled'} ${skillIds.length} skill${skillIds.length === 1 ? '' : 's'}`);
    } catch {
      toast.error('Failed to update skills');
    }
  };

  const handleSkillToggle = async (skillId: string, enabled: boolean) => {
    try {
      if (enabled) {
        await skillsService.enableSkill(skillId);
        setEnabledSkills(prev => new Set([...prev, skillId]));
      } else {
        await skillsService.disableSkill(skillId);
        setEnabledSkills(prev => {
          const newSet = new Set(prev);
          newSet.delete(skillId);
          return newSet;
        });
      }
      await vfs.reloadTransientSkills();
    } catch {
      toast.error('Failed to toggle skill');
    }
  };

  const handleGroupToggle = async (groupId: string, enabled: boolean) => {
    try {
      if (enabled) {
        await skillsService.enableGroup(groupId);
        setEnabledGroups(prev => new Set([...prev, groupId]));
      } else {
        await skillsService.disableGroup(groupId);
        setEnabledGroups(prev => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      }
      await vfs.reloadTransientSkills();
    } catch {
      toast.error('Failed to toggle group');
    }
  };

  const handleCreateNew = () => {
    setSelectedSkill(null);
    setEditorMode('create');
  };

  const handleEdit = (skill: Skill) => {
    setSelectedSkill(skill);
    setEditorMode('edit');
  };

  const handleDelete = (skill: Skill) => {
    setSkillToDelete(skill);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (skillToDelete) {
      try {
        await skillsService.deleteSkill(skillToDelete.id);
        toast.success(`Deleted skill: ${skillToDelete.name}`);
        await loadAll();
        await vfs.reloadTransientSkills();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete skill';
        toast.error(message);
      } finally {
        setDeleteConfirmOpen(false);
        setSkillToDelete(null);
      }
    } else if (groupToDelete) {
      try {
        await skillsService.deleteGroup(groupToDelete.id);
        toast.success(`Deleted group: ${groupToDelete.name}`);
        await loadAll();
        await vfs.reloadTransientSkills();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete group';
        toast.error(message);
      } finally {
        setDeleteConfirmOpen(false);
        setGroupToDelete(null);
      }
    }
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.zip';
    input.multiple = false;

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        if (file.name.endsWith('.zip')) {
          const imported = await skillsService.importSkills(file);
          toast.success(`Imported ${imported.length} skill(s)`);
        } else {
          const skill = await skillsService.importSkillFile(file);
          toast.success(`Imported skill: ${skill.name}`);
        }
        await loadAll();
        await vfs.reloadTransientSkills();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import skill';
        toast.error(message);
      }
    };

    input.click();
  };

  const handleExportAll = async () => {
    try {
      const customSkills = skills.filter(s => !s.isBuiltIn);
      if (customSkills.length === 0) {
        toast.error('No custom skills to export');
        return;
      }

      const blob = await skillsService.exportSkills(customSkills.map(s => s.id));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `osw-skills-${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${customSkills.length} skill(s)`);
    } catch {
      toast.error('Failed to export skills');
    }
  };

  const handleEditorSave = async () => {
    setEditorMode(null);
    setSelectedSkill(null);
    await loadAll();
    await vfs.reloadTransientSkills();
  };

  const handleEditorCancel = () => {
    setEditorMode(null);
    setSelectedSkill(null);
  };

  const handleOpenCreateGroup = () => {
    setGroupDialogMode('create');
    setGroupBeingEdited(null);
    setGroupDialogOpen(true);
  };

  const handleEditGroup = (group: SkillGroup) => {
    setGroupDialogMode('edit');
    setGroupBeingEdited(group);
    setGroupDialogOpen(true);
  };

  const handleDeleteGroup = (group: SkillGroup) => {
    setGroupToDelete(group);
    setDeleteConfirmOpen(true);
  };

  const handleGroupDialogSave = async () => {
    setGroupDialogOpen(false);
    setGroupBeingEdited(null);
    await loadAll();
    await vfs.reloadTransientSkills();
  };

  // Map each skill to the groups it belongs to (for the "via group" badges)
  const skillToGroups = React.useMemo(() => {
    const map = new Map<string, SkillGroup[]>();
    for (const group of groups) {
      for (const memberId of group.memberIds) {
        const arr = map.get(memberId) ?? [];
        arr.push(group);
        map.set(memberId, arr);
      }
    }
    return map;
  }, [groups]);

  const filteredSkills = skills.filter(skill => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      skill.name.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (skill.isBuiltIn && !showBuiltIn) return false;
    if (!skill.isBuiltIn && !showCustom) return false;
    return true;
  });

  const filteredGroups = groups.filter(g => {
    const q = searchQuery.toLowerCase();
    return !q || g.name.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q);
  });

  const skillsPagination = usePagination(filteredSkills, {
    perPage: 30,
    resetOn: [searchQuery, showBuiltIn, showCustom],
  });
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Spinner size={48} className="mx-auto text-primary" />
          <p className="mt-4">Loading skills...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="pt-4 px-4 pb-3 sm:pt-6 sm:px-6 sm:pb-3 shrink-0">
          <div className="mx-auto max-w-7xl flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search skills and groups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleOpenCreateGroup}>
                  <FolderTree className="w-4 h-4 mr-2" />
                  New Group
                </Button>
                <Button variant="outline" size="sm" onClick={handleImport}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportAll}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <Button onClick={handleCreateNew} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  New
                </Button>
              </div>
            </div>

            {/* Global Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Power className="w-4 h-4" />
                <Label htmlFor="global-toggle" className="text-sm font-medium cursor-pointer">
                  Enable Skills System
                </Label>
              </div>
              <Switch
                id="global-toggle"
                checked={globalEnabled}
                onCheckedChange={handleGlobalToggle}
              />
            </div>

            {/* Skill Evaluation Toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <div>
                  <Label htmlFor="eval-toggle" className="text-sm font-medium cursor-pointer">
                    Skill Evaluation
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Pre-check which skills are relevant before each message. Increases initial token usage per message.
                  </p>
                </div>
              </div>
              <Switch
                id="eval-toggle"
                checked={evaluationEnabled}
                disabled={!globalEnabled}
                onCheckedChange={handleEvaluationToggle}
              />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div ref={listScrollRef} className="flex-1 px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6 overflow-auto">
          <div className="mx-auto max-w-7xl">
            <Tabs defaultValue="skills" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="skills" className="gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Skills
                  <Badge variant="outline" className="text-xs ml-1">{filteredSkills.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="groups" className="gap-1.5">
                  <FolderTree className="w-3.5 h-3.5" />
                  Groups
                  <Badge variant="outline" className="text-xs ml-1">{filteredGroups.length}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="skills" className="mt-0 space-y-3">
                {/* Source filter + bulk actions */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Show:</span>
                    <Button
                      variant={showBuiltIn ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 gap-1.5"
                      onClick={() => setShowBuiltIn(v => !v)}
                      aria-pressed={showBuiltIn}
                    >
                      <FileText className="w-3 h-3" />
                      Built-in
                    </Button>
                    <Button
                      variant={showCustom ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 gap-1.5"
                      onClick={() => setShowCustom(v => !v)}
                      aria-pressed={showCustom}
                    >
                      <Sparkles className="w-3 h-3" />
                      Custom
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => handleBulkSkillToggle(filteredSkills.map(s => s.id), true)}
                      disabled={!globalEnabled || filteredSkills.length === 0}
                      title="Enable all skills currently shown"
                    >
                      Enable all
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => handleBulkSkillToggle(filteredSkills.map(s => s.id), false)}
                      disabled={!globalEnabled || filteredSkills.length === 0}
                      title="Disable all skills currently shown"
                    >
                      Disable all
                    </Button>
                  </div>
                </div>

                {filteredSkills.length === 0 ? (
                  <div className="text-center py-12">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No skills found</h3>
                    <p className="text-muted-foreground mb-4">
                      {!showBuiltIn && !showCustom
                        ? 'Both Built-in and Custom are hidden — enable at least one above.'
                        : searchQuery
                          ? 'Try a different search query'
                          : 'Create your first custom skill'}
                    </p>
                    {!searchQuery && showBuiltIn && showCustom && (
                      <Button onClick={handleCreateNew}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Skill
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <PaginationRange
                      total={skillsPagination.total}
                      rangeStart={skillsPagination.rangeStart}
                      rangeEnd={skillsPagination.rangeEnd}
                      totalPages={skillsPagination.totalPages}
                      className="mb-2"
                    />
                    <div className="grid gap-3">
                      {skillsPagination.pageItems.map(skill => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          isEnabled={enabledSkills.has(skill.id)}
                          globalEnabled={globalEnabled}
                          groups={skillToGroups.get(skill.id) ?? []}
                          enabledGroups={enabledGroups}
                          onToggle={handleSkillToggle}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                    <Pagination
                      page={skillsPagination.page}
                      totalPages={skillsPagination.totalPages}
                      onPageChange={skillsPagination.setPage}
                      scrollTarget={listScrollRef}
                    />
                  </>
                )}
              </TabsContent>

              <TabsContent value="groups" className="mt-0">
                {filteredGroups.length === 0 ? (
                  <div className="text-center py-12">
                    <FolderTree className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No groups found</h3>
                    <p className="text-muted-foreground mb-4">
                      {searchQuery ? 'Try a different search query' : 'Create your first group to bundle skills together'}
                    </p>
                    {!searchQuery && (
                      <Button onClick={handleOpenCreateGroup}>
                        <FolderTree className="w-4 h-4 mr-2" />
                        New Group
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {filteredGroups.map(group => (
                      <GroupCard
                        key={group.id}
                        group={group}
                        isEnabled={enabledGroups.has(group.id)}
                        globalEnabled={globalEnabled}
                        allSkills={skills}
                        enabledSkills={enabledSkills}
                        onGroupToggle={handleGroupToggle}
                        onSkillToggle={handleSkillToggle}
                        onEditGroup={handleEditGroup}
                        onDeleteGroup={handleDeleteGroup}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Skill Editor Dialog */}
      <Dialog open={!!editorMode} onOpenChange={(open) => !open && handleEditorCancel()}>
        <DialogContent className="max-w-[90vw] sm:max-w-[85vw] lg:max-w-[75vw] xl:max-w-[1200px] h-[90vh] p-0 overflow-hidden">
          {editorMode && (
            <SkillEditor
              skill={selectedSkill}
              mode={editorMode}
              onSave={handleEditorSave}
              onCancel={handleEditorCancel}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Group Create/Edit Dialog */}
      <GroupEditorDialog
        open={groupDialogOpen}
        mode={groupDialogMode}
        group={groupBeingEdited}
        allSkills={skills}
        onSave={handleGroupDialogSave}
        onCancel={() => {
          setGroupDialogOpen(false);
          setGroupBeingEdited(null);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={(open) => {
        setDeleteConfirmOpen(open);
        if (!open) {
          setSkillToDelete(null);
          setGroupToDelete(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{skillToDelete ? 'Delete Skill' : 'Delete Group'}</DialogTitle>
            <DialogDescription>
              {skillToDelete
                ? `Are you sure you want to delete "${skillToDelete.name}"? This action cannot be undone.`
                : `Are you sure you want to delete the group "${groupToDelete?.name}"? Member skills will not be deleted.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SkillCardProps {
  skill: Skill;
  isEnabled: boolean;
  globalEnabled: boolean;
  groups: SkillGroup[];
  enabledGroups: Set<string>;
  onToggle: (skillId: string, enabled: boolean) => void;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
}

function SkillCard({ skill, isEnabled, globalEnabled, groups, enabledGroups, onToggle, onEdit, onDelete }: SkillCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const enabledMemberGroups = groups.filter(g => enabledGroups.has(g.id));
  const enabledByGroup = enabledMemberGroups.length > 0;
  // Group enables override the individual disabled state.
  const effectiveEnabled = globalEnabled && (isEnabled || enabledByGroup);
  // The individual toggle is ignored as long as a group is enabling the skill.
  const individualOverridden = enabledByGroup && !isEnabled;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={`border rounded-lg transition-colors ${effectiveEnabled ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <CollapsibleTrigger className="flex items-center gap-2 hover:text-primary transition-colors">
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  )}
                  <h3 className="font-semibold truncate">{skill.name}</h3>
                </CollapsibleTrigger>
                {skill.isBuiltIn && (
                  <Badge variant="secondary" className="text-xs">
                    Built-in
                  </Badge>
                )}
                {!effectiveEnabled && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Disabled
                  </Badge>
                )}
                {enabledByGroup && (
                  <Badge
                    variant="outline"
                    className="text-xs gap-1"
                    title={`Active via group${enabledMemberGroups.length > 1 ? 's' : ''}: ${enabledMemberGroups.map(g => g.name).join(', ')}${individualOverridden ? ' (overrides individual disable)' : ''}`}
                  >
                    <FolderTree className="w-3 h-3" />
                    {enabledMemberGroups.length === 1
                      ? enabledMemberGroups[0].name
                      : `${enabledMemberGroups.length} groups`}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {skill.description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={isEnabled}
                onCheckedChange={(checked) => onToggle(skill.id, checked)}
                disabled={!globalEnabled}
              />
              {!skill.isBuiltIn && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(skill)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(skill)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t px-4 py-3 bg-muted/30">
            <div className="text-sm space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-medium">Updated:</span>
                <span>{skill.updatedAt.toLocaleDateString()}</span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Description:</span>
                <p className="mt-1">{skill.description}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Content:</span>
                <pre className="mt-1 text-xs bg-background p-3 rounded border overflow-auto max-h-96 whitespace-pre-wrap">
                  {skill.markdown}
                </pre>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface GroupCardProps {
  group: SkillGroup;
  isEnabled: boolean;
  globalEnabled: boolean;
  allSkills: Skill[];
  enabledSkills: Set<string>;
  onGroupToggle: (groupId: string, enabled: boolean) => void;
  onSkillToggle: (skillId: string, enabled: boolean) => void;
  onEditGroup: (group: SkillGroup) => void;
  onDeleteGroup: (group: SkillGroup) => void;
}

function GroupCard({
  group,
  isEnabled,
  globalEnabled,
  allSkills,
  enabledSkills,
  onGroupToggle,
  onSkillToggle,
  onEditGroup,
  onDeleteGroup,
}: GroupCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const effectiveEnabled = globalEnabled && isEnabled;
  const memberSkills = group.memberIds
    .map(id => allSkills.find(s => s.id === id))
    .filter((s): s is Skill => Boolean(s));
  const missingCount = group.memberIds.length - memberSkills.length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={`border rounded-lg transition-colors ${effectiveEnabled ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <CollapsibleTrigger className="flex items-center gap-2 hover:text-primary transition-colors">
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  )}
                  <h3 className="font-semibold truncate">{group.name}</h3>
                </CollapsibleTrigger>
                <Badge variant="outline" className="text-xs">
                  {memberSkills.length} {memberSkills.length === 1 ? 'skill' : 'skills'}
                </Badge>
                {group.isBuiltIn && (
                  <Badge variant="secondary" className="text-xs">Built-in</Badge>
                )}
                {!effectiveEnabled && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">Disabled</Badge>
                )}
                {missingCount > 0 && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-600/30">
                    {missingCount} missing
                  </Badge>
                )}
              </div>
              {group.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{group.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={isEnabled}
                onCheckedChange={(checked) => onGroupToggle(group.id, checked)}
                disabled={!globalEnabled}
              />
              {!group.isBuiltIn && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onEditGroup(group)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDeleteGroup(group)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t bg-muted/30">
            {memberSkills.length === 0 ? (
              <div className="px-4 py-3 text-xs text-muted-foreground">No member skills.</div>
            ) : (
              <div className="divide-y">
                {memberSkills.map(skill => {
                  const skillEnabled = enabledSkills.has(skill.id);
                  return (
                    <div key={skill.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{skill.name}</span>
                          {skill.isBuiltIn && (
                            <Badge variant="secondary" className="text-[10px] py-0">Built-in</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{skill.description}</p>
                      </div>
                      <Switch
                        checked={skillEnabled}
                        onCheckedChange={(checked) => onSkillToggle(skill.id, checked)}
                        disabled={!globalEnabled}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface GroupEditorDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  group: SkillGroup | null;
  allSkills: Skill[];
  onSave: () => void;
  onCancel: () => void;
}

function GroupEditorDialog({ open, mode, group, allSkills, onSave, onCancel }: GroupEditorDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [memberFilter, setMemberFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && group) {
        setName(group.name);
        setDescription(group.description ?? '');
        setMemberIds(new Set(group.memberIds));
      } else {
        setName('');
        setDescription('');
        setMemberIds(new Set());
      }
      setMemberFilter('');
    }
  }, [open, mode, group]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Group name is required');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        await skillsService.createGroup({
          name: name.trim(),
          description: description.trim() || undefined,
          memberIds: Array.from(memberIds),
        });
        toast.success(`Created group: ${name.trim()}`);
      } else if (group) {
        await skillsService.updateGroup(group.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          memberIds: Array.from(memberIds),
        });
        toast.success(`Updated group: ${name.trim()}`);
      }
      onSave();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save group';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const filteredSkills = allSkills.filter(s => {
    if (!memberFilter) return true;
    const q = memberFilter.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New Skill Group' : 'Edit Skill Group'}</DialogTitle>
          <DialogDescription>
            Bundle skills together for one-click enable/disable. A skill in multiple groups stays active if any of its groups is enabled.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <div>
            <Label htmlFor="group-name" className="text-sm font-medium">Name</Label>
            <Input
              id="group-name"
              placeholder="e.g. Webdev Skills"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mode === 'edit'}
              className="mt-1"
            />
            {mode === 'edit' && (
              <p className="text-xs text-muted-foreground mt-1">Group ID cannot be changed.</p>
            )}
          </div>

          <div>
            <Label htmlFor="group-description" className="text-sm font-medium">Description (optional)</Label>
            <Textarea
              id="group-description"
              placeholder="What this group is for"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">
                Members
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  ({memberIds.size} selected)
                </span>
              </Label>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter skills..."
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="border rounded-lg max-h-72 overflow-y-auto divide-y">
              {filteredSkills.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No skills match.</div>
              ) : (
                filteredSkills.map(skill => (
                  <label
                    key={skill.id}
                    className="flex items-start gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={memberIds.has(skill.id)}
                      onCheckedChange={(checked) => {
                        setMemberIds(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(skill.id);
                          else next.delete(skill.id);
                          return next;
                        });
                      }}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{skill.name}</span>
                        {skill.isBuiltIn && (
                          <Badge variant="secondary" className="text-[10px] py-0">Built-in</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{skill.description}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : mode === 'create' ? 'Create Group' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

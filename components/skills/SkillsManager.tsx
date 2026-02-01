'use client';

import React, { useState, useEffect } from 'react';
import { Skill } from '@/lib/vfs/skills/types';
import { skillsService } from '@/lib/vfs/skills';
import { logger } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  Power
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

export function SkillsManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<Skill | null>(null);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [evaluationEnabled, setEvaluationEnabled] = useState(false);
  const [enabledSkills, setEnabledSkills] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSkills();
    loadEnabledState();
  }, []);

  const loadSkills = async () => {
    try {
      setLoading(true);
      const allSkills = await skillsService.getAllSkills();
      setSkills(allSkills);
    } catch (error) {
      logger.error('[SkillsManager] Failed to load skills', error);
      toast.error('Failed to load skills');
    } finally {
      setLoading(false);
    }
  };

  const loadEnabledState = async () => {
    try {
      const isGlobalEnabled = await skillsService.isGloballyEnabled();
      setGlobalEnabled(isGlobalEnabled);
      const isEvalEnabled = await skillsService.isEvaluationEnabled();
      setEvaluationEnabled(isEvalEnabled);

      // Load enabled state for all skills
      const allSkills = await skillsService.getAllSkills();
      const enabled = new Set<string>();

      for (const skill of allSkills) {
        const isEnabled = await skillsService.isSkillEnabled(skill.id);
        if (isEnabled) {
          enabled.add(skill.id);
        }
      }

      setEnabledSkills(enabled);
    } catch (error) {
      logger.error('[SkillsManager] Failed to load enabled state', error);
    }
  };

  const handleGlobalToggle = async (enabled: boolean) => {
    try {
      await skillsService.setGlobalEnabled(enabled);
      setGlobalEnabled(enabled);
      toast.success(enabled ? 'Skills enabled' : 'Skills disabled');
    } catch (error) {
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
    } catch (error) {
      toast.error('Failed to toggle skill');
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
    if (!skillToDelete) return;

    try {
      await skillsService.deleteSkill(skillToDelete.id);
      toast.success(`Deleted skill: ${skillToDelete.name}`);
      await loadSkills();
      await loadEnabledState();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete skill';
      toast.error(message);
    } finally {
      setDeleteConfirmOpen(false);
      setSkillToDelete(null);
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
          const skills = await skillsService.importSkills(file);
          toast.success(`Imported ${skills.length} skill(s)`);
        } else {
          const skill = await skillsService.importSkillFile(file);
          toast.success(`Imported skill: ${skill.name}`);
        }
        await loadSkills();
        await loadEnabledState();
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
    } catch (error) {
      toast.error('Failed to export skills');
    }
  };

  const handleEditorSave = async () => {
    setEditorMode(null);
    setSelectedSkill(null);
    await loadSkills();
    await loadEnabledState();
  };

  const handleEditorCancel = () => {
    setEditorMode(null);
    setSelectedSkill(null);
  };

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const builtInSkills = filteredSkills.filter(s => s.isBuiltIn);
  const customSkills = filteredSkills.filter(s => !s.isBuiltIn);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
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
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
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

        {/* Skills List */}
        <div className="flex-1 px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6 overflow-auto">
          <div className="mx-auto max-w-7xl">
            {filteredSkills.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No skills found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery ? 'Try a different search query' : 'Create your first custom skill'}
                </p>
                {!searchQuery && (
                  <Button onClick={handleCreateNew}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Skill
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Built-in Skills */}
                {builtInSkills.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Built-in Skills ({builtInSkills.length})
                    </h2>
                    <div className="grid gap-3">
                      {builtInSkills.map(skill => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          isEnabled={enabledSkills.has(skill.id)}
                          globalEnabled={globalEnabled}
                          onToggle={handleSkillToggle}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Skills */}
                {customSkills.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      Custom Skills ({customSkills.length})
                    </h2>
                    <div className="grid gap-3">
                      {customSkills.map(skill => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          isEnabled={enabledSkills.has(skill.id)}
                          globalEnabled={globalEnabled}
                          onToggle={handleSkillToggle}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Editor Dialog */}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Skill</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{skillToDelete?.name}&quot;? This action cannot be undone.
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
  onToggle: (skillId: string, enabled: boolean) => void;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
}

function SkillCard({ skill, isEnabled, globalEnabled, onToggle, onEdit, onDelete }: SkillCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const effectiveEnabled = globalEnabled && isEnabled;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={`border rounded-lg transition-colors ${effectiveEnabled ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
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

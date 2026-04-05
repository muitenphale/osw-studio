'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Skill } from '@/lib/vfs/skills/types';
import { skillsService } from '@/lib/vfs/skills';
import { vfs } from '@/lib/vfs';
import { logger } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Sparkles, Plus } from 'lucide-react';
import { PanelContainer, PanelHeader } from '@/components/ui/panel';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { SkillEditor } from '@/components/skills/SkillEditor';

interface SkillsPanelProps {
  onClose?: () => void;
}

export function SkillsPanel({ onClose }: SkillsPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [enabledSkills, setEnabledSkills] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const [allSkills, global] = await Promise.all([
        skillsService.getAllSkills(),
        skillsService.isGloballyEnabled(),
      ]);
      setSkills(allSkills);
      setGlobalEnabled(global);

      const enabled = new Set<string>();
      for (const skill of allSkills) {
        if (await skillsService.isSkillEnabled(skill.id)) {
          enabled.add(skill.id);
        }
      }
      setEnabledSkills(enabled);
    } catch (err) {
      logger.error('Failed to load skills:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleGlobalToggle = async (enabled: boolean) => {
    setGlobalEnabled(enabled);
    await skillsService.setGlobalEnabled(enabled);
    await vfs.reloadTransientSkills();
  };

  const handleSkillToggle = async (skillId: string, enabled: boolean) => {
    const updated = new Set(enabledSkills);
    if (enabled) {
      updated.add(skillId);
      await skillsService.enableSkill(skillId);
    } else {
      updated.delete(skillId);
      await skillsService.disableSkill(skillId);
    }
    setEnabledSkills(updated);
    await vfs.reloadTransientSkills();
  };

  const builtInSkills = skills.filter(s => s.isBuiltIn);
  const customSkills = skills.filter(s => !s.isBuiltIn);

  return (
    <PanelContainer>
      <PanelHeader
        icon={Sparkles}
        title="Skills"
        color="var(--button-skills-active, #a855f7)"
        onClose={onClose}
        panelKey="skills"
        actions={
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => setCreateDialogOpen(true)}
            title="Create new skill"
          >
            <Plus className="h-3 w-3" />
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Global toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Enable skills</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Domain-specific AI instructions
            </p>
          </div>
          <Switch
            checked={globalEnabled}
            onCheckedChange={handleGlobalToggle}
            disabled={loading}
          />
        </div>

        {globalEnabled && !loading && (
          <>
            {builtInSkills.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Built-in
                </div>
                <div className="space-y-0.5">
                  {builtInSkills.map(skill => (
                    <div key={skill.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="text-sm truncate">{skill.name}</div>
                      </div>
                      <Switch
                        checked={enabledSkills.has(skill.id)}
                        onCheckedChange={(checked) => handleSkillToggle(skill.id, checked)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {customSkills.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Custom
                </div>
                <div className="space-y-0.5">
                  {customSkills.map(skill => (
                    <div key={skill.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="text-sm truncate">{skill.name}</div>
                      </div>
                      <Switch
                        checked={enabledSkills.has(skill.id)}
                        onCheckedChange={(checked) => handleSkillToggle(skill.id, checked)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {skills.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No skills available.
              </p>
            )}
          </>
        )}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <SkillEditor
            skill={null}
            mode="create"
            onSave={async () => {
              setCreateDialogOpen(false);
              await loadState();
              await vfs.reloadTransientSkills();
            }}
            onCancel={() => setCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </PanelContainer>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { vfs } from '@/lib/vfs';
import { skillsService } from '@/lib/vfs/skills/service';
import { getSyncManager } from '@/lib/vfs/sync-manager';
import {
  DetailedSyncStatus,
  SyncableItem,
  CategorySyncStatus,
  calculateItemSyncStatus,
  calculateCategoryCounts,
} from '@/lib/vfs/sync-types';
import { logger } from '@/lib/utils';

const EMPTY_CATEGORY: CategorySyncStatus = {
  items: [],
  syncedCount: 0,
  localNewerCount: 0,
  serverNewerCount: 0,
  conflictCount: 0,
  localOnlyCount: 0,
  serverOnlyCount: 0,
};

const INITIAL_STATUS: DetailedSyncStatus = {
  projects: EMPTY_CATEGORY,
  skills: EMPTY_CATEGORY,
  templates: EMPTY_CATEGORY,
  loading: true,
  error: null,
};

export function useSyncStatus() {
  const [status, setStatus] = useState<DetailedSyncStatus>(INITIAL_STATUS);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const syncManager = getSyncManager();

  const fetchStatus = useCallback(async () => {
    if (hasLoaded) {
      setRefreshing(true);
    } else {
      setStatus((prev) => ({ ...prev, loading: true, error: null }));
    }

    try {
      // Fetch server status
      const serverResult = await syncManager.getEnhancedSyncStatus();

      if (!serverResult.success || !serverResult.data) {
        setStatus((prev) => ({
          ...prev,
          loading: false,
          error: serverResult.error || 'Failed to fetch server status',
        }));
        setRefreshing(false);
        return;
      }

      const serverData = serverResult.data;

      // Build maps for quick lookup
      const serverProjects = new Map(
        serverData.projects.map((p) => [p.id, { name: p.name, updatedAt: new Date(p.updatedAt) }])
      );
      const serverSkills = new Map(
        serverData.skills.map((s) => [s.id, { name: s.name, updatedAt: new Date(s.updatedAt) }])
      );
      const serverTemplates = new Map(
        serverData.templates.map((t) => [t.id, { name: t.name, updatedAt: new Date(t.updatedAt) }])
      );

      // Get local data
      await vfs.init();
      const localProjects = await vfs.listProjects();

      const localSkills = await skillsService.getCustomSkills();

      const localTemplates = await vfs.getStorageAdapter().getAllCustomTemplates();

      // Build project items
      const projectItems: SyncableItem[] = [];
      const processedProjectIds = new Set<string>();

      // Process local projects
      for (const project of localProjects) {
        processedProjectIds.add(project.id);
        const serverInfo = serverProjects.get(project.id);

        const status = calculateItemSyncStatus(
          project.updatedAt,
          serverInfo?.updatedAt || null,
          project.lastSyncedAt || null
        );

        projectItems.push({
          id: project.id,
          name: project.name,
          type: 'project',
          localUpdatedAt: project.updatedAt,
          serverUpdatedAt: serverInfo?.updatedAt || null,
          lastSyncedAt: project.lastSyncedAt || null,
          status,
        });
      }

      // Add server-only projects
      for (const [id, info] of serverProjects) {
        if (!processedProjectIds.has(id)) {
          projectItems.push({
            id,
            name: info.name,
            type: 'project',
            localUpdatedAt: null,
            serverUpdatedAt: info.updatedAt,
            lastSyncedAt: null,
            status: 'server-only',
          });
        }
      }

      // Build skill items
      const skillItems: SyncableItem[] = [];
      const processedSkillIds = new Set<string>();

      // Process local skills
      for (const skill of localSkills) {
        processedSkillIds.add(skill.id);
        const serverInfo = serverSkills.get(skill.id);

        const status = calculateItemSyncStatus(
          skill.updatedAt,
          serverInfo?.updatedAt || null,
          skill.lastSyncedAt || null
        );

        skillItems.push({
          id: skill.id,
          name: skill.name,
          type: 'skill',
          localUpdatedAt: skill.updatedAt,
          serverUpdatedAt: serverInfo?.updatedAt || null,
          lastSyncedAt: skill.lastSyncedAt || null,
          status,
        });
      }

      // Add server-only skills
      for (const [id, info] of serverSkills) {
        if (!processedSkillIds.has(id)) {
          skillItems.push({
            id,
            name: info.name,
            type: 'skill',
            localUpdatedAt: null,
            serverUpdatedAt: info.updatedAt,
            lastSyncedAt: null,
            status: 'server-only',
          });
        }
      }

      // Build template items
      const templateItems: SyncableItem[] = [];
      const processedTemplateIds = new Set<string>();

      // Process local templates
      for (const template of localTemplates) {
        processedTemplateIds.add(template.id);
        const serverInfo = serverTemplates.get(template.id);

        // Templates use importedAt or updatedAt
        const localUpdatedAt = template.updatedAt || template.importedAt;

        const status = calculateItemSyncStatus(
          localUpdatedAt,
          serverInfo?.updatedAt || null,
          null // Templates don't have lastSyncedAt yet
        );

        templateItems.push({
          id: template.id,
          name: template.name,
          type: 'template',
          localUpdatedAt,
          serverUpdatedAt: serverInfo?.updatedAt || null,
          lastSyncedAt: null,
          status,
        });
      }

      // Add server-only templates
      for (const [id, info] of serverTemplates) {
        if (!processedTemplateIds.has(id)) {
          templateItems.push({
            id,
            name: info.name,
            type: 'template',
            localUpdatedAt: null,
            serverUpdatedAt: info.updatedAt,
            lastSyncedAt: null,
            status: 'server-only',
          });
        }
      }

      // Calculate counts
      const projectCounts = calculateCategoryCounts(projectItems);
      const skillCounts = calculateCategoryCounts(skillItems);
      const templateCounts = calculateCategoryCounts(templateItems);

      setStatus({
        projects: { items: projectItems, ...projectCounts },
        skills: { items: skillItems, ...skillCounts },
        templates: { items: templateItems, ...templateCounts },
        loading: false,
        error: null,
      });
      setHasLoaded(true);
    } catch (error) {
      logger.error('[useSyncStatus] Error fetching sync status:', error);
      setStatus((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch sync status',
      }));
    } finally {
      setRefreshing(false);
    }
  }, [syncManager, hasLoaded]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    refresh: fetchStatus,
    loading: status.loading,
    refreshing,
    error: status.error,
  };
}

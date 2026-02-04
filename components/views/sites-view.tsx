'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Site, Project } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { getSyncManager } from '@/lib/vfs/sync-manager';
import { SiteCard } from '../site-card';
import { SiteSettingsModal } from '../site-settings';
import { ServerSettingsModal } from '../server-settings';
import { CreateSiteModal } from '../create-site-modal';
import { AnalyticsDashboard } from '../analytics-dashboard';
import { Globe, Plus, Search, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { captureSiteThumbnail } from '@/lib/utils/site-thumbnail';
import { toast } from 'sonner';

type SortOption = 'updated' | 'created' | 'name' | 'published';

interface SitesViewProps {
  onProjectSelect: (project: Project) => void;
}

export function SitesView({ onProjectSelect }: SitesViewProps) {
  const [sites, setSites] = useState<Site[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingStates, setPublishingStates] = useState<Record<string, boolean>>({});
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showServerSettingsModal, setShowServerSettingsModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      if (!isServerMode) {
        setLoading(false);
        return;
      }

      const [sitesResponse, projectsResponse] = await Promise.all([
        fetch('/api/sites'),
        fetch('/api/projects?fields=id,name'), // Only fetch id and name fields
      ]);

      // Redirect to login if unauthorized
      if (sitesResponse.status === 401 || projectsResponse.status === 401) {
        window.location.href = '/admin/login';
        return;
      }

      if (!sitesResponse.ok) {
        throw new Error('Failed to fetch sites');
      }
      if (!projectsResponse.ok) {
        throw new Error('Failed to fetch projects');
      }

      const [fetchedSites, fetchedProjects] = await Promise.all([
        sitesResponse.json(),
        projectsResponse.json(),
      ]);

      setSites(fetchedSites);
      setProjects(fetchedProjects);
    } catch (error) {
      console.error('[SitesView] Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to update a single site in state (optimistic updates)
  const updateSiteInState = (siteId: string, updates: Partial<Site>) => {
    setSites(prevSites =>
      prevSites.map(site =>
        site.id === siteId ? { ...site, ...updates } : site
      )
    );
  };

  const handleOpenSettings = (site: Site) => {
    setSelectedSite(site);
    setShowSettingsModal(true);
  };

  const handleOpenServerSettings = (site: Site) => {
    setSelectedSite(site);
    setShowServerSettingsModal(true);
  };

  const handleViewAnalytics = (site: Site) => {
    setSelectedSite(site);
    setShowAnalyticsModal(true);
  };

  const handleEditProject = async (site: Site) => {
    try {
      await vfs.init();
      const project = await vfs.getProject(site.projectId);
      if (!project) {
        toast.error('Project not found in local storage');
        return;
      }
      onProjectSelect(project);
    } catch (error) {
      console.error('[SitesView] Failed to load project:', error);
      toast.error('Failed to load project');
    }
  };

  const handleSaveSettings = async (settings: Partial<Site>) => {
    if (!selectedSite) return;

    try {
      // If projectId changed, update it via the generic site endpoint
      const projectIdChanged = settings.projectId && settings.projectId !== selectedSite.projectId;
      if (projectIdChanged) {
        const siteResponse = await fetch(`/api/sites/${selectedSite.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: settings.projectId }),
        });

        if (!siteResponse.ok) {
          const error = await siteResponse.json();
          throw new Error(error.error || 'Failed to update project');
        }
      }

      // Save publishing settings (exclude projectId — handled above)
      const { projectId: _projectId, ...publishSettings } = settings;

      const response = await fetch(`/api/sites/${selectedSite.id}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(publishSettings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save settings');
      }

      const result = await response.json();

      // Update local site state in the selected site modal
      setSelectedSite({
        ...selectedSite,
        ...settings,
        settingsVersion: result.settingsVersion,
        lastPublishedVersion: result.lastPublishedVersion,
      });

      // Update the site in the main list (optimistic update - no full reload)
      updateSiteInState(selectedSite.id, {
        ...settings,
        settingsVersion: result.settingsVersion,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('[SitesView] Failed to save site settings:', error);
      throw error;
    }
  };

  const handlePublish = async (siteId: string) => {
    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    if (!confirm('Publish this site with the current settings?')) {
      return;
    }

    // Set publishing state
    setPublishingStates(prev => ({ ...prev, [siteId]: true }));

    try {
      // First, sync files from IndexedDB to server
      toast.info('Syncing project files...');

      await vfs.init();
      const project = await vfs.getProject(site.projectId);
      if (!project) {
        throw new Error('Project not found in local storage');
      }

      const files = await vfs.listFiles(site.projectId);
      const syncManager = getSyncManager();

      // Push project and files to server
      const syncResult = await syncManager.pushProjectWithFiles(project, files);
      if (!syncResult.success) {
        throw new Error(syncResult.error || 'Failed to sync files to server');
      }

      toast.info('Building site...');

      // Call publish API to trigger build
      const response = await fetch(`/api/sites/${siteId}/publish`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to publish');
      }

      const result = await response.json();

      toast.success(`Site published! ${result.filesWritten} files written.`);

      // Update state optimistically with publish data
      updateSiteInState(siteId, {
        lastPublishedVersion: result.lastPublishedVersion,
        publishedAt: new Date(),
        updatedAt: new Date(),
        databaseEnabled: true, // Site database is now enabled
      });

      // Generate thumbnail after successful publish (non-blocking, but keep loading state)
      const siteUrl = `${window.location.origin}/sites/${siteId}`;
      captureSiteThumbnail(siteId, siteUrl)
        .then(success => {
          if (success) {
            // Fetch just the updated site to get new thumbnail data (no full reload)
            return fetch(`/api/sites/${siteId}`)
              .then(r => r.json())
              .then(updatedSite => {
                updateSiteInState(siteId, {
                  previewImage: updatedSite.previewImage,
                  previewUpdatedAt: updatedSite.previewUpdatedAt,
                });
              });
          } else {
            console.warn(`[Sites View] Failed to generate thumbnail for ${siteId}`);
          }
        })
        .catch(err => {
          console.error(`[Sites View] Thumbnail generation error:`, err);
        })
        .finally(() => {
          // Clear publishing state after thumbnail is done (or failed)
          setPublishingStates(prev => ({ ...prev, [siteId]: false }));
        });
    } catch (error) {
      console.error('Failed to publish:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish. Please try again.');
      // Clear publishing state on error
      setPublishingStates(prev => ({ ...prev, [siteId]: false }));
    }
  };

  const handleDisable = async (siteId: string) => {
    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    if (!confirm('Disable this site? It will no longer be publicly accessible.')) {
      return;
    }

    try {
      const response = await fetch(`/api/sites/${siteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to disable site');
      }

      // Update state optimistically (no full reload)
      updateSiteInState(siteId, {
        enabled: false,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to disable site:', error);
      alert('Failed to disable site. Please try again.');
    }
  };

  const handleEnable = async (siteId: string) => {
    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    try {
      const response = await fetch(`/api/sites/${siteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to enable site');
      }

      // Update state optimistically (no full reload)
      updateSiteInState(siteId, {
        enabled: true,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to enable site:', error);
      alert('Failed to enable site. Please try again.');
    }
  };

  const handleDelete = async (siteId: string) => {
    const site = sites.find(s => s.id === siteId);
    if (!site) return;

    if (!confirm(`Delete site "${site.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/sites/${siteId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete site');
      }

      await loadData();
    } catch (error) {
      console.error('Failed to delete site:', error);
      alert('Failed to delete site. Please try again.');
    }
  };

  const handleCreateSite = async (data: { projectId: string; name: string; slug?: string }) => {
    try {
      const response = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create site');
      }

      await loadData();
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create site:', error);
      throw error;
    }
  };

  // Filter and sort sites
  const filteredAndSortedSites = useMemo(() => {
    let filtered = sites;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = sites.filter(site => {
        const project = projects.find(p => p.id === site.projectId);
        return (
          site.name.toLowerCase().includes(query) ||
          site.slug?.toLowerCase().includes(query) ||
          project?.name.toLowerCase().includes(query)
        );
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'published':
          if (!a.publishedAt && !b.publishedAt) return 0;
          if (!a.publishedAt) return 1;
          if (!b.publishedAt) return -1;
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        case 'updated':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return sorted;
  }, [sites, projects, searchQuery, sortBy]);

  if (!isServerMode) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Sites feature is only available in Server Mode</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4">Loading sites...</p>
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
                placeholder="Search sites..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Sort */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="hidden sm:inline">Sort</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48" align="end">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Sort by</h4>
                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="updated">Last Updated</SelectItem>
                        <SelectItem value="published">Last Published</SelectItem>
                        <SelectItem value="created">Date Created</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>

              {/* New Site */}
              <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                <span>New</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Sites Grid/List */}
        <div className="flex-1 px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6 overflow-auto">
          <div className="mx-auto max-w-7xl">
            {filteredAndSortedSites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Globe className="h-16 w-16 text-muted-foreground mb-4" />
                {sites.length === 0 ? (
                  <>
                    <h2 className="text-xl font-semibold mb-2">No Sites Yet</h2>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Create your first site by clicking the "New" button above.
                      Sites let you publish projects and manage their public settings independently.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold mb-2">No sites found</h2>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Try adjusting your search or filter criteria
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAndSortedSites.map((site) => {
                  const project = projects.find(p => p.id === site.projectId);
                  return (
                    <SiteCard
                      key={site.id}
                      site={site}
                      project={project}
                      isPublishing={publishingStates[site.id] || false}
                      onOpenSettings={handleOpenSettings}
                      onOpenServerSettings={handleOpenServerSettings}
                      onViewAnalytics={handleViewAnalytics}
                      onEditProject={handleEditProject}
                      onPublish={handlePublish}
                      onDisable={handleDisable}
                      onEnable={handleEnable}
                      onDelete={handleDelete}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedSite && (
        <>
          <SiteSettingsModal
            site={selectedSite}
            projects={projects}
            isOpen={showSettingsModal}
            onClose={() => {
              setShowSettingsModal(false);
              setSelectedSite(null);
            }}
            onSave={handleSaveSettings}
          />

          <ServerSettingsModal
            site={selectedSite}
            isOpen={showServerSettingsModal}
            onClose={() => {
              setShowServerSettingsModal(false);
              setSelectedSite(null);
            }}
          />

          <AnalyticsDashboard
            site={selectedSite}
            isOpen={showAnalyticsModal}
            onClose={() => {
              setShowAnalyticsModal(false);
              setSelectedSite(null);
            }}
          />
        </>
      )}

      <CreateSiteModal
        projects={projects}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateSite}
      />
    </>
  );
}

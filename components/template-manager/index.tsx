'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CustomTemplate, SiteTemplateFeatures } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { templateService } from '@/lib/vfs/template-service';
import { createProjectFromTemplate, BUILT_IN_TEMPLATES, type BuiltInTemplateMetadata } from '@/lib/vfs/templates';
import { BAREBONES_PROJECT_TEMPLATE, DEMO_PROJECT_TEMPLATE, CONTACT_LANDING_PROJECT_TEMPLATE, BLOG_PROJECT_TEMPLATE } from '@/lib/vfs/project-templates';
import { getSyncManager } from '@/lib/vfs/sync-manager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TemplateCard } from './template-card';
import { logger } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Upload,
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  Package,
  Filter
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface TemplateManagerProps {
  onProjectCreated?: (projectId: string, isSiteTemplate: boolean) => void;
}

type SortOption = 'updated' | 'name' | 'author' | 'files';
type ViewMode = 'grid' | 'list';
type TypeFilter = 'all' | 'project' | 'site';

export function TemplateManager({ onProjectCreated }: TemplateManagerProps) {
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const loadCustomTemplates = useCallback(async () => {
    try {
      setLoading(true);
      await vfs.init();
      const templates = await templateService.listCustomTemplates();
      setCustomTemplates(templates);
    } catch (error) {
      logger.error('Failed to load custom templates:', error);
      toast.error('Failed to load custom templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomTemplates();
  }, [loadCustomTemplates]);

  const handleImportTemplate = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.oswt';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        await templateService.importTemplateFile(file);
        toast.success('Template imported successfully!');
        await loadCustomTemplates();
      } catch (error) {
        logger.error('Failed to import template:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to import template');
      }
    };

    input.click();
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      await templateService.deleteCustomTemplate(id);
      toast.success('Template deleted');
      await loadCustomTemplates();
    } catch (error) {
      logger.error('Failed to delete template:', error);
      toast.error('Failed to delete template');
    }
  };

  const handleExportTemplate = async (template: CustomTemplate | BuiltInTemplateMetadata) => {
    try {
      // For built-in templates, create a custom template export
      if ('isBuiltIn' in template && template.isBuiltIn) {
        toast.info('Exporting built-in template as custom template...');

        // Create a temporary project to export
        const tempProject = await vfs.createProject(
          template.name,
          template.description
        );

        // Populate with template content
        if (template.id === 'blank') {
          await createProjectFromTemplate(vfs, tempProject.id, BAREBONES_PROJECT_TEMPLATE);
        } else if (template.id === 'demo') {
          await createProjectFromTemplate(vfs, tempProject.id, DEMO_PROJECT_TEMPLATE, DEMO_PROJECT_TEMPLATE.assets);
        } else if (template.id === 'contact-landing') {
          await createProjectFromTemplate(vfs, tempProject.id, CONTACT_LANDING_PROJECT_TEMPLATE);
        } else if (template.id === 'blog') {
          await createProjectFromTemplate(vfs, tempProject.id, BLOG_PROJECT_TEMPLATE);
        }

        // Export as template
        const blob = await templateService.exportProjectAsTemplate(vfs, tempProject.id, {
          name: template.name,
          description: template.description,
          version: '1.0.0',
          author: 'OSW Studio',
          license: 'mit',
          tags: template.metadata?.tags || []
        });

        // Clean up temp project
        await vfs.deleteProject(tempProject.id);

        // Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.name.replace(/\s+/g, '-').toLowerCase()}.oswt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success('Template exported successfully!');
      } else {
        // Custom template - re-export
        const customTemplate = template as CustomTemplate;
        const blob = await templateService.exportTemplateAsFile(customTemplate);

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${customTemplate.name.replace(/\s+/g, '-').toLowerCase()}.oswt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success('Template exported successfully!');
      }
    } catch (error) {
      logger.error('Failed to export template:', error);
      toast.error('Failed to export template');
    }
  };

  const handleCreateProject = async (template: CustomTemplate | BuiltInTemplateMetadata) => {
    try {
      const projectName = template.name === 'Blank' || template.name === 'Example Studios'
        ? `New ${template.name} Project`
        : template.name;

      const project = await vfs.createProject(
        projectName,
        template.description
      );

      // Determine siteFeatures and templateType for provisioning later
      let siteFeatures: SiteTemplateFeatures | undefined;
      let isSiteTemplate = false;

      // Use built-in template or custom template
      if ('isBuiltIn' in template && template.isBuiltIn) {
        if (template.id === 'blank') {
          await createProjectFromTemplate(vfs, project.id, BAREBONES_PROJECT_TEMPLATE);
        } else if (template.id === 'demo') {
          await createProjectFromTemplate(vfs, project.id, DEMO_PROJECT_TEMPLATE, DEMO_PROJECT_TEMPLATE.assets);
        } else if (template.id === 'contact-landing') {
          await createProjectFromTemplate(vfs, project.id, CONTACT_LANDING_PROJECT_TEMPLATE);
        } else if (template.id === 'blog') {
          await createProjectFromTemplate(vfs, project.id, BLOG_PROJECT_TEMPLATE);
        }

        if ('templateType' in template && template.templateType === 'site') {
          isSiteTemplate = true;
          siteFeatures = template.siteFeatures;
        }
      } else {
        // Custom template
        const customTemplate = template as CustomTemplate;
        await createProjectFromTemplate(vfs, project.id, {
          name: customTemplate.name,
          description: customTemplate.description,
          files: customTemplate.files.map(f => ({
            path: f.path,
            content: typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content as ArrayBuffer)
          })),
          directories: customTemplate.directories,
          assets: customTemplate.assets
        });

        if (customTemplate.templateType === 'site') {
          isSiteTemplate = true;
          siteFeatures = customTemplate.siteFeatures;
        }
      }

      // Provision backend features for site templates
      if (isSiteTemplate && siteFeatures) {
        const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

        if (isServerMode) {
          try {
            // Sync project + files to server (required before creating a site)
            const files = await vfs.listFiles(project.id);
            const syncManager = getSyncManager();
            const syncResult = await syncManager.pushProjectWithFiles(project, files);
            if (!syncResult.success) {
              throw new Error(syncResult.error || 'Failed to sync project to server');
            }

            // Create site via API
            const siteRes = await fetch('/api/sites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId: project.id, name: project.name }),
            });
            if (!siteRes.ok) {
              const err = await siteRes.json();
              throw new Error(err.error || 'Failed to create site');
            }
            const site = await siteRes.json();

            // Provision backend features via bulk endpoint
            const provisionRes = await fetch(`/api/admin/sites/${site.id}/provision`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ siteFeatures }),
            });
            if (!provisionRes.ok) {
              const err = await provisionRes.json();
              throw new Error(err.error || 'Failed to provision backend features');
            }
            const { provisioned } = await provisionRes.json();

            // Summary toast
            const parts: string[] = [];
            if (provisioned.edgeFunctions > 0) parts.push(`${provisioned.edgeFunctions} edge function(s)`);
            if (provisioned.serverFunctions > 0) parts.push(`${provisioned.serverFunctions} server function(s)`);
            if (provisioned.secrets > 0) parts.push(`${provisioned.secrets} secret placeholder(s)`);
            if (provisioned.databaseSchemaApplied) parts.push('database schema');
            if (parts.length > 0) {
              toast.success(`Site provisioned: ${parts.join(', ')}`, { duration: 5000 });
            }

            // Remind about secret placeholders
            if (provisioned.secrets > 0) {
              toast.info('Remember to fill in secret values in the Admin panel.', { duration: 6000 });
            }
          } catch (provisionError) {
            logger.error('Failed to provision site backend:', provisionError);
            toast.warning(
              'Project created but backend provisioning failed. You can configure features manually in the Admin panel.',
              { duration: 6000 }
            );
          }
        } else {
          toast.info('Site template: Backend features (edge functions, database, etc.) require Server Mode.', { duration: 5000 });
        }
      }

      toast.success(`Project "${project.name}" created successfully!`);

      if (onProjectCreated) {
        onProjectCreated(project.id, isSiteTemplate);
      }
    } catch (error) {
      logger.error('Failed to create project from template:', error);
      toast.error('Failed to create project');
    }
  };

  // Combine all templates
  const allTemplates: (CustomTemplate | BuiltInTemplateMetadata)[] = [
    ...BUILT_IN_TEMPLATES,
    ...customTemplates
  ];

  // Filter templates
  const filteredTemplates = allTemplates.filter(template => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      template.name.toLowerCase().includes(query) ||
      template.description.toLowerCase().includes(query) ||
      ('metadata' in template && template.metadata?.author?.toLowerCase().includes(query)) ||
      ('metadata' in template && template.metadata?.tags?.some(tag => tag.toLowerCase().includes(query)));

    // Type filter
    if (typeFilter !== 'all') {
      const templateType = ('templateType' in template && template.templateType) || 'project';
      if (templateType !== typeFilter) return false;
    }

    return matchesSearch;
  });

  // Sort templates
  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    switch (sortBy) {
      case 'updated':
        const aDate = ('updatedAt' in a && a.updatedAt) ? a.updatedAt : new Date('2024-01-01');
        const bDate = ('updatedAt' in b && b.updatedAt) ? b.updatedAt : new Date('2024-01-01');
        return bDate.getTime() - aDate.getTime();
      case 'name':
        return a.name.localeCompare(b.name);
      case 'author':
        const aAuthor = ('metadata' in a && a.metadata?.author) || '';
        const bAuthor = ('metadata' in b && b.metadata?.author) || '';
        return aAuthor.localeCompare(bAuthor);
      case 'files':
        const aFiles = 'files' in a ? a.files?.length || 0 : 0;
        const bFiles = 'files' in b ? b.files?.length || 0 : 0;
        return bFiles - aFiles;
      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="pt-4 px-4 pb-3 sm:pt-6 sm:px-6 sm:pb-3 shrink-0">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
            <SelectTrigger className="w-[110px] h-9 text-sm">
              <Filter className="h-4 w-4 mr-1 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="site">Site</SelectItem>
            </SelectContent>
          </Select>

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
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="author">Author</SelectItem>
                    <SelectItem value="files">File Count</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>

          {/* View Mode */}
          <div className="flex border rounded-full">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none rounded-l-full"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-l-none rounded-r-full"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Import */}
          <Button onClick={handleImportTemplate} size="sm" className="gap-2">
            <Upload className="h-4 w-4" />
            <span>Import</span>
          </Button>
        </div>
        </div>
      </div>

      {/* Templates Grid/List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6">
        <div className="mx-auto max-w-7xl">
        {sortedTemplates.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              {searchQuery ? (
                <>
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No templates found</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    No templates match your search query "{searchQuery}"
                  </p>
                  <Button variant="outline" onClick={() => setSearchQuery('')}>
                    Clear search
                  </Button>
                </>
              ) : (
                <>
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No custom templates yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Import custom templates to get started with professional designs.
                  </p>
                  <Button onClick={handleImportTemplate}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Template
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
            : 'space-y-3'
          }>
            {sortedTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={handleCreateProject}
                onDelete={handleDeleteTemplate}
                onExport={handleExportTemplate}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CustomTemplate, BackendFeatures, ProjectRuntime } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { templateService } from '@/lib/vfs/template-service';
import { createProjectFromTemplate, customTemplateToProjectTemplate, BUILT_IN_TEMPLATES, type BuiltInTemplateMetadata } from '@/lib/vfs/templates';
import {
  applyBuiltInTemplate,
  getBuiltInTemplateDefinition,
  instantiateBuiltInTemplate,
} from '@/lib/vfs/project-templates';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { TemplateCard } from './template-card';
import { TemplatePreviewDialog } from '@/components/template-browser/template-preview-dialog';
import { templatePreviewUnavailableReason } from '@/lib/vfs/templates/preview-project';
import { logger, formatCompactAge } from '@/lib/utils';
import { toast } from 'sonner';
import { provisionBackendFeatures } from '@/lib/vfs/provision-backend-features';
import { usePagination } from '@/lib/hooks/use-pagination';
import { Pagination, PaginationRange } from '@/components/ui/pagination';
import {
  Upload,
  Search,
  ArrowUpDown,
  Package,
  Filter,
  MoreVertical,
  Trash2,
  Download,
} from 'lucide-react';
import { ViewModeToggle, useViewMode } from '@/components/ui/view-mode-toggle';
import { Badge } from '@/components/ui/badge';
import { getRuntimeBadge } from '@/lib/runtimes/registry';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  onProjectCreated?: (projectId: string, hasBackendFeatures: boolean) => void;
}

type SortOption = 'updated' | 'name' | 'author' | 'files';
type TypeFilter = 'all' | 'standard' | 'server';

export function TemplateManager({ onProjectCreated }: TemplateManagerProps) {
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [viewMode, setViewMode] = useViewMode('templates');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  // The template being previewed, carried as the browser's selection value so one dialog serves
  // both surfaces.
  const [previewing, setPreviewing] = useState<
    { value: string; name: string; runtime: ProjectRuntime } | null
  >(null);

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

        // Fill it, backend features included. The export reads those back out of the project's
        // own storage, so a temp project that was only given files exports a template with no
        // edge functions, no secrets and no schema.
        const definition = getBuiltInTemplateDefinition(template.id);
        if (!definition) throw new Error(`Unknown built-in template: ${template.id}`);
        await instantiateBuiltInTemplate(vfs, tempProject.id, definition);

        // Export as template
        const blob = await templateService.exportProjectAsTemplate(vfs, tempProject.id, {
          name: template.name,
          description: template.description,
          version: '1.0.0',
          author: template.metadata?.author || 'OSW Studio',
          license: template.metadata?.license || 'mit',
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
      setCreating(true);

      // A template whose name describes the project it makes can name the project. A starter's
      // name describes the starting point instead, so "Handlebars Starter" would be a poor project
      // name for whatever gets built on it. Keyed off the intent rather than the template's name,
      // which used to be matched literally and quietly stopped matching when a name changed.
      const intent = 'metadata' in template ? template.metadata?.intent : undefined;
      const namesTheStartingPoint = intent === 'starter';
      const projectName = namesTheStartingPoint
        ? `New ${template.name} Project`
        : template.name;

      // Resolved before the project exists: a built-in's files are a lazily imported chunk, and a
      // failure after createProject would leave an empty project behind.
      const definition =
        'isBuiltIn' in template && template.isBuiltIn
          ? getBuiltInTemplateDefinition(template.id)
          : undefined;
      if ('isBuiltIn' in template && template.isBuiltIn && !definition) {
        throw new Error(`Unknown built-in template: ${template.id}`);
      }

      const project = await vfs.createProject(
        projectName,
        template.description
      );

      // Use built-in template or custom template
      let backendFeatures: BackendFeatures | undefined;

      if (definition) {
        const template = await applyBuiltInTemplate(vfs, project.id, definition);
        backendFeatures = template.backendFeatures;
      } else {
        // Custom template
        const customTemplate = template as CustomTemplate;
        await createProjectFromTemplate(vfs, project.id, customTemplateToProjectTemplate(customTemplate));

        backendFeatures = customTemplate.backendFeatures;
      }

      // Provision backend features into project IndexedDB stores
      if (backendFeatures) {
        try {
          const result = await provisionBackendFeatures(project.id, backendFeatures);

          // Summary toast
          const parts: string[] = [];
          if (result.edgeFunctions > 0) parts.push(`${result.edgeFunctions} edge function(s)`);
          if (result.serverFunctions > 0) parts.push(`${result.serverFunctions} server function(s)`);
          if (result.secrets > 0) parts.push(`${result.secrets} secret placeholder(s)`);
          if (result.scheduledFunctions > 0) parts.push(`${result.scheduledFunctions} schedule(s)`);
          if (result.hasDatabaseSchema) parts.push('database schema');
          if (parts.length > 0) {
            toast.success(`Backend features provisioned: ${parts.join(', ')}`, { duration: 5000 });
          }
        } catch (provisionError) {
          logger.error('Failed to provision backend features:', provisionError);
          toast.warning(
            'Project created but backend features provisioning failed. You can configure features manually.',
            { duration: 6000 }
          );
        }
      }

      toast.success(`Project "${project.name}" created successfully!`);

      if (onProjectCreated) {
        onProjectCreated(project.id, !!backendFeatures);
      }
    } catch (error) {
      logger.error('Failed to create project from template:', error);
      toast.error('Failed to create project');
    } finally {
      setCreating(false);
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
      const hasBackendFeatures =
        'isBuiltIn' in template && template.isBuiltIn
          ? !!template.hasBackendFeatures
          : !!(template as CustomTemplate).backendFeatures;
      if (typeFilter === 'server' && !hasBackendFeatures) return false;
      if (typeFilter === 'standard' && hasBackendFeatures) return false;
    }

    return matchesSearch;
  });

  // Sort templates: custom first, then built-in; the chosen sort applies within each group.
  const builtInTemplateIds = new Set(BUILT_IN_TEMPLATES.map(t => t.id));

  /**
   * What the preview dialog needs, or null for a template it cannot show.
   *
   * Custom templates predate the runtime field; those without one are Handlebars, matching how the
   * template browser treats them.
   */
  const templatePreviewTarget = (
    template: CustomTemplate | BuiltInTemplateMetadata
  ): { value: string; name: string; runtime: ProjectRuntime } | null => {
    const isBuiltIn = builtInTemplateIds.has(template.id);
    const runtime: ProjectRuntime = isBuiltIn
      ? (template as BuiltInTemplateMetadata).runtime
      : (template as CustomTemplate).runtime || 'handlebars';
    if (templatePreviewUnavailableReason(runtime)) return null;
    return {
      value: isBuiltIn ? template.id : `custom:${template.id}`,
      name: template.name,
      runtime,
    };
  };

  const handlePreviewTemplate = (template: CustomTemplate | BuiltInTemplateMetadata) => {
    setPreviewing(templatePreviewTarget(template));
  };
  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    const builtInDelta = Number(builtInTemplateIds.has(a.id)) - Number(builtInTemplateIds.has(b.id));
    if (builtInDelta !== 0) return builtInDelta;
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

  const templatesPagination = usePagination(sortedTemplates, {
    perPage: 24,
    resetOn: [searchQuery, sortBy, typeFilter],
  });
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  if (loading || creating) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Spinner size={48} className="mx-auto text-primary" />
          <p className="mt-4">{creating ? 'Setting up your project...' : 'Loading templates...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="pt-4 px-4 pb-3 sm:pt-6 sm:px-6 sm:pb-3 shrink-0">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-center gap-3">
        <h1 className="text-lg font-semibold shrink-0">Templates</h1>
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
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="server">Backend</SelectItem>
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
          <ViewModeToggle value={viewMode} onChange={setViewMode} />

          {/* Import */}
          <Button onClick={handleImportTemplate} size="sm" className="gap-2">
            <Upload className="h-4 w-4" />
            <span>Import</span>
          </Button>
        </div>
        </div>
      </div>

      {/* Templates Grid/List */}
      <div ref={listScrollRef} className="flex-1 min-h-0 flex flex-col px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="mx-auto w-full max-w-7xl flex-1 min-h-0 flex flex-col">
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
          <div className="flex-1 min-h-0 flex flex-col">
            {templatesPagination.totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
                <PaginationRange
                  total={templatesPagination.total}
                  rangeStart={templatesPagination.rangeStart}
                  rangeEnd={templatesPagination.rangeEnd}
                  totalPages={templatesPagination.totalPages}
                />
                <Pagination
                  page={templatesPagination.page}
                  totalPages={templatesPagination.totalPages}
                  onPageChange={templatesPagination.setPage}
                  scrollTarget={contentScrollRef}
                  className="pt-0 pb-0"
                />
              </div>
            )}
            {viewMode === 'table' ? (
              <div ref={contentScrollRef} className="flex-1 min-h-0 overflow-auto border rounded-lg">
                <table className="w-full table-auto border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none"></th>
                      <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none w-full">Name</th>
                      <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Type</th>
                      <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Runtime</th>
                      <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Author</th>
                      <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">License</th>
                      <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Updated</th>
                      <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {templatesPagination.pageItems.map((template) => {
                      const isBuiltIn = 'isBuiltIn' in template && template.isBuiltIn;
                      const custom = !isBuiltIn ? (template as CustomTemplate) : null;
                      const runtime = isBuiltIn && 'runtime' in template
                        ? getRuntimeBadge((template as BuiltInTemplateMetadata).runtime)
                        : custom?.runtime ? getRuntimeBadge(custom.runtime) : null;
                      const author = custom?.metadata?.author || template.metadata?.author || '';
                      const license = custom?.metadata?.license || '';
                      const updatedAt = custom?.updatedAt || custom?.importedAt;
                      const thumbnail = custom?.metadata?.thumbnail;
                      return (
                        <tr key={template.id} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer h-[44px]" onClick={() => handleCreateProject(template)}>
                          <td className="p-[4px_10px] align-middle">
                            <div className="w-[48px] h-[32px] rounded bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
                              {thumbnail ? (
                                <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-3 h-3 text-muted-foreground opacity-30" />
                              )}
                            </div>
                          </td>
                          <td className="w-full p-[4px_10px] text-[13px] align-middle overflow-hidden" style={{ maxWidth: 0 }}>
                            <div className="min-w-0">
                              <span className="block font-medium text-foreground text-[13px] truncate">{template.name}</span>
                              <span className="block text-[11px] text-muted-foreground truncate">{template.description}</span>
                            </div>
                          </td>
                          <td className="p-[4px_10px] align-middle whitespace-nowrap">
                            <Badge variant={isBuiltIn ? 'secondary' : 'outline'} className="text-[11px] px-[7px] py-[1px] h-auto rounded-full">
                              {isBuiltIn ? 'Built-in' : 'Custom'}
                            </Badge>
                          </td>
                          <td className="p-[4px_10px] align-middle whitespace-nowrap">
                            {runtime && <Badge className={`text-[11px] px-[7px] py-[1px] h-auto rounded-full ${runtime.className}`}>{runtime.label}</Badge>}
                          </td>
                          <td className="p-[4px_10px] text-[13px] text-muted-foreground align-middle whitespace-nowrap">
                            {author || '—'}
                          </td>
                          <td className="p-[4px_10px] text-[13px] text-muted-foreground align-middle whitespace-nowrap">
                            {license || '—'}
                          </td>
                          <td className="p-[4px_10px] text-[13px] text-muted-foreground align-middle whitespace-nowrap overflow-hidden text-ellipsis">
                            {updatedAt ? formatCompactAge(updatedAt) : '—'}
                          </td>
                          <td className="p-[4px_10px] align-middle whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="outline" size="xs" onClick={() => handleCreateProject(template)}>Use</Button>
                              {templatePreviewTarget(template) && (
                                <Button variant="outline" size="xs" onClick={() => handlePreviewTemplate(template)}>Preview</Button>
                              )}
                              {!isBuiltIn && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="xs" className="px-1"><MoreVertical className="w-3.5 h-3.5" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleExportTemplate(template as CustomTemplate)}>
                                      <Download className="w-4 h-4 mr-2" />Export
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDeleteTemplate((template as CustomTemplate).id)} className="text-destructive focus:text-destructive">
                                      <Trash2 className="w-4 h-4 mr-2" />Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div ref={contentScrollRef} className="flex-1 min-h-0 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {templatesPagination.pageItems.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={handleCreateProject}
                    onPreview={templatePreviewTarget(template) ? handlePreviewTemplate : undefined}
                    onDelete={handleDeleteTemplate}
                    onExport={handleExportTemplate}
                    viewMode="grid"
                  />
                ))}
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      <TemplatePreviewDialog
        value={previewing?.value ?? null}
        name={previewing?.name ?? ''}
        runtime={previewing?.runtime ?? 'static'}
        customTemplates={customTemplates}
        onClose={() => setPreviewing(null)}
      />
    </div>
  );
}

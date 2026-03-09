'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Project, CustomTemplate, ProjectRuntime } from '@/lib/vfs/types';
import { getProjectRuntimes } from '@/lib/runtimes/registry';
import { vfs } from '@/lib/vfs';
import { templateService } from '@/lib/vfs/template-service';
import { logger } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ProjectCard } from './project-card';
import { MultipagePreview } from '@/components/preview/multipage-preview';
import { AboutModal } from '@/components/about-modal';
import {
  Plus,
  FolderOpen,
  Upload,
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  Info,
  TestTube,
  Github
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { provisionBackendFeatures } from '@/lib/vfs/provision-backend-features';
import {
  BAREBONES_PROJECT_TEMPLATE,
  DEMO_PROJECT_TEMPLATE,
  CONTACT_LANDING_PROJECT_TEMPLATE,
  BLOG_PROJECT_TEMPLATE,
  REACT_STARTER_PROJECT_TEMPLATE,
  REACT_DEMO_PROJECT_TEMPLATE,
  PREACT_STARTER_PROJECT_TEMPLATE,
  SVELTE_STARTER_PROJECT_TEMPLATE,
  VUE_STARTER_PROJECT_TEMPLATE,
  createProjectFromTemplate,
  BUILT_IN_TEMPLATES,
  getBuiltInTemplatesForRuntime,
  type BuiltInTemplateMetadata
} from '@/lib/vfs/project-templates';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useGuidedTour } from '@/components/guided-tour/context';
import { GuidedTourOverlay } from '@/components/guided-tour/overlay';
import { configManager, migrateBackendKey } from '@/lib/config/storage';
import { TemplateExportDialog } from '@/components/templates/template-export-dialog';
import { ProjectSettingsModal } from '@/components/project-backend';

interface ProjectManagerProps {
  onProjectSelect: (project: Project) => void;
  hideHeader?: boolean; // Hide header when used in PageLayout
  hideFooter?: boolean; // Hide footer when used in PageLayout
}

type SortOption = 'updated' | 'created' | 'name' | 'size';
type ViewMode = 'grid' | 'list';

export function ProjectManager({ onProjectSelect, hideHeader = false, hideFooter = false }: ProjectManagerProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectTemplate, setNewProjectTemplate] = useState<string>('blank');
  const [newProjectRuntime, setNewProjectRuntime] = useState<ProjectRuntime>('static');
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);

  // Helper to get template name from ID for display
  const getTemplateDisplayName = (templateId: string): string => {
    if (templateId.startsWith('custom:')) {
      const customId = templateId.replace('custom:', '');
      const template = customTemplates.find(t => t.id === customId);
      return template?.name || 'Custom Template';
    }
    const builtIn = BUILT_IN_TEMPLATES.find(t => t.id === templateId);
    return builtIn?.name || 'Select a template';
  };

  // Built-in templates filtered by the selected runtime
  const filteredBuiltInTemplates = getBuiltInTemplatesForRuntime(newProjectRuntime);
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [templateExportProject, setTemplateExportProject] = useState<Project | null>(null);
  const [backendProject, setBackendProject] = useState<Project | null>(null);
  const { state: tourState, setProjectList, start: startTour, setTourDemoProjectId } = useGuidedTour();
  const tourStep = tourState.currentStep?.id;
  const tourRunning = tourState.status === 'running';
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [tourActionProjectId, setTourActionProjectId] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const demoCreationRef = useRef(false);

  // Derive backend enabled state from localStorage
  const backendProjectEnabled = backendProject ? migrateBackendKey(backendProject.id) : true;

  const loadCustomTemplates = useCallback(async () => {
    try {
      const templates = await templateService.listCustomTemplates();
      setCustomTemplates(templates);
    } catch (error) {
      logger.error('Failed to load custom templates:', error);
      // Don't show error toast - this is background loading
    }
  }, []);

  const loadProjects = useCallback(async () => {
    // Prevent concurrent executions
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);

    try {
      await vfs.init();

      const projectList = await vfs.listProjects();
      const sorted = projectList.sort((a, b) =>
        b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      setProjects(sorted);
      setProjectList(sorted);

      // Also load custom templates
      await loadCustomTemplates();

    } catch (error) {
      logger.error('Failed to load projects:', error);
      toast.error('Failed to load projects');

    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
      loadingRef.current = false;
    }
  }, [setProjectList, loadCustomTemplates]);

  // Separate function for reloading projects without demo creation logic
  const reloadProjects = useCallback(async () => {
    try {
      await vfs.init();
      const projectList = await vfs.listProjects();
      const sorted = projectList.sort((a, b) => 
        b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      setProjects(sorted);
      setProjectList(sorted);
    } catch (error) {
      logger.error('Failed to reload projects:', error);
      toast.error('Failed to reload projects');
    }
  }, [setProjectList]);

  const createDemoProject = async () => {
    if (demoCreationRef.current) {
      return; // Prevent multiple demo creations
    }
    
    demoCreationRef.current = true;
    
    try {
      const demoProject = await vfs.createProject(
        'Multi-File Demo',
        'Interactive examples showing how HTML, CSS, and JavaScript files work together'
      );
      await createProjectFromTemplate(vfs, demoProject.id, DEMO_PROJECT_TEMPLATE, DEMO_PROJECT_TEMPLATE.assets);
      toast.success('Demo project created successfully');
      await reloadProjects();
      onProjectSelect(demoProject);
      return demoProject;
    } catch (error) {
      logger.error('Failed to create demo project:', error);
      toast.error('Failed to create demo project');
      demoCreationRef.current = false; // Reset on failure
      throw error;
    }
  };

  const handleStartTour = async () => {
    try {
      // Always create a fresh demo project for the tour to ensure correct file structure
      const tourDemo = await vfs.createProject(
        'Example Studios (Tour)',
        'Demo project for guided tour'
      );
      await createProjectFromTemplate(vfs, tourDemo.id, DEMO_PROJECT_TEMPLATE, DEMO_PROJECT_TEMPLATE.assets);

      // Store the demo project ID in tour context
      setTourDemoProjectId(tourDemo.id);

      // Reload projects to show the new demo
      await reloadProjects();

      // Start the tour
      startTour();

      logger.info('[Tour] Created tour demo project:', tourDemo.id);
    } catch (error) {
      logger.error('Failed to prepare for tour:', error);
      toast.error('Failed to start tour - could not create demo project');
    }
  };

  // Initial load only - no dependency on loadProjects to prevent re-runs
  useEffect(() => {
    if (!initialLoadComplete) {
      loadProjects();
    }
  }, []);

  useEffect(() => {
    if (tourRunning && tourStep !== 'create-project') {
      if (createDialogOpen) {
        setCreateDialogOpen(false);
      }
    }
  }, [tourRunning, tourStep, createDialogOpen]);

  useEffect(() => {
    if (tourRunning && tourStep === 'project-controls' && projects.length > 0) {
      setTourActionProjectId(projects[0].id);
    } else {
      setTourActionProjectId(null);
    }
  }, [tourRunning, tourStep, projects]);

  // Handle automatic tour start for first-time users with no projects
  useEffect(() => {
    if (initialLoadComplete && projects.length === 0 && !tourRunning && !configManager.hasSeenTour()) {
      // First-time user with no projects - create demo before starting tour
      handleStartTour();
    }
  }, [initialLoadComplete, projects.length, tourRunning]);

  const createProject = async () => {
    if (!newProjectName.trim()) {
      toast.error('Please enter a project name');
      return;
    }

    if (newProjectName.length > 50) {
      toast.error('Project name must be 50 characters or less');
      return;
    }

    if (newProjectDescription.length > 200) {
      toast.error('Description must be 200 characters or less');
      return;
    }

    try {
      const project = await vfs.createProject(
        newProjectName.trim().slice(0, 50),
        newProjectDescription.trim().slice(0, 200) || undefined
      );

      // Persist runtime in project settings and keep updated object for onProjectSelect
      const finalProject: Project = {
        ...project,
        settings: { ...project.settings, runtime: newProjectRuntime },
      };
      await vfs.updateProject(finalProject);

      // Apply selected template
      if (newProjectTemplate.startsWith('custom:')) {
        // Custom template from IndexedDB
        const customTemplateId = newProjectTemplate.replace('custom:', '');
        const customTemplate = customTemplates.find(t => t.id === customTemplateId);

        if (customTemplate) {
          await createProjectFromTemplate(vfs, finalProject.id, {
            name: customTemplate.name,
            description: customTemplate.description,
            files: customTemplate.files.map(f => ({
              path: f.path,
              content: typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content as ArrayBuffer)
            })),
            directories: customTemplate.directories,
            assets: customTemplate.assets
          });
        }
      } else {
        // Built-in template
        switch (newProjectTemplate) {
          case 'demo':
            await createProjectFromTemplate(vfs, finalProject.id, DEMO_PROJECT_TEMPLATE, DEMO_PROJECT_TEMPLATE.assets);
            break;
          case 'contact-landing':
            await createProjectFromTemplate(vfs, finalProject.id, CONTACT_LANDING_PROJECT_TEMPLATE);
            break;
          case 'blog':
            await createProjectFromTemplate(vfs, finalProject.id, BLOG_PROJECT_TEMPLATE);
            break;
          case 'react-starter':
            await createProjectFromTemplate(vfs, finalProject.id, REACT_STARTER_PROJECT_TEMPLATE);
            break;
          case 'react-demo':
            await createProjectFromTemplate(vfs, finalProject.id, REACT_DEMO_PROJECT_TEMPLATE);
            break;
          case 'preact-starter':
            await createProjectFromTemplate(vfs, finalProject.id, PREACT_STARTER_PROJECT_TEMPLATE);
            break;
          case 'svelte-starter':
            await createProjectFromTemplate(vfs, finalProject.id, SVELTE_STARTER_PROJECT_TEMPLATE);
            break;
          case 'vue-starter':
            await createProjectFromTemplate(vfs, finalProject.id, VUE_STARTER_PROJECT_TEMPLATE);
            break;
          case 'blank':
          default:
            await createProjectFromTemplate(vfs, finalProject.id, BAREBONES_PROJECT_TEMPLATE);
            break;
        }
      }

      // Provision backend features if the selected template has them
      {
        const builtInTemplate = BUILT_IN_TEMPLATES.find(t => t.id === newProjectTemplate) as BuiltInTemplateMetadata | undefined;
        const backendFeatures = builtInTemplate?.backendFeatures;
        if (backendFeatures) {
          try {
            await provisionBackendFeatures(finalProject.id, backendFeatures);
          } catch (provisionError) {
            logger.error('Failed to provision backend features:', provisionError);
            toast.warning('Project created but backend features provisioning failed.');
          }
        }
      }

      toast.success('Project created successfully');
      setCreateDialogOpen(false);
      setNewProjectName('');
      setNewProjectDescription('');
      setNewProjectTemplate('blank');
      setNewProjectRuntime('static');
      await reloadProjects();
      onProjectSelect(finalProject);
    } catch (error) {
      logger.error('Failed to create project:', error);
      toast.error('Failed to create project');
    }
  };

  const deleteProject = async (project: Project) => {
    if (!confirm(`Are you sure you want to delete "${project.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await vfs.deleteProject(project.id);
      localStorage.removeItem(`osw-db-schema-${project.id}`);
      toast.success('Project deleted');
      await reloadProjects();
    } catch (error) {
      logger.error('Failed to delete project:', error);
      toast.error('Failed to delete project');
    }
  };

  const duplicateProject = async (project: Project) => {
    try {
      const newProject = await vfs.duplicateProject(project.id);
      toast.success('Project duplicated successfully');
      await reloadProjects();
      onProjectSelect(newProject);
    } catch (error) {
      logger.error('Failed to duplicate project:', error);
      toast.error('Failed to duplicate project');
    }
  };

  const exportProject = async (project: Project) => {
    try {
      const data = await vfs.exportProject(project.id);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, '-')}-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Project exported');
    } catch (error) {
      logger.error('Failed to export project:', error);
      toast.error('Failed to export project');
    }
  };

  const exportProjectAsZip = async (project: Project) => {
    try {
      const blob = await vfs.exportProjectAsZip(project.id);
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Project exported as ZIP');
    } catch (error) {
      logger.error('Failed to export project as ZIP:', error);
      toast.error('Failed to export project as ZIP');
    }
  };

  const importProject = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.project || !data.files) {
          throw new Error('Invalid project file');
        }
        
        const imported = await vfs.importProject(data);
        toast.success('Project imported successfully');
        await reloadProjects();
        onProjectSelect(imported);
      } catch (error) {
        logger.error('Failed to import project:', error);
        toast.error('Failed to import project');
      }
    };
    
    input.click();
  };

  const sortProjects = (projects: Project[], sortBy: SortOption): Project[] => {
    const sorted = [...projects];
    switch (sortBy) {
      case 'updated':
        return sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      case 'created':
        return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'size':
        // Note: This would require loading stats for all projects
        // For now, fallback to updated date
        return sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      default:
        return sorted;
    }
  };

  const filteredProjects = sortProjects(
    projects.filter(project =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    sortBy
  );

  if (loading && !initialLoadComplete) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh]" style={{ background: `linear-gradient(var(--project-background-tint), var(--project-background-tint)), var(--background)` }}>
      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-auto">
        <div className="h-full flex flex-col">
            {/* Toolbar */}
            <div className="pt-4 px-4 pb-3 sm:pt-6 sm:px-6 sm:pb-3 shrink-0">
              <div className="mx-auto max-w-7xl flex flex-col sm:flex-row gap-3" data-tour-id="projects-actions">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
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
                            <SelectItem value="created">Date Created</SelectItem>
                            <SelectItem value="name">Name</SelectItem>
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

                  {/* New Project */}
                  <Button onClick={() => setCreateDialogOpen(true)} size="sm" className="gap-2" data-tour-id="new-project-button">
                    <Plus className="h-4 w-4" />
                    <span>New</span>
                  </Button>

                  {/* Import */}
                  <Button onClick={importProject} variant="outline" size="sm" className="gap-2">
                    <Upload className="h-4 w-4" />
                    <span>Import</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Projects Grid/List */}
            <div className="flex-1 px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6">
              <div className="mx-auto max-w-7xl">
                {filteredProjects.length === 0 ? (
                  <div className="text-center py-12">
                    <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h2 className="text-xl font-semibold mb-2">
                      {searchQuery ? 'No projects found' : 'No projects yet'}
                    </h2>
                    <p className="text-muted-foreground mb-6">
                      {searchQuery
                        ? 'Try a different search term'
                        : 'Create your first project to get started'}
                    </p>
                    {!searchQuery && (
                      <div className="flex gap-3 justify-center">
                        <Button onClick={() => setCreateDialogOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Create Project
                        </Button>
                        <Button variant="outline" onClick={createDemoProject}>
                          <FolderOpen className="mr-2 h-4 w-4" />
                          Create Demo Project
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className={viewMode === 'grid'
                      ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                      : 'space-y-3'}
                    data-tour-id="projects-list"
                  >
                    {filteredProjects.map(project => {
                      if (typeof project !== 'object' || !project.id || !project.name) {
                        logger.error('Invalid project object:', project);
                        return null;
                      }

                      return (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          onSelect={onProjectSelect}
                          onDelete={deleteProject}
                          onExport={exportProject}
                          onExportZip={exportProjectAsZip}
                          onDuplicate={duplicateProject}
                          onPreview={setPreviewProject}
                          onExportAsTemplate={setTemplateExportProject}
                          onBackend={setBackendProject}
                          onUpdate={async (updatedProject) => {
                            // Update IndexedDB to persist changes
                            await vfs.updateProject(updatedProject);

                            // Update React state
                            setProjects(projects.map(p =>
                              p.id === updatedProject.id ? updatedProject : p
                            ));
                          }}
                          viewMode={viewMode}
                          forceMenuOpen={tourActionProjectId === project.id}
                          highlightExport={tourRunning && tourStep === 'project-controls' && tourActionProjectId === project.id}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
      </main>

      {/* Footer with Navigation Buttons - Hidden on mobile */}
      {!hideFooter && (
        <footer className="hidden md:block border-t bg-card/50 py-3 px-6">
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartTour}
              disabled={tourRunning}
              data-tour-id="footer-guided-tour"
            >
              <Info className="mr-2 h-4 w-4" />
              Guided Tour
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/test-generation')}
            >
              <TestTube className="mr-2 h-4 w-4" />
              Benchmark
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAboutModalOpen(true)}
            >
              <Info className="mr-2 h-4 w-4" />
              About OSW Studio
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a
                href="https://github.com/o-stahl/osw-studio"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="mr-2 h-4 w-4" />
                GitHub
              </a>
            </Button>
          </div>
        </footer>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Start a new project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center">
                <Label htmlFor="name">Project Name</Label>
                <span className="text-xs text-muted-foreground">
                  {newProjectName.length}/50
                </span>
              </div>
              <Input
                id="name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value.slice(0, 50))}
                placeholder="My Awesome Website"
                className="mt-2"
                maxLength={50}
              />
            </div>
            <div>
              <Label htmlFor="runtime">Runtime</Label>
              <Select
                value={newProjectRuntime}
                onValueChange={(value) => {
                  const runtime = value as ProjectRuntime;
                  setNewProjectRuntime(runtime);
                  // Reset template to first available for this runtime
                  const templates = getBuiltInTemplatesForRuntime(runtime);
                  setNewProjectTemplate(templates[0]?.id || 'blank');
                }}
              >
                <SelectTrigger id="runtime" className="mt-2 w-full">
                  <div className="truncate flex-1 text-left">
                    {getProjectRuntimes().find(r => r.value === newProjectRuntime)?.label}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {getProjectRuntimes().map(rt => (
                    <SelectItem key={rt.value} value={rt.value}>
                      <div className="flex flex-col gap-0.5">
                        <div className="font-medium">{rt.label}</div>
                        <div className="text-xs text-muted-foreground">{rt.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">You can change this later in project settings.</p>
            </div>
            <div>
              <Label htmlFor="template">Template</Label>
              <Select
                value={newProjectTemplate}
                onValueChange={setNewProjectTemplate}
              >
                <SelectTrigger id="template" className="mt-2 w-full">
                  <div className="truncate flex-1 text-left">
                    {getTemplateDisplayName(newProjectTemplate)}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {filteredBuiltInTemplates.length > 0 && (
                    <SelectGroup>
                      {filteredBuiltInTemplates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          <div className="flex flex-col gap-0.5">
                            <div className="font-medium">{template.name}</div>
                            <div className="text-xs text-muted-foreground">{template.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {(() => {
                    const filtered = customTemplates.filter(t => (t.runtime || 'static') === newProjectRuntime);
                    return filtered.length > 0 ? (
                      <SelectGroup>
                        <SelectLabel>Custom Templates</SelectLabel>
                        {filtered.map(template => (
                          <SelectItem key={template.id} value={`custom:${template.id}`}>
                            <div className="flex flex-col gap-0.5">
                              <div className="font-medium">{template.name}</div>
                              <div className="text-xs text-muted-foreground">{template.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null;
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex justify-between items-center">
                <Label htmlFor="description">Description (optional)</Label>
                <span className="text-xs text-muted-foreground">
                  {newProjectDescription.length}/200
                </span>
              </div>
              <Textarea
                id="description"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value.slice(0, 200))}
                placeholder="A brief description of your project"
                className="mt-2 resize-none"
                rows={3}
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createProject}>
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      {previewProject && (
        <Dialog open={!!previewProject} onOpenChange={() => setPreviewProject(null)}>
          <DialogContent className="max-w-[90vw] sm:max-w-[85vw] lg:max-w-[80vw] 2xl:max-w-[1400px] max-h-[90vh] w-full h-full p-0 flex flex-col">
            <DialogHeader className="p-4 border-b">
              <DialogTitle>Preview: {previewProject.name}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              <MultipagePreview
                projectId={previewProject.id}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Template Export Dialog */}
      <TemplateExportDialog
        project={templateExportProject}
        open={!!templateExportProject}
        onOpenChange={(open) => {
          if (!open) setTemplateExportProject(null);
        }}
      />

      {/* Project Settings Modal */}
      {backendProject && (
        <ProjectSettingsModal
          project={backendProject}
          isOpen={true}
          onClose={() => setBackendProject(null)}
          onProjectUpdate={(updated: Project) => setBackendProject(updated)}
          enabled={backendProjectEnabled}
          onToggleEnabled={(enabled: boolean) => {
            localStorage.setItem(`osw-backend-${backendProject.id}`, String(enabled));
            setBackendProject({ ...backendProject }); // Force re-derive enabled state
          }}
        />
      )}

      {/* About Modal */}
      <AboutModal
        open={aboutModalOpen}
        onOpenChange={setAboutModalOpen}
      />

      <GuidedTourOverlay location="project-manager" />
    </div>
  );
}

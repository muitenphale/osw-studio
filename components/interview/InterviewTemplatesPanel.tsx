'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { InterviewTemplate } from '@/lib/interview/types';
import { interviewTemplatesService } from '@/lib/interview/templates-service';
import { track } from '@/lib/telemetry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, Plus, Edit, Copy, Trash2, Eye, ClipboardList, FileText, MoreVertical } from 'lucide-react';
import { ViewModeToggle, useViewMode } from '@/components/ui/view-mode-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InterviewTemplateEditor } from './InterviewTemplateEditor';

interface InterviewTemplatesPanelProps {
  initialMode?: 'list' | 'create';
  onChanged?: () => void;
}

type View =
  | 'list'
  | { mode: 'create' }
  | { mode: 'edit'; template: InterviewTemplate }
  | { mode: 'view'; template: InterviewTemplate };

export function InterviewTemplatesPanel({
  initialMode = 'list',
  onChanged,
}: InterviewTemplatesPanelProps) {
  const [templates, setTemplates] = useState<InterviewTemplate[]>([]);
  const [view, setView] = useState<View>(initialMode === 'create' ? { mode: 'create' } : 'list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBuiltIn, setShowBuiltIn] = useState(true);
  const [showCustom, setShowCustom] = useState(true);
  const [templateToDelete, setTemplateToDelete] = useState<InterviewTemplate | null>(null);
  const [viewMode, setViewMode] = useViewMode('interviews');

  const reloadList = useCallback(async () => {
    try {
      const all = await interviewTemplatesService.getAllTemplates();
      setTemplates(all);
    } catch {
      toast.error('Failed to load interview templates');
    }
  }, []);

  useEffect(() => {
    reloadList();
  }, [reloadList]);

  const handleDuplicate = async (src: InterviewTemplate) => {
    try {
      const id = await interviewTemplatesService.generateId(src.title + ' copy');
      await interviewTemplatesService.createTemplate({
        ...src,
        id,
        title: `${src.title} copy`,
        isBuiltIn: false,
      });
      track('interview_template_created');
      await reloadList();
      onChanged?.();
      const created = await interviewTemplatesService.getTemplate(id);
      if (created) {
        toast.success(`Duplicated: ${src.title}`);
        setView({ mode: 'edit', template: created });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to duplicate template';
      toast.error(message);
    }
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      await interviewTemplatesService.deleteTemplate(templateToDelete.id);
      track('interview_template_deleted');
      toast.success(`Deleted: ${templateToDelete.title}`);
      await reloadList();
      onChanged?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete template';
      toast.error(message);
    } finally {
      setTemplateToDelete(null);
    }
  };

  const handleEditorSaved = async () => {
    await reloadList();
    setView('list');
    onChanged?.();
  };

  const filtered = templates.filter(t => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (t.isBuiltIn && !showBuiltIn) return false;
    if (!t.isBuiltIn && !showCustom) return false;
    return true;
  }).sort((a, b) => Number(!!a.isBuiltIn) - Number(!!b.isBuiltIn)); // custom first, then built-in

  const inEditor = view !== 'list';
  const editorTemplate =
    inEditor && view.mode === 'create' ? null : inEditor ? view.template : null;

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="px-6 pt-6 pb-3 shrink-0 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h1 className="text-lg font-semibold shrink-0">Interviews</h1>
            <div className="flex items-center shrink-0">
              <Button size="sm" onClick={() => setView({ mode: 'create' })}>
                <Plus className="w-4 h-4 mr-2" />
                New
              </Button>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Show:</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 gap-1.5"
              // Active: mild orange fill + border (matches the enabled-skill card). Inline so it wins
              // over the outline variant's dark bg/border in both themes.
              style={showBuiltIn ? { backgroundColor: 'color-mix(in oklab, var(--primary) 5%, transparent)', borderColor: 'color-mix(in oklab, var(--primary) 30%, transparent)' } : undefined}
              onClick={() => setShowBuiltIn(v => !v)}
              aria-pressed={showBuiltIn}
            >
              <FileText className="w-3 h-3" />
              Built-in
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 gap-1.5"
              style={showCustom ? { backgroundColor: 'color-mix(in oklab, var(--primary) 5%, transparent)', borderColor: 'color-mix(in oklab, var(--primary) 30%, transparent)' } : undefined}
              onClick={() => setShowCustom(v => !v)}
              aria-pressed={showCustom}
            >
              <ClipboardList className="w-3 h-3" />
              Custom
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col px-6 pb-6">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No templates found</h3>
              <p className="text-muted-foreground mb-4">
                {!showBuiltIn && !showCustom
                  ? 'Both Built-in and Custom are hidden. Enable at least one above.'
                  : searchQuery
                    ? 'Try a different search query'
                    : 'Create your first interview template'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setView({ mode: 'create' })}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Template
                </Button>
              )}
            </div>
          ) : viewMode === 'table' ? (
            <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
              <table className="w-full table-auto border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none w-full">Title</th>
                    <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Type</th>
                    <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Items</th>
                    <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Artifact</th>
                    <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer h-[44px]" onClick={() => setView(t.isBuiltIn ? { mode: 'view', template: t } : { mode: 'edit', template: t })}>
                      <td className="w-full p-[4px_10px] text-[13px] align-middle overflow-hidden" style={{ maxWidth: 0 }}>
                        <div className="min-w-0">
                          <span className="block font-medium text-foreground text-[13px] truncate">{t.title}</span>
                          <span className="block text-[11px] text-muted-foreground truncate">{t.description}</span>
                        </div>
                      </td>
                      <td className="p-[4px_10px] align-middle whitespace-nowrap">
                        <Badge variant={t.isBuiltIn ? 'secondary' : 'outline'} className="text-[11px] px-[7px] py-[1px] h-auto rounded-full">
                          {t.isBuiltIn ? 'Built-in' : 'Custom'}
                        </Badge>
                      </td>
                      <td className="p-[4px_10px] text-[13px] text-muted-foreground align-middle whitespace-nowrap tabular-nums">{t.items.length}</td>
                      <td className="p-[4px_10px] text-[11px] text-muted-foreground align-middle whitespace-nowrap font-mono overflow-hidden text-ellipsis" style={{ maxWidth: 260 }}>
                        {t.artifacts[0]?.path ?? '—'}
                      </td>
                      <td className="p-[4px_10px] align-middle whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {t.isBuiltIn ? (
                            <>
                              <Button variant="outline" size="xs" onClick={() => setView({ mode: 'view', template: t })}>View</Button>
                              <Button variant="outline" size="xs" onClick={() => handleDuplicate(t)}>Duplicate</Button>
                            </>
                          ) : (
                            <>
                              <Button variant="outline" size="xs" onClick={() => setView({ mode: 'edit', template: t })}>
                                <Edit className="w-3 h-3" />Edit
                              </Button>
                              <Button variant="outline" size="xs" onClick={() => handleDuplicate(t)}>Duplicate</Button>
                            </>
                          )}
                          {!t.isBuiltIn && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="xs" className="px-1"><MoreVertical className="w-3.5 h-3.5" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setTemplateToDelete(t)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="w-4 h-4 mr-2" />Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="grid gap-3">
              {filtered.map(t => (
                <div key={t.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold truncate">{t.title}</h3>
                        <Badge variant={t.isBuiltIn ? 'secondary' : 'outline'} className="text-xs">
                          {t.isBuiltIn ? 'Built-in' : 'Custom'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                      {t.artifacts[0] && (
                        <p className="text-xs text-muted-foreground/80 mt-1 font-mono truncate">
                          {t.artifacts[0].path}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {t.isBuiltIn ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setView({ mode: 'view', template: t })}
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDuplicate(t)}
                            title="Duplicate"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setView({ mode: 'edit', template: t })}
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDuplicate(t)}
                            title="Duplicate"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTemplateToDelete(t)}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor dialog (matches the Skills editor: a modal over the list) */}
      <Dialog open={inEditor} onOpenChange={(o) => !o && setView('list')}>
        <DialogContent className="max-w-[90vw] sm:max-w-[85vw] lg:max-w-3xl h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {editorTemplate ? `Edit ${editorTemplate.title}` : 'Create interview template'}
            </DialogTitle>
          </DialogHeader>
          {inEditor && (
            <InterviewTemplateEditor
              template={editorTemplate}
              onSaved={handleEditorSaved}
              onCancel={() => setView('list')}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!templateToDelete} onOpenChange={(o) => !o && setTemplateToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              {templateToDelete
                ? `Are you sure you want to delete "${templateToDelete.title}"? This action cannot be undone.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateToDelete(null)}>
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

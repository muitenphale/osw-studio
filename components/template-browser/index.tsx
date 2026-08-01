'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Search, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BUILT_IN_TEMPLATES } from '@/lib/vfs/templates/registry';
import { getRuntimeConfig, getRuntimeBadge } from '@/lib/runtimes/registry';
import type { CustomTemplate, ProjectRuntime } from '@/lib/vfs/types';

/**
 * Browse every template in one list and pick one.
 *
 * Project creation used to ask for a runtime first and then offer only the templates belonging to
 * it, which meant knowing what "Handlebars" or "Preact" implied before seeing what you could build.
 * Here the template is the choice and the runtime follows from it.
 *
 * The list stays table-like on purpose: one row per template, details (including the thumbnail, if
 * the template has one) only on expand. A visual grid would not survive a few hundred templates.
 */

/** A built-in or custom template flattened to what the list needs. */
interface BrowsableTemplate {
  /** Selection value: a built-in id, or `custom:<id>`. */
  value: string;
  name: string;
  description: string;
  runtime: ProjectRuntime;
  isBuiltIn: boolean;
  tags: string[];
  author?: string;
  license?: string;
  thumbnail?: string;
  hasBackendFeatures: boolean;
}

/** Custom templates predate the runtime field; those without one are Handlebars. */
const LEGACY_CUSTOM_RUNTIME: ProjectRuntime = 'handlebars';

function hasBackendFeatures(features: unknown): boolean {
  if (!features || typeof features !== 'object') return false;
  return Object.values(features as Record<string, unknown>).some(
    (v) => v === true || (Array.isArray(v) && v.length > 0)
  );
}

export function toBrowsableTemplates(customTemplates: CustomTemplate[]): BrowsableTemplate[] {
  const builtIns: BrowsableTemplate[] = BUILT_IN_TEMPLATES.map((t) => ({
    value: t.id,
    name: t.name,
    description: t.description,
    runtime: t.runtime,
    isBuiltIn: true,
    tags: t.metadata?.tags ?? [],
    author: t.metadata?.author,
    hasBackendFeatures: hasBackendFeatures(t.backendFeatures),
  }));

  const custom: BrowsableTemplate[] = customTemplates.map((t) => ({
    value: `custom:${t.id}`,
    name: t.name,
    description: t.description,
    runtime: t.runtime || LEGACY_CUSTOM_RUNTIME,
    isBuiltIn: false,
    tags: t.metadata?.tags ?? [],
    author: t.metadata?.author,
    license: t.metadata?.license,
    thumbnail: t.metadata?.thumbnail,
    hasBackendFeatures: hasBackendFeatures(t.backendFeatures),
  }));

  return [...builtIns, ...custom];
}

/** The runtime a template will give the project. */
export function runtimeForTemplate(
  value: string,
  customTemplates: CustomTemplate[]
): ProjectRuntime {
  if (value.startsWith('custom:')) {
    const id = value.slice('custom:'.length);
    return customTemplates.find((t) => t.id === id)?.runtime || LEGACY_CUSTOM_RUNTIME;
  }
  return BUILT_IN_TEMPLATES.find((t) => t.id === value)?.runtime || 'static';
}

function runtimeLabel(runtime: ProjectRuntime): string {
  return getRuntimeConfig(runtime).label;
}

interface TemplateBrowserPanelProps {
  customTemplates: CustomTemplate[];
  /** Currently applied selection, so returning here starts where the user left off. */
  value: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  /** Reports the highlighted row so the dialog header can show it before it is applied. */
  onPendingChange?: (value: string) => void;
  /** Server mode only: used to route to template management. */
  workspaceId?: string;
}

/**
 * Fills the create dialog when it switches to template mode. Sized by its parent, which supplies
 * the header and back button — the same shape the Describe view uses.
 */
export function TemplateBrowserPanel({
  customTemplates,
  value,
  onConfirm,
  onCancel,
  onPendingChange,
  workspaceId,
}: TemplateBrowserPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [runtimeFilter, setRuntimeFilter] = useState<ProjectRuntime | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  // Confirming is what applies the choice, so the pending pick is local until then.
  const [pending, setPending] = useState(value);

  const select = (next: string) => {
    setPending(next);
    onPendingChange?.(next);
  };

  /**
   * Server mode routes per workspace, falling back to the legacy /admin path that middleware
   * redirects to the default workspace. Browser mode keeps the view in React state, so it listens
   * for `nav-to-view` instead — the same way the other dialogs leave for another view.
   *
   * Keyed off the mode rather than whether a workspace id was passed: server mode without one is
   * a real case, and treating it as browser mode would dispatch an event nothing listens for.
   */
  const goToTemplates = () => {
    if (process.env.NEXT_PUBLIC_SERVER_MODE === 'true') {
      router.push(workspaceId ? `/w/${workspaceId}/templates` : '/admin/templates');
      return;
    }
    window.dispatchEvent(new CustomEvent('nav-to-view', { detail: { view: 'templates' } }));
  };

  const all = useMemo(() => toBrowsableTemplates(customTemplates), [customTemplates]);

  const runtimes = useMemo(() => {
    const present = new Set(all.map((t) => t.runtime));
    return Array.from(present).sort();
  }, [all]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((t) => {
      if (runtimeFilter !== 'all' && t.runtime !== runtimeFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q)
        || t.description.toLowerCase().includes(q)
        || t.tags.some((tag) => tag.toLowerCase().includes(q))
        || runtimeLabel(t.runtime).toLowerCase().includes(q)
      );
    });
  }, [all, query, runtimeFilter]);

  const pendingTemplate = all.find((t) => t.value === pending);

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="px-4 py-3 space-y-3 shrink-0 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates"
            className="pl-9"
            aria-label="Search templates"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={runtimeFilter === 'all'}
            onClick={() => setRuntimeFilter('all')}
            label={`All (${all.length})`}
          />
          {runtimes.map((rt) => (
            <FilterChip
              key={rt}
              active={runtimeFilter === rt}
              onClick={() => setRuntimeFilter(rt)}
              label={runtimeLabel(rt)}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 px-4 text-center">
            No templates match “{query}”.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((template) => (
              <TemplateRow
                key={template.value}
                template={template}
                selected={pending === template.value}
                expanded={expanded === template.value}
                onSelect={() => select(template.value)}
                onToggleExpand={() =>
                  setExpanded((prev) => (prev === template.value ? null : template.value))
                }
              />
            ))}
          </ul>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={goToTemplates}>
          Manage templates
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!pendingTemplate}
            onClick={() => pendingTemplate && onConfirm(pendingTemplate.value)}
          >
            {pendingTemplate ? `Use ${pendingTemplate.name}` : 'Use template'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
        active
          ? 'bg-primary/10 text-foreground font-semibold'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

function TemplateRow({
  template,
  selected,
  expanded,
  onSelect,
  onToggleExpand,
}: {
  template: BrowsableTemplate;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}) {
  const runtimeBadge = getRuntimeBadge(template.runtime);

  return (
    <li className={cn('px-4', selected && 'bg-primary/10')}>
      <div className="flex items-center gap-2 py-2.5">
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={onToggleExpand}
          aria-pressed={selected}
          className="flex-1 min-w-0 text-left flex items-center gap-3"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className={cn('truncate text-sm', selected ? 'font-semibold' : 'font-medium')}>
                {template.name}
              </span>
              {!template.isBuiltIn && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-auto shrink-0">
                  Custom
                </Badge>
              )}
              {template.hasBackendFeatures && (
                <Server
                  className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                  aria-label="Includes backend features"
                />
              )}
            </span>
            {/* Expanded rows show the description in full. */}
            <span
              className={cn(
                'block text-xs text-muted-foreground mt-0.5',
                expanded ? 'whitespace-normal' : 'truncate'
              )}
            >
              {template.description}
            </span>
          </span>
          <Badge
            className={cn(
              'text-[10px] px-1.5 py-0 h-auto shrink-0 hidden sm:inline-flex',
              runtimeBadge.className
            )}
          >
            {runtimeBadge.label}
          </Badge>
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? `Hide details for ${template.name}` : `Show details for ${template.name}`}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
        >
          <ChevronRight className={cn('w-4 h-4 transition-transform', expanded && 'rotate-90')} />
        </button>
      </div>

      {expanded && (
        <div className="pb-3 pr-8 space-y-3">
          {template.thumbnail && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={template.thumbnail}
              alt=""
              className="rounded-md border border-border/60 max-h-40 w-auto"
            />
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Runtime</dt>
            <dd>{runtimeLabel(template.runtime)}</dd>
            {template.author && (
              <>
                <dt className="text-muted-foreground">Author</dt>
                <dd>{template.author}</dd>
              </>
            )}
            {template.license && (
              <>
                <dt className="text-muted-foreground">License</dt>
                <dd>{template.license}</dd>
              </>
            )}
            {template.hasBackendFeatures && (
              <>
                <dt className="text-muted-foreground">Includes</dt>
                <dd>Backend features</dd>
              </>
            )}
          </dl>
          {template.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {template.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-auto">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

'use client';

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import {
  LayoutGrid, FileText, Layers, Palette, DollarSign,
  Shield, Database, Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { configManager } from '@/lib/config/storage';
import { hasAnyConnectedProvider } from '@/lib/llm/providers/connection-status';
import { ModelsPane } from '@/components/providers-models/models-pane';
import { ConnectionsPane } from '@/components/providers-models/connections-pane';
import { TemplatesPane } from '@/components/providers-models/templates-pane';
import { AppearancePane } from '@/components/settings/appearance-pane';
import { CostTrackingPane } from '@/components/settings/cost-tracking-pane';
import { PermissionsPane } from '@/components/settings/permissions-pane';
import { DataPane } from '@/components/settings/data-pane';
import { PageShell, PageHeader, PageBody } from '@/components/ui/page-shell';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Pane registry
// ---------------------------------------------------------------------------

export type SettingsPane =
  | 'connections'
  | 'models'
  | 'templates'
  | 'appearance'
  | 'costs'
  | 'permissions'
  | 'data';

interface PaneDef {
  id: SettingsPane;
  label: string;
  icon: React.ReactNode;
}

const PANES: PaneDef[] = [
  { id: 'connections', label: 'Connections',   icon: <FileText className="size-4 shrink-0" /> },
  { id: 'models',      label: 'Models',        icon: <LayoutGrid className="size-4 shrink-0" /> },
  { id: 'templates',   label: 'Templates',     icon: <Layers className="size-4 shrink-0" /> },
  { id: 'appearance',  label: 'Appearance',    icon: <Palette className="size-4 shrink-0" /> },
  { id: 'costs',       label: 'Cost Tracking', icon: <DollarSign className="size-4 shrink-0" /> },
  { id: 'permissions', label: 'Permissions',   icon: <Shield className="size-4 shrink-0" /> },
  { id: 'data',        label: 'Data',          icon: <Database className="size-4 shrink-0" /> },
];

// ---------------------------------------------------------------------------
// Pane content
// ---------------------------------------------------------------------------

function PaneContent({ pane }: { pane: SettingsPane }) {
  switch (pane) {
    case 'connections': return <ConnectionsPane />;
    case 'models':      return <ModelsPane />;
    case 'templates':   return <TemplatesPane />;
    case 'appearance':  return <AppearancePane />;
    case 'costs':       return <CostTrackingPane />;
    case 'permissions': return <PermissionsPane />;
    case 'data':        return <DataPane />;
  }
}

// ---------------------------------------------------------------------------
// Sidebar nav (shared between modal and inline modes)
// ---------------------------------------------------------------------------

function SettingsNav({
  activePane,
  onChange,
}: {
  activePane: SettingsPane;
  onChange: (pane: SettingsPane) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const c = containerRef.current;
      const m = measureRef.current;
      if (!c || !m) return;
      setCollapsed(m.scrollWidth + 8 > c.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const active = PANES.find((p) => p.id === activePane) ?? PANES[0];

  return (
    <nav ref={containerRef} className="shrink-0 md:flex md:flex-col md:gap-0.5 md:border-r border-border/60 md:py-6 md:pl-6 md:pr-3 md:w-48">
      {/* Hidden measurer for inline button row */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap md:hidden"
      >
        {PANES.map((item) => (
          <span key={item.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
            {item.icon}
            {item.label}
          </span>
        ))}
      </div>

      {/* Mobile: dropdown or inline buttons */}
      <div className="md:hidden p-3 border-b border-border/60">
        {collapsed ? (
          <Select value={activePane} onValueChange={(v) => onChange(v as SettingsPane)}>
            <SelectTrigger className="w-full">
              <span className="flex items-center gap-2 text-sm">
                {active.icon}
                {active.label}
              </span>
            </SelectTrigger>
            <SelectContent>
              {PANES.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <span className="flex items-center gap-2">
                    {item.icon}
                    {item.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto">
            {PANES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                style={activePane === item.id ? { backgroundColor: 'var(--sidebar-active-surface)' } : undefined}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-full text-[13px] font-medium transition-colors select-none whitespace-nowrap shrink-0',
                  activePane === item.id
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: sidebar buttons */}
      <div className="hidden md:flex md:flex-col md:gap-0.5">
        {PANES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={activePane === item.id ? { backgroundColor: 'var(--sidebar-active-surface)' } : undefined}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-full text-[13px] font-medium transition-colors select-none whitespace-nowrap w-full text-left',
              activePane === item.id
                ? 'text-foreground font-semibold'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// UnifiedSettings — the main export
// ---------------------------------------------------------------------------

export interface UnifiedSettingsProps {
  /** Which pane to show initially. Defaults to connections (or models if connected). */
  initialPane?: SettingsPane;
  /** When true, renders its own left-nav sidebar (for modal usage). */
  showSidebar?: boolean;
  /** Controlled active pane from external navigation (sidebar sub-items). */
  activePane?: SettingsPane;
}

export function UnifiedSettings({
  initialPane,
  showSidebar = false,
  activePane: controlledPane,
}: UnifiedSettingsProps) {
  const defaultPane = initialPane ?? (hasAnyConnectedProvider() ? 'models' : 'connections');
  const [internalPane, setInternalPane] = useState<SettingsPane>(defaultPane);

  const currentPane = controlledPane ?? internalPane;

  useEffect(() => {
    configManager.migrateModels();
  }, []);

  // Sync internal state when controlled pane changes
  useEffect(() => {
    if (controlledPane) setInternalPane(controlledPane);
  }, [controlledPane]);

  if (showSidebar) {
    return (
      <div className="flex flex-col md:flex-row h-full min-h-0">
        <SettingsNav activePane={currentPane} onChange={setInternalPane} />
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 md:p-6">
          <PaneContent pane={currentPane} />
        </div>
      </div>
    );
  }

  const activeLabel = PANES.find((p) => p.id === currentPane)?.label ?? '';

  return (
    <PageShell>
      <PageHeader title="Settings" maxWidth="max-w-4xl">
        <span className="text-lg font-normal text-muted-foreground">· {activeLabel}</span>
      </PageHeader>
      <PageBody maxWidth="max-w-4xl">
        <PaneContent pane={currentPane} />
      </PageBody>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// UnifiedSettingsModal — for workspace / chat panel usage
// ---------------------------------------------------------------------------

export interface UnifiedSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPane?: SettingsPane;
}

export function UnifiedSettingsModal({
  open,
  onOpenChange,
  initialPane = 'connections',
}: UnifiedSettingsModalProps) {
  const handleOpenChange = useCallback((v: boolean) => onOpenChange(v), [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-4xl w-[calc(100vw-1.5rem)] max-w-none sm:w-auto p-0 gap-0 overflow-hidden"
        style={{ display: 'flex', flexDirection: 'column', height: 'min(90vh, calc(100dvh - 3rem))' }}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex items-center gap-2 px-6 py-4 border-b shrink-0">
          <SettingsIcon className="h-4 w-4" />
          <h2 className="font-semibold text-base">Settings</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <UnifiedSettings initialPane={initialPane} showSidebar />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Re-export pane type for sidebar routing
export { PANES as SETTINGS_PANES };

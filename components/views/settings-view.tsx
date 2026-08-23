'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { UnifiedSettings, type SettingsPane } from '@/components/unified-settings';

const VALID_PANES = new Set<SettingsPane>([
  'connections', 'models', 'templates', 'appearance', 'costs', 'permissions', 'data',
]);

// Backward compat: map old param values to new pane IDs
const LEGACY_MAP: Record<string, SettingsPane> = {
  application: 'appearance',
  model: 'models',
};

interface SettingsViewProps {
  tab?: string;
}

function SettingsViewInner({ tab }: SettingsViewProps) {
  const searchParams = useSearchParams();
  const raw = searchParams.get('settings') || tab || 'connections';
  const pane: SettingsPane =
    VALID_PANES.has(raw as SettingsPane) ? raw as SettingsPane
    : LEGACY_MAP[raw] ?? 'connections';

  return (
    <div className="h-full flex flex-col">
      <UnifiedSettings activePane={pane} />
    </div>
  );
}

export function SettingsView({ tab }: SettingsViewProps) {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>}>
      <SettingsViewInner tab={tab} />
    </Suspense>
  );
}

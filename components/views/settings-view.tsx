'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ModelSettingsPanel } from '@/components/settings/model-settings';
import { SettingsPanel } from '@/components/settings';

interface SettingsViewProps {
  tab?: 'model' | 'application';
}

function SettingsViewInner({ tab }: SettingsViewProps) {
  const searchParams = useSearchParams();
  // URL param takes precedence, then prop, then default to 'model'
  const settingsTab = searchParams.get('settings') as 'model' | 'application' | null;
  const activeTab = settingsTab || tab || 'model';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'application' ? <SettingsPanel /> : <ModelSettingsPanel />}
      </div>
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

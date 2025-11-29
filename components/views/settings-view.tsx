'use client';

import React from 'react';
import { ModelSettingsPanel } from '@/components/settings/model-settings';
import { SettingsPanel } from '@/components/settings';

interface SettingsViewProps {
  tab?: 'model' | 'application';
}

export function SettingsView({ tab = 'model' }: SettingsViewProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-6">
        {tab === 'model' ? <ModelSettingsPanel /> : <SettingsPanel />}
      </div>
    </div>
  );
}

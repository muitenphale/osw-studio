'use client';

import { useState, useEffect } from 'react';
import { configManager } from '@/lib/config/storage';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTheme } from 'next-themes';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { setTelemetryOptIn } from '@/lib/telemetry';

export function AppearancePane() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [telemetryOptIn, setTelemetryOptInState] = useState(() =>
    configManager.getSettings().telemetryOptIn !== false
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="theme">Theme</Label>
        <ToggleGroup
          type="single"
          value={mounted ? (theme || 'dark') : 'dark'}
          onValueChange={(value: string) => {
            if (value) {
              setTheme(value);
              configManager.setSetting('theme', value as 'light' | 'dark' | 'system');
            }
          }}
          className="w-full mt-2"
        >
          <ToggleGroupItem value="dark" className="flex-1">Dark</ToggleGroupItem>
          <ToggleGroupItem value="light" className="flex-1">Light</ToggleGroupItem>
          <ToggleGroupItem value="system" className="flex-1">System</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="telemetry">Anonymous Usage Analytics</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Help improve OSW Studio by sharing anonymous usage data
          </p>
        </div>
        <Switch
          id="telemetry"
          checked={telemetryOptIn}
          onCheckedChange={(checked) => {
            setTelemetryOptInState(checked);
            setTelemetryOptIn(checked);
          }}
        />
      </div>
    </div>
  );
}

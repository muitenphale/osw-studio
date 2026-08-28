'use client';

import { useState, useEffect } from 'react';
import { configManager } from '@/lib/config/storage';
import { Switch } from '@/components/ui/switch';
import { useTheme } from 'next-themes';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { setTelemetryOptIn } from '@/lib/telemetry';
import { Palette } from 'lucide-react';
import { Section, SectionHeader, SectionBody } from '@/components/ui/section';
import { SettingRow } from '@/components/ui/setting-row';

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
    <Section>
      <SectionHeader icon={Palette} title="Appearance" />
      <SectionBody className="px-4 py-1">
        <SettingRow title="Theme" description="Interface color scheme">
          <ToggleGroup
            type="single"
            value={mounted ? (theme || 'dark') : 'dark'}
            onValueChange={(value: string) => {
              if (value) {
                setTheme(value);
                configManager.setSetting('theme', value as 'light' | 'dark' | 'system');
              }
            }}
          >
            <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            <ToggleGroupItem value="light">Light</ToggleGroupItem>
            <ToggleGroupItem value="system">System</ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>

        <SettingRow
          title="Anonymous usage analytics"
          description="Share anonymous usage data to help improve OSW Studio"
        >
          <Switch
            id="telemetry"
            checked={telemetryOptIn}
            onCheckedChange={(checked) => {
              setTelemetryOptInState(checked);
              setTelemetryOptIn(checked);
            }}
          />
        </SettingRow>
      </SectionBody>
    </Section>
  );
}

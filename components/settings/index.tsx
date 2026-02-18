'use client';

import React, { useState, useEffect } from 'react';
import { configManager, AppSettings, CostSettings } from '@/lib/config/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { DollarSign, AlertTriangle, Info, Download, Upload, Database, ChevronDown, Palette } from 'lucide-react';
import { CostCalculator } from '@/lib/llm/cost-calculator';
import { AboutModal } from '@/components/about-modal';
import { BackupService } from '@/lib/vfs/backup-service';
import { setTelemetryOptIn } from '@/lib/telemetry';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface SettingsPanelProps {
  onClose?: () => void;
}

export function SettingsPanel({ onClose: _onClose }: SettingsPanelProps) {
  const [_settings, setSettings] = useState<AppSettings>({});
  const [costSettings, setCostSettings] = useState<CostSettings>({});
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState('');
  const [telemetryOptIn, setTelemetryOptInState] = useState(() =>
    configManager.getSettings().telemetryOptIn !== false
  );
  const [openSections, setOpenSections] = useState({
    application: true,
    costTracking: true,
    dataManagement: true
  });

  useEffect(() => {
    // Load settings on mount
    setSettings(configManager.getSettings());
    setCostSettings(configManager.getCostSettings());
    setMounted(true);
  }, []);

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    configManager.setSetting(key, value);
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const clearSettings = () => {
    if (confirm('Are you sure you want to clear all settings?')) {
      configManager.clearSettings();
      setSettings({});
      toast.success('Settings cleared');
    }
  };

  const handleExportData = async () => {
    try {
      setIsExporting(true);
      await BackupService.exportAllData();
      toast.success('Data exported successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.osws';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        setIsImporting(true);
        setImportProgress(0);
        setImportMessage('Validating file...');

        const validation = await BackupService.validateBackupFile(file);
        if (!validation.valid) {
          toast.error(`Invalid backup file: ${validation.reason}`);
          return;
        }

        const shouldReplace = confirm(
          `Import ${validation.metadata?.projectCount || 0} projects?\n\n` +
          'Choose OK to REPLACE all current data, or Cancel to MERGE with existing data.'
        );

        await BackupService.importAllData(file, {
          mode: shouldReplace ? 'replace' : 'merge',
          onProgress: (progress, message) => {
            setImportProgress(progress);
            setImportMessage(message);
          }
        });

        toast.success('Data imported successfully!');
        setTimeout(() => window.location.reload(), 1000);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Import failed');
      } finally {
        setIsImporting(false);
        setImportProgress(0);
        setImportMessage('');
      }
    };
    input.click();
  };

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 pb-3 mb-1 border-b">
        <h3 className="font-semibold text-base tracking-tight">Settings</h3>
        <p className="text-muted-foreground text-xs mt-1">
          Application preferences and data management
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="space-y-3 pb-4">

        {/* Application Settings Section */}
        <Collapsible
          open={openSections.application}
          onOpenChange={() => toggleSection('application')}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <h4 className="font-medium text-sm">Application Settings</h4>
            </div>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                openSections.application ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pt-2 pb-3">
            <p className="text-muted-foreground text-xs mb-4">
              Configure your preferences and display options
            </p>
            <div className="space-y-4">
              {/* Theme */}
              <div>
                <Label htmlFor="theme">Theme</Label>
                <ToggleGroup
                  type="single"
                  value={mounted ? (theme || 'dark') : 'dark'}
                  onValueChange={(value: string) => {
                    if (value) {
                      setTheme(value);
                      updateSetting('theme', value as 'light' | 'dark' | 'system');
                    }
                  }}
                  className="w-full mt-2"
                >
                  <ToggleGroupItem value="dark" className="flex-1">Dark</ToggleGroupItem>
                  <ToggleGroupItem value="light" className="flex-1">Light</ToggleGroupItem>
                  <ToggleGroupItem value="system" className="flex-1">System</ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Telemetry */}
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
          </CollapsibleContent>
        </Collapsible>

        {/* Cost Tracking Section */}
        <Collapsible
          open={openSections.costTracking}
          onOpenChange={() => toggleSection('costTracking')}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <h4 className="font-medium text-sm">Cost Tracking</h4>
            </div>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                openSections.costTracking ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pt-2 pb-3">
            <div className="space-y-4">
              {/* Show Costs */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="show-costs">Display Costs</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Show cost information in messages
                  </p>
                </div>
                <Switch
                  id="show-costs"
                  checked={costSettings.showCosts !== false}
                  onCheckedChange={(checked) => {
                    const newCostSettings = { ...costSettings, showCosts: checked };
                    configManager.setCostSettings(newCostSettings);
                    setCostSettings(newCostSettings);
                  }}
                />
              </div>

              {/* Daily + Project Limits — 2 column grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="daily-limit" className="text-xs">Daily Limit (USD)</Label>
                  <Input
                    id="daily-limit"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="No limit"
                    className="mt-1.5"
                    value={costSettings.dailyLimit || ''}
                    onChange={(e) => {
                      const value = e.target.value ? parseFloat(e.target.value) : undefined;
                      const newCostSettings = { ...costSettings, dailyLimit: value };
                      configManager.setCostSettings(newCostSettings);
                      setCostSettings(newCostSettings);
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="project-limit" className="text-xs">Project Limit (USD)</Label>
                  <Input
                    id="project-limit"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="No limit"
                    className="mt-1.5"
                    value={costSettings.projectLimit || ''}
                    onChange={(e) => {
                      const value = e.target.value ? parseFloat(e.target.value) : undefined;
                      const newCostSettings = { ...costSettings, projectLimit: value };
                      configManager.setCostSettings(newCostSettings);
                      setCostSettings(newCostSettings);
                    }}
                  />
                </div>
              </div>

              {/* Warning Threshold */}
              <div>
                <Label htmlFor="warning-threshold" className="text-xs">Warning Threshold</Label>
                <div className="flex items-center gap-3 mt-1.5">
                  <Input
                    id="warning-threshold"
                    type="number"
                    min="50"
                    max="100"
                    step="5"
                    className="flex-1"
                    value={costSettings.warningThreshold || 80}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      const newCostSettings = { ...costSettings, warningThreshold: value };
                      configManager.setCostSettings(newCostSettings);
                      setCostSettings(newCostSettings);
                    }}
                  />
                  <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap font-mono">
                    <AlertTriangle className="h-3 w-3" />
                    Warn at {costSettings.warningThreshold || 80}%
                  </span>
                </div>
              </div>

              {/* Lifetime Costs */}
              <div className="flex items-center justify-between bg-muted/30 border rounded-lg p-3">
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Lifetime Total</div>
                  <div className="text-lg font-bold font-mono tracking-tight mt-0.5">
                    {CostCalculator.formatCost(configManager.getLifetimeCosts().total)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm('Reset lifetime cost tracking? This cannot be undone.')) {
                      configManager.resetLifetimeCosts();
                      toast.success('Lifetime costs reset');
                    }
                  }}
                >
                  Reset Stats
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Data Management Section */}
        <Collapsible
          open={openSections.dataManagement}
          onOpenChange={() => toggleSection('dataManagement')}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <h4 className="font-medium text-sm">Data Management</h4>
            </div>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                openSections.dataManagement ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pt-2 pb-3">
            <p className="text-xs text-muted-foreground mb-4">
              Backup and restore your projects, conversations, and settings.
            </p>

            <div className="space-y-2.5">
              {/* Export Data */}
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Export All Data</div>
                  <div className="text-xs text-muted-foreground">
                    Download a backup of all projects and data
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportData}
                  disabled={isExporting}
                >
                  {isExporting ? 'Exporting...' : 'Export'}
                </Button>
              </div>

              {/* Import Data */}
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Import Data</div>
                  <div className="text-xs text-muted-foreground">
                    Restore from a .osws backup file
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleImportData}
                  disabled={isImporting}
                >
                  {isImporting ? 'Importing...' : 'Import'}
                </Button>
              </div>

              {/* Import Progress */}
              {isImporting && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>{importMessage}</span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
      </div>{/* end scrollable content */}

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-between pt-4 px-3 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={clearSettings}
        >
          Clear All Settings
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAboutModalOpen(true)}
        >
          <Info className="mr-1.5 h-3.5 w-3.5" />
          About OSW Studio
        </Button>
      </div>

      <AboutModal
        open={aboutModalOpen}
        onOpenChange={setAboutModalOpen}
      />
    </div>
  );
}

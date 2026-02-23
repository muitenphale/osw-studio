'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Project, PublishSettings } from '@/lib/vfs/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GeneralTab } from './general-tab';
import { ScriptsTab } from './scripts-tab';
import { CdnTab } from './cdn-tab';
import { AnalyticsTab } from './analytics-tab';
import { SeoTab } from './seo-tab';
import { ComplianceTab } from './compliance-tab';
import {
  Dialog as AlertDialog,
  DialogContent as AlertDialogContent,
  DialogDescription as AlertDialogDescription,
  DialogFooter as AlertDialogFooter,
  DialogHeader as AlertDialogHeader,
  DialogTitle as AlertDialogTitle,
} from '@/components/ui/dialog';
import { Button as AlertDialogAction } from '@/components/ui/button';
import { Button as AlertDialogCancel } from '@/components/ui/button';

interface PublishSettingsModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: PublishSettings) => Promise<void>;
}

const DEFAULT_SETTINGS: PublishSettings = {
  enabled: false,
  underConstruction: false,
  headScripts: [],
  bodyScripts: [],
  cdnLinks: [],
  analytics: {
    enabled: false,
    provider: 'builtin',
    privacyMode: true,
  },
  seo: {},
  compliance: {
    enabled: false,
    bannerPosition: 'bottom',
    bannerStyle: 'bar',
    message: 'We use cookies to improve your experience. By using this site, you accept our use of cookies.',
    acceptButtonText: 'Accept',
    declineButtonText: 'Decline',
    mode: 'opt-in',
    blockAnalytics: true,
  },
  settingsVersion: 1,
};

export function PublishSettingsModal({
  project,
  isOpen,
  onClose,
  onSave,
}: PublishSettingsModalProps) {
  // Legacy code - publishSettings removed from Project type
  const [settings, setSettings] = useState<PublishSettings>(
    DEFAULT_SETTINGS
  );
  const [initialSettings, setInitialSettings] = useState<PublishSettings>(
    DEFAULT_SETTINGS
  );
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Reset state when project or isOpen changes
  useEffect(() => {
    if (isOpen) {
      // Legacy: publishSettings removed from Project type
      const currentSettings = DEFAULT_SETTINGS;
      setSettings(currentSettings);
      setInitialSettings(currentSettings);
      setIsDirty(false);
      setActiveTab('general');
    }
  }, [project, isOpen]);

  // Track dirty state
  useEffect(() => {
    const hasChanges = JSON.stringify(settings) !== JSON.stringify(initialSettings);
    setIsDirty(hasChanges);
  }, [settings, initialSettings]);

  // Stable callback for settings changes
  const handleSettingsChange = useCallback((newSettings: PublishSettings) => {
    setSettings(newSettings);
  }, []);

  const handleClose = () => {
    if (isDirty) {
      // Show confirmation if there are unsaved changes
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Increment settings version
      const updatedSettings: PublishSettings = {
        ...settings,
        settingsVersion: settings.settingsVersion + 1,
      };

      // Save settings
      await onSave(updatedSettings);

      // Update local state
      setInitialSettings(updatedSettings);
      setSettings(updatedSettings);
      setIsDirty(false);

      // Close modal - settings are saved
      onClose();
    } catch (error) {
      console.error('[PublishSettingsModal] Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Publish Settings - {project.name}</DialogTitle>
            <DialogDescription>
              Configure scripts, CDN resources, analytics, and SEO settings for your published deployment.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="scripts">Scripts</TabsTrigger>
              <TabsTrigger value="cdn">CDN</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-4">
              <TabsContent value="general" className="mt-0">
                <GeneralTab settings={settings} onChange={handleSettingsChange} projectId={project.id} deploymentId={project.id} />
              </TabsContent>

              <TabsContent value="scripts" className="mt-0">
                <ScriptsTab settings={settings} onChange={handleSettingsChange} />
              </TabsContent>

              <TabsContent value="cdn" className="mt-0">
                <CdnTab settings={settings} onChange={handleSettingsChange} />
              </TabsContent>

              <TabsContent value="analytics" className="mt-0">
                <AnalyticsTab settings={settings} onChange={handleSettingsChange} />
              </TabsContent>

              <TabsContent value="seo" className="mt-0">
                <SeoTab settings={settings} onChange={handleSettingsChange} />
              </TabsContent>

              <TabsContent value="compliance" className="mt-0">
                <ComplianceTab settings={settings} onChange={handleSettingsChange} />
              </TabsContent>
            </div>
          </Tabs>

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {isDirty && '• Unsaved changes'}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!isDirty || isSaving}>
                {isSaving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}

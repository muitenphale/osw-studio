'use client';

import React, { useState, useEffect } from 'react';
import { Deployment, Project } from '@/lib/vfs/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GeneralTab } from '../publish-settings/general-tab';
import { ScriptsTab } from '../publish-settings/scripts-tab';
import { CdnTab } from '../publish-settings/cdn-tab';
import { AnalyticsTab } from '../publish-settings/analytics-tab';
import { SeoTab } from '../publish-settings/seo-tab';
import { ComplianceTab } from '../publish-settings/compliance-tab';

interface DeploymentSettingsModalProps {
  deployment: Deployment;
  projects?: Project[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: Partial<Deployment>) => Promise<void>;
}

export function DeploymentSettingsModal({
  deployment,
  projects,
  isOpen,
  onClose,
  onSave,
}: DeploymentSettingsModalProps) {
  const [projectId, setProjectId] = useState(deployment.projectId);
  const [enabled, setEnabled] = useState(deployment.enabled);
  const [underConstruction, setUnderConstruction] = useState(deployment.underConstruction);
  const [customDomain, setCustomDomain] = useState(deployment.customDomain);
  const [headScripts, setHeadScripts] = useState(deployment.headScripts);
  const [bodyScripts, setBodyScripts] = useState(deployment.bodyScripts);
  const [cdnLinks, setCdnLinks] = useState(deployment.cdnLinks);
  const [analytics, setAnalytics] = useState(deployment.analytics);
  const [seo, setSeo] = useState(deployment.seo);
  const [compliance, setCompliance] = useState(deployment.compliance);

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Reset state when deployment or isOpen changes
  useEffect(() => {
    if (isOpen) {
      setProjectId(deployment.projectId);
      setEnabled(deployment.enabled);
      setUnderConstruction(deployment.underConstruction);
      setCustomDomain(deployment.customDomain);
      setHeadScripts(deployment.headScripts);
      setBodyScripts(deployment.bodyScripts);
      setCdnLinks(deployment.cdnLinks);
      setAnalytics(deployment.analytics);
      setSeo(deployment.seo);
      setCompliance(deployment.compliance);
      setIsDirty(false);
      setActiveTab('general');
    }
  }, [deployment, isOpen]);

  // Track dirty state
  useEffect(() => {
    const hasChanges =
      projectId !== deployment.projectId ||
      enabled !== deployment.enabled ||
      underConstruction !== deployment.underConstruction ||
      customDomain !== deployment.customDomain ||
      JSON.stringify(headScripts) !== JSON.stringify(deployment.headScripts) ||
      JSON.stringify(bodyScripts) !== JSON.stringify(deployment.bodyScripts) ||
      JSON.stringify(cdnLinks) !== JSON.stringify(deployment.cdnLinks) ||
      JSON.stringify(analytics) !== JSON.stringify(deployment.analytics) ||
      JSON.stringify(seo) !== JSON.stringify(deployment.seo) ||
      JSON.stringify(compliance) !== JSON.stringify(deployment.compliance);
    setIsDirty(hasChanges);
  }, [projectId, enabled, underConstruction, customDomain, headScripts, bodyScripts, cdnLinks, analytics, seo, compliance, deployment]);

  const handleClose = () => {
    if (isDirty) {
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
      await onSave({
        projectId,
        enabled,
        underConstruction,
        customDomain,
        headScripts,
        bodyScripts,
        cdnLinks,
        analytics,
        seo,
        compliance,
      });

      setIsDirty(false);
      onClose();
    } catch (error) {
      console.error('[DeploymentSettingsModal] Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Create a settings object compatible with existing tab components
  const settings = {
    enabled,
    underConstruction,
    customDomain,
    headScripts,
    bodyScripts,
    cdnLinks,
    analytics,
    seo,
    compliance,
    settingsVersion: deployment.settingsVersion,
    lastPublishedVersion: deployment.lastPublishedVersion,
  };

  const updateSettings = (updates: Partial<typeof settings>) => {
    if ('enabled' in updates && updates.enabled !== undefined) setEnabled(updates.enabled);
    if ('underConstruction' in updates && updates.underConstruction !== undefined) setUnderConstruction(updates.underConstruction);
    if ('customDomain' in updates) setCustomDomain(updates.customDomain);
    if ('headScripts' in updates && updates.headScripts !== undefined) setHeadScripts(updates.headScripts);
    if ('bodyScripts' in updates && updates.bodyScripts !== undefined) setBodyScripts(updates.bodyScripts);
    if ('cdnLinks' in updates && updates.cdnLinks !== undefined) setCdnLinks(updates.cdnLinks);
    if ('analytics' in updates && updates.analytics !== undefined) setAnalytics(updates.analytics);
    if ('seo' in updates && updates.seo !== undefined) setSeo(updates.seo);
    if ('compliance' in updates && updates.compliance !== undefined) setCompliance(updates.compliance);
  };

  // Wrapper for GeneralTab which expects onChange with full settings object
  const handleGeneralChange = (newSettings: any) => {
    setEnabled(newSettings.enabled);
    setUnderConstruction(newSettings.underConstruction);
    setCustomDomain(newSettings.customDomain);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Deployment Settings - {deployment.name}</DialogTitle>
          <DialogDescription>
            Configure scripts, CDN resources, analytics, and SEO settings for your published deployment.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-6 mb-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="scripts">Scripts</TabsTrigger>
            <TabsTrigger value="cdn">CDN</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            <TabsContent value="general" className="mt-0 h-full">
              <GeneralTab
                settings={settings}
                onChange={handleGeneralChange}
                projectId={projectId}
                deploymentId={deployment.id}
                projects={projects}
                onProjectChange={setProjectId}
              />
            </TabsContent>

            <TabsContent value="scripts" className="mt-0 h-full">
              <ScriptsTab settings={settings} onChange={updateSettings} />
            </TabsContent>

            <TabsContent value="cdn" className="mt-0 h-full">
              <CdnTab settings={settings} onChange={updateSettings} />
            </TabsContent>

            <TabsContent value="analytics" className="mt-0 h-full">
              <AnalyticsTab settings={settings} onChange={updateSettings} />
            </TabsContent>

            <TabsContent value="seo" className="mt-0 h-full">
              <SeoTab settings={settings} onChange={updateSettings} />
            </TabsContent>

            <TabsContent value="compliance" className="mt-0 h-full">
              <ComplianceTab settings={settings} onChange={updateSettings} />
            </TabsContent>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {isDirty && <span>You have unsaved changes</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!isDirty || isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

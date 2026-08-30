'use client';

import React, { useState, useEffect } from 'react';
import { Deployment, Project } from '@/lib/vfs/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GeneralTab } from '../publish-settings/general-tab';
import { ScriptsTab } from '../publish-settings/scripts-tab';
import { CdnTab } from '../publish-settings/cdn-tab';
import { AnalyticsTab } from '../publish-settings/analytics-tab';
import { SeoTab } from '../publish-settings/seo-tab';
import { ComplianceTab } from '../publish-settings/compliance-tab';
import { ReviewTab, type ReviewDraft } from '../publish-settings/review-tab';
import type { PublicReviewConfig } from '@/lib/api/deployment-public';
import {
  SchemaViewer,
  SqlEditor,
  FunctionsManager,
  ServerFunctionsManager,
  SecretsManager,
  ScheduledFunctionsManager,
  LogsViewer,
} from '../database-manager';
import {
  ChevronLeft,
  Settings,
  FileCode,
  Link2,
  BarChart3,
  Search as SearchIcon,
  Shield,
  Code2,
  Wrench,
  Key,
  Clock,
  Database,
  Terminal,
  ScrollText,
  ExternalLink,
  MessagesSquare,
} from 'lucide-react';

type NavSection = 'deployment' | 'backend';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  section: NavSection;
}

const DEPLOYMENT_NAV: NavItem[] = [
  { id: 'general', label: 'General', icon: Settings, section: 'deployment' },
  { id: 'scripts', label: 'Scripts', icon: FileCode, section: 'deployment' },
  { id: 'cdn', label: 'CDN', icon: Link2, section: 'deployment' },
  { id: 'seo', label: 'SEO', icon: SearchIcon, section: 'deployment' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, section: 'deployment' },
  { id: 'compliance', label: 'Compliance', icon: Shield, section: 'deployment' },
  { id: 'review', label: 'Review', icon: MessagesSquare, section: 'deployment' },
];

const BACKEND_NAV: NavItem[] = [
  { id: 'functions', label: 'Functions', icon: Code2, section: 'backend' },
  { id: 'helpers', label: 'Helpers', icon: Wrench, section: 'backend' },
  { id: 'secrets', label: 'Secrets', icon: Key, section: 'backend' },
  { id: 'schedules', label: 'Schedules', icon: Clock, section: 'backend' },
  { id: 'schema', label: 'Schema', icon: Database, section: 'backend' },
  { id: 'sql', label: 'SQL', icon: Terminal, section: 'backend' },
  { id: 'logs', label: 'Logs', icon: ScrollText, section: 'backend' },
];

/**
 * The record this component receives has been through `toPublicDeployment`, which drops
 * `review.passwordHash` and puts `reviewPasswordSet` in its place. `Deployment` names neither, so
 * the review block is read through the public projection's type rather than the stored one's.
 */
function toReviewDraft(review: Deployment['review']): ReviewDraft {
  const published = review as PublicReviewConfig | undefined;
  return {
    enabled: published?.enabled ?? false,
    expiresAt: published?.expiresAt,
    notifyByEmail: published?.notifyByEmail,
    reviewPasswordSet: published?.reviewPasswordSet ?? false,
    // No `password`: an absent field is the wire's way of saying "leave the stored hash alone".
  };
}

/** The settings payload, plus the review block, whose password field the `Deployment` type omits. */
export type DeploymentSettingsUpdate = Partial<Deployment> & { review?: ReviewDraft };

interface DeploymentDetailProps {
  deployment: Deployment;
  projects: Project[];
  isPublishing: boolean;
  onBack: () => void;
  onSave: (settings: DeploymentSettingsUpdate) => Promise<void>;
  onPublish: (deploymentId: string) => void;
  workspaceId?: string;
}

export function DeploymentDetail({
  deployment,
  projects,
  isPublishing,
  onBack,
  onSave,
  onPublish,
  workspaceId,
}: DeploymentDetailProps) {
  const [activeNav, setActiveNav] = useState('general');

  // ── Settings state (mirrored from deployment for dirty tracking) ──
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
  const [review, setReview] = useState<ReviewDraft>(() => toReviewDraft(deployment.review));

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset local state when the deployment prop changes (e.g. after save)
  useEffect(() => {
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
    setReview(toReviewDraft(deployment.review));
    setIsDirty(false);
  }, [deployment]);

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
      JSON.stringify(compliance) !== JSON.stringify(deployment.compliance) ||
      JSON.stringify(review) !== JSON.stringify(toReviewDraft(deployment.review));
    setIsDirty(hasChanges);
  }, [projectId, enabled, underConstruction, customDomain, headScripts, bodyScripts, cdnLinks, analytics, seo, compliance, review, deployment]);

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
        review,
      });
      setIsDirty(false);
    } catch (error) {
      console.error('[DeploymentDetail] Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (isDirty) {
      if (confirm('You have unsaved changes. Are you sure you want to go back?')) {
        onBack();
      }
    } else {
      onBack();
    }
  };

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

  const handleGeneralChange = (newSettings: any) => {
    setEnabled(newSettings.enabled);
    setUnderConstruction(newSettings.underConstruction);
    setCustomDomain(newSettings.customDomain);
  };

  // ── Status helpers ──
  const hasBeenPublished = !!deployment.publishedAt;
  const hasPendingChanges = deployment.settingsVersion !== deployment.lastPublishedVersion;
  const publicUrl = deployment.publicUrl || (typeof window !== 'undefined' ? `${window.location.origin}/deployments/${deployment.id}` : '');

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Deployments
          </Button>

          <div className="h-4 w-px bg-border" />

          <h1 className="text-base font-semibold truncate">{deployment.name}</h1>

          {!deployment.enabled ? (
            <Badge variant="secondary">Disabled</Badge>
          ) : deployment.underConstruction ? (
            <Badge variant="outline" className="border-yellow-600 text-yellow-600">Under Construction</Badge>
          ) : hasBeenPublished && hasPendingChanges ? (
            <Badge variant="outline" className="border-amber-500 text-amber-500">Pending Changes</Badge>
          ) : hasBeenPublished ? (
            <Badge variant="outline" className="border-green-500 text-green-500">Published</Badge>
          ) : (
            <Badge variant="secondary">Draft</Badge>
          )}

          <div className="ml-auto flex items-center gap-2">
            {isDirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            {isDirty && (
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            {hasBeenPublished && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(publicUrl, '_blank')}
                className="gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Live
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => onPublish(deployment.id)}
              disabled={isPublishing}
              variant={isDirty ? 'outline' : 'default'}
            >
              {isPublishing ? 'Publishing...' : hasPendingChanges ? 'Publish Changes' : hasBeenPublished ? 'Republish' : 'Publish'}
            </Button>
          </div>
        </div>
      </div>

      {/* Body: side nav + content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Side navigation */}
        <nav className="w-48 shrink-0 border-r bg-muted/30 overflow-y-auto py-2">
          <div className="px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Deployment
            </span>
          </div>
          {DEPLOYMENT_NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors',
                activeNav === item.id
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ))}

          {deployment.databaseEnabled && (
            <>
              <div className="px-3 py-1.5 mt-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Backend
                </span>
              </div>
              {BACKEND_NAV.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors',
                    activeNav === item.id
                      ? 'text-foreground bg-accent/50 border-r-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </button>
              ))}
            </>
          )}
        </nav>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-3xl">
            {/* Deployment settings sections */}
            {activeNav === 'general' && (
              <GeneralTab
                settings={settings}
                onChange={handleGeneralChange}
                projectId={projectId}
                deploymentId={deployment.id}
                publicUrl={deployment.publicUrl}
                projects={projects}
                onProjectChange={setProjectId}
              />
            )}
            {activeNav === 'scripts' && (
              <ScriptsTab settings={settings} onChange={updateSettings} />
            )}
            {activeNav === 'cdn' && (
              <CdnTab settings={settings} onChange={updateSettings} />
            )}
            {activeNav === 'analytics' && (
              <AnalyticsTab settings={settings} onChange={updateSettings} />
            )}
            {activeNav === 'seo' && (
              <SeoTab settings={settings} onChange={updateSettings} />
            )}
            {activeNav === 'compliance' && (
              <ComplianceTab settings={settings} onChange={updateSettings} />
            )}
            {activeNav === 'review' && (
              <ReviewTab
                deploymentId={deployment.id}
                workspaceId={workspaceId}
                review={review}
                onChange={setReview}
                storedEnabled={toReviewDraft(deployment.review).enabled}
                isDirty={isDirty}
                hasBeenPublished={hasBeenPublished}
                hasPendingChanges={hasPendingChanges}
                isPublishing={isPublishing}
                onPublish={() => onPublish(deployment.id)}
              />
            )}

            {/* Backend sections */}
            {activeNav === 'functions' && (
              <div className="h-[calc(100vh-10rem)]">
                <FunctionsManager deploymentId={deployment.id} workspaceId={workspaceId} />
              </div>
            )}
            {activeNav === 'helpers' && (
              <div className="h-[calc(100vh-10rem)]">
                <ServerFunctionsManager deploymentId={deployment.id} workspaceId={workspaceId} />
              </div>
            )}
            {activeNav === 'secrets' && (
              <div className="h-[calc(100vh-10rem)]">
                <SecretsManager deploymentId={deployment.id} workspaceId={workspaceId} />
              </div>
            )}
            {activeNav === 'schedules' && (
              <div className="h-[calc(100vh-10rem)]">
                <ScheduledFunctionsManager deploymentId={deployment.id} workspaceId={workspaceId} />
              </div>
            )}
            {activeNav === 'schema' && (
              <div className="h-[calc(100vh-10rem)]">
                <SchemaViewer deploymentId={deployment.id} workspaceId={workspaceId} />
              </div>
            )}
            {activeNav === 'sql' && (
              <div className="h-[calc(100vh-10rem)]">
                <SqlEditor deploymentId={deployment.id} workspaceId={workspaceId} />
              </div>
            )}
            {activeNav === 'logs' && (
              <div className="h-[calc(100vh-10rem)]">
                <LogsViewer deploymentId={deployment.id} workspaceId={workspaceId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

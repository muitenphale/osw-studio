'use client';

import React, { useState } from 'react';
import { PublishSettings, Project } from '@/lib/vfs/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Section, SectionHeader, SectionBody } from '@/components/ui/section';
import { SettingRow } from '@/components/ui/setting-row';
import { Globe, AlertTriangle, FolderOpen, Link2, History } from 'lucide-react';

interface GeneralTabProps {
  settings: PublishSettings;
  onChange: (settings: PublishSettings) => void;
  projectId: string;
  deploymentId: string;
  /** Resolved by the server; the client must not derive it from slug + hostname. */
  publicUrl?: string;
  projects?: Project[];
  onProjectChange?: (projectId: string) => void;
}

export function GeneralTab({ settings, onChange, projectId, deploymentId, publicUrl: resolvedUrl, projects, onProjectChange }: GeneralTabProps) {
  const [originalProjectId] = useState(projectId);
  const handleChange = (field: keyof PublishSettings, value: PublishSettings[keyof PublishSettings]) => {
    onChange({
      ...settings,
      [field]: value,
    });
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const directUrl = `${origin}/deployments/${deploymentId}`;
  // The custom domain is applied live so the field previews as it is typed; everything else comes
  // from the server, which is the only side that knows whether slug subdomains are routed.
  const publicUrl = settings.customDomain
    ? `https://${settings.customDomain}`
    : resolvedUrl || directUrl;
  const servedElsewhere = publicUrl !== directUrl;

  return (
    <div className="flex flex-col gap-4">
      <Section>
        <SectionHeader icon={Globe} title="Publishing status" />
        <SectionBody className="px-4 py-1">
          <SettingRow title="Published" description="Make this deployment publicly accessible">
            <Switch
              id="enabled"
              checked={settings.enabled}
              onCheckedChange={(checked) => handleChange('enabled', checked)}
            />
          </SettingRow>
          <SettingRow title="Under construction" description="Show maintenance overlay on live deployment">
            <Switch
              id="under-construction"
              checked={settings.underConstruction}
              onCheckedChange={(checked) => handleChange('underConstruction', checked)}
            />
          </SettingRow>
        </SectionBody>
      </Section>

      {projects && projects.length > 0 && onProjectChange && (
        <Section>
          <SectionHeader icon={FolderOpen} title="Source project" />
          <SectionBody className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="project-select">Project</Label>
              <Select value={projectId} onValueChange={onProjectChange}>
                <SelectTrigger id="project-select">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The project whose files are published to this deployment.
              </p>
            </div>

            {projectId !== originalProjectId && (
              <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  <p className="font-medium">Changing the source project may break the published deployment.</p>
                  <p className="mt-1 text-yellow-700 dark:text-yellow-300">
                    The new project may have different files and structure. You will need to republish after saving.
                  </p>
                </div>
              </div>
            )}
          </SectionBody>
        </Section>
      )}

      <Section>
        <SectionHeader icon={Link2} title="Public URL" />
        <SectionBody className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              <code className="text-sm flex-1 break-all">{publicUrl}</code>
              <Badge variant={settings.enabled ? 'default' : 'secondary'} className="ml-2 shrink-0">
                {settings.enabled ? 'Live' : 'Not Published'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              This is the public URL where your deployment will be accessible
            </p>
          </div>

          {/* Show direct path when subdomain or custom domain is set */}
          {servedElsewhere && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Direct path</Label>
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-dashed">
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                <code className="text-xs flex-1 text-muted-foreground break-all">{directUrl}</code>
              </div>
            </div>
          )}
        </SectionBody>
      </Section>

      <Section>
        <SectionHeader icon={Globe} title="Custom domain" />
        <SectionBody className="space-y-2">
          <Label htmlFor="custom-domain">Domain name (optional)</Label>
          <Input
            id="custom-domain"
            type="text"
            placeholder="example.com"
            value={settings.customDomain || ''}
            onChange={(e) => handleChange('customDomain', e.target.value || undefined)}
          />
          <p className="text-xs text-muted-foreground">
            Enter your custom domain and add a DNS A record pointing to this server. Used for SEO meta tags, sitemaps, and asset paths. Republish after setting.
          </p>
        </SectionBody>
      </Section>

      <Section>
        <SectionHeader icon={History} title="Version" />
        <SectionBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 border rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Current version</div>
              <div className="text-2xl font-semibold tabular-nums">{settings.settingsVersion}</div>
            </div>
            <div className="p-3 border rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Published version</div>
              <div className="text-2xl font-semibold tabular-nums">
                {settings.lastPublishedVersion !== null && settings.lastPublishedVersion !== undefined
                  ? settings.lastPublishedVersion
                  : '-'}
              </div>
            </div>
          </div>

          {settings.lastPublishedVersion !== undefined &&
            settings.settingsVersion > settings.lastPublishedVersion && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900">
                    Pending Changes
                  </Badge>
                  <span className="text-sm">
                    You have unpublished changes. Republish to apply them.
                  </span>
                </div>
              </div>
            )}
        </SectionBody>
      </Section>
    </div>
  );
}

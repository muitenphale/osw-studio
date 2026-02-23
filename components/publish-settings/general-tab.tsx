'use client';

import React, { useState } from 'react';
import { PublishSettings, Project } from '@/lib/vfs/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, AlertTriangle } from 'lucide-react';

interface GeneralTabProps {
  settings: PublishSettings;
  onChange: (settings: PublishSettings) => void;
  projectId: string;
  deploymentId: string;
  projects?: Project[];
  onProjectChange?: (projectId: string) => void;
}

export function GeneralTab({ settings, onChange, projectId, deploymentId, projects, onProjectChange }: GeneralTabProps) {
  const [originalProjectId] = useState(projectId);
  const handleChange = (field: keyof PublishSettings, value: any) => {
    onChange({
      ...settings,
      [field]: value,
    });
  };

  // Generate public URL (uses deploymentId, not projectId!)
  const publicUrl = settings.customDomain
    ? `https://${settings.customDomain}`
    : `${typeof window !== 'undefined' ? window.location.origin : ''}/deployments/${deploymentId}`;

  // Generate OSW Studio path URL (always show for debugging - uses deploymentId, not projectId!)
  const oswStudioUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/deployments/${deploymentId}`;

  return (
    <div className="space-y-6">
      {/* Publishing Status */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-4">Publishing Status</h3>
        </div>

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-1">
            <Label htmlFor="enabled" className="text-base">
              Published
            </Label>
            <p className="text-sm text-muted-foreground">
              Make this deployment publicly accessible
            </p>
          </div>
          <Switch
            id="enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => handleChange('enabled', checked)}
          />
        </div>

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-1">
            <Label htmlFor="under-construction" className="text-base">
              Under Construction
            </Label>
            <p className="text-sm text-muted-foreground">
              Show maintenance overlay on live deployment
            </p>
          </div>
          <Switch
            id="under-construction"
            checked={settings.underConstruction}
            onCheckedChange={(checked) => handleChange('underConstruction', checked)}
          />
        </div>
      </div>

      {/* Source Project */}
      {projects && projects.length > 0 && onProjectChange && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-4">Source Project</h3>
          </div>

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
        </div>
      )}

      {/* Public URL */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-4">Public URL</h3>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Public URL</Label>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <code className="text-sm flex-1">{publicUrl}</code>
              {settings.enabled && (
                <Badge variant="default" className="ml-2">
                  Live
                </Badge>
              )}
              {!settings.enabled && (
                <Badge variant="secondary" className="ml-2">
                  Not Published
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              This is the public URL where your deployment will be accessible
            </p>
          </div>

          {/* Show OSW Studio path if custom domain is set */}
          {settings.customDomain && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">OSW Studio Path (Debug)</Label>
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-dashed">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <code className="text-xs flex-1 text-muted-foreground">{oswStudioUrl}</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Internal path used by reverse proxy. Map your custom domain to this URL.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Custom Domain */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-4">Custom Domain (Advanced)</h3>
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom-domain">Domain Name (Optional)</Label>
          <Input
            id="custom-domain"
            type="text"
            placeholder="example.com"
            value={settings.customDomain || ''}
            onChange={(e) => handleChange('customDomain', e.target.value || undefined)}
          />
          <p className="text-xs text-muted-foreground">
            Enter your custom domain if you've configured a reverse proxy to point it to this deployment. This is used for SEO meta tags and sitemaps. See documentation for setup instructions.
          </p>
        </div>
      </div>

      {/* Version Info */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-4">Version Information</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 border rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Current Version</div>
            <div className="text-2xl font-semibold">{settings.settingsVersion}</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Published Version</div>
            <div className="text-2xl font-semibold">
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
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { Site, Project } from '@/lib/vfs/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Globe,
  Settings,
  Server,
  ExternalLink,
  Copy,
  RefreshCw,
  EyeOff,
  Eye,
  Trash2,
  MoreVertical,
  AlertCircle,
  Construction,
  Folder,
  BarChart3,
  Pencil,
  Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SiteCardProps {
  site: Site;
  project?: Project;
  isPublishing?: boolean;
  onOpenSettings: (site: Site) => void;
  onOpenServerSettings?: (site: Site) => void;
  onViewAnalytics: (site: Site) => void;
  onEditProject: (site: Site) => void;
  onPublish: (siteId: string) => void;
  onDisable: (siteId: string) => void;
  onEnable: (siteId: string) => void;
  onDelete: (siteId: string) => void;
}

export function SiteCard({
  site,
  project,
  isPublishing = false,
  onOpenSettings,
  onOpenServerSettings,
  onViewAnalytics,
  onEditProject,
  onPublish,
  onDisable,
  onEnable,
  onDelete,
}: SiteCardProps) {
  // Determine status
  const isPublished = site.lastPublishedVersion !== null && site.lastPublishedVersion !== undefined;
  const hasPendingChanges = isPublished && Number(site.settingsVersion) > Number(site.lastPublishedVersion);

  const publicUrl = site.customDomain
    ? `https://${site.customDomain}`
    : `${window.location.origin}/sites/${site.id}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    // Could add a toast notification here
  };

  const handleViewLive = () => {
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow bg-card">
      {/* Preview Image */}
      <div className="aspect-video bg-muted relative">
        {site.previewImage || project?.previewImage ? (
          <img
            key={site.previewUpdatedAt ? new Date(site.previewUpdatedAt).getTime() : 'static'}
            src={site.previewImage || project?.previewImage}
            alt={site.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Globe className="h-12 w-12 text-muted-foreground" />
          </div>
        )}

        {/* Publishing spinner overlay */}
        {isPublishing && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Status Badge Overlay */}
        <div className="absolute top-2 right-2 flex gap-2">
          {!site.enabled && (
            <Badge variant="outline" className="bg-gray-100 dark:bg-gray-950 border-gray-300 dark:border-gray-800">
              <EyeOff className="h-3 w-3 mr-1" />
              Disabled
            </Badge>
          )}
          {site.underConstruction && site.enabled && (
            <Badge variant="outline" className="bg-orange-100 dark:bg-orange-950 border-orange-300 dark:border-orange-800">
              <Construction className="h-3 w-3 mr-1" />
              Under Construction
            </Badge>
          )}
          {hasPendingChanges && site.enabled && (
            <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-800">
              <AlertCircle className="h-3 w-3 mr-1" />
              Pending Changes
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title and Description */}
        <div className="mb-3">
          <h3 className="font-semibold text-lg truncate mb-1">{site.name}</h3>
          {project && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Folder className="h-3 w-3" />
              <span className="truncate">{project.name}</span>
            </div>
          )}
          {site.slug && (
            <p className="text-xs text-muted-foreground mt-1">
              Slug: {site.slug}
            </p>
          )}
        </div>

        {/* URL */}
        {site.enabled && (
          <div className="flex items-center gap-2 mb-3 p-2 bg-muted rounded text-xs">
            <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 truncate">{publicUrl}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleCopyUrl}
              title="Copy URL"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
          <div>
            Version: {site.settingsVersion}
            {site.lastPublishedVersion && (
              <> / {site.lastPublishedVersion}</>
            )}
          </div>
          {site.publishedAt && (
            <div>
              Published {formatDistanceToNow(new Date(site.publishedAt), { addSuffix: true })}
            </div>
          )}
        </div>

        {/* Stats Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {site.headScripts.filter(s => s.enabled).length +
            site.bodyScripts.filter(s => s.enabled).length >
            0 && (
            <Badge variant="secondary" className="text-xs">
              {site.headScripts.filter(s => s.enabled).length +
                site.bodyScripts.filter(s => s.enabled).length}{' '}
              Script
              {site.headScripts.filter(s => s.enabled).length +
                site.bodyScripts.filter(s => s.enabled).length !==
                1 && 's'}
            </Badge>
          )}
          {site.cdnLinks.filter(c => c.enabled).length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {site.cdnLinks.filter(c => c.enabled).length} CDN Resource
              {site.cdnLinks.filter(c => c.enabled).length !== 1 && 's'}
            </Badge>
          )}
          {site.analytics.enabled && (
            <Badge variant="secondary" className="text-xs">
              Analytics
            </Badge>
          )}
          {(site.seo.title || site.seo.description) && (
            <Badge variant="secondary" className="text-xs">
              SEO Configured
            </Badge>
          )}
          {site.compliance.enabled && (
            <Badge variant="secondary" className="text-xs">
              Compliance
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {site.enabled ? (
            <>
              <Button
                variant={hasPendingChanges ? undefined : 'outline'}
                size="sm"
                className={
                  hasPendingChanges
                    ? 'flex-1 !bg-orange-500 hover:!bg-orange-600 !text-white'
                    : 'flex-1'
                }
                onClick={() => onPublish(site.id)}
                disabled={isPublishing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isPublishing ? 'animate-spin' : ''}`} />
                {isPublishing
                  ? 'Publishing...'
                  : hasPendingChanges
                    ? 'Publish Changes'
                    : isPublished
                      ? 'Republish'
                      : 'Publish Site'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewLive}
                title="View Live"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onEnable(site.id)}
            >
              <Eye className="h-4 w-4 mr-2" />
              Enable
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditProject(site)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Project
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onOpenSettings(site)}>
                <Settings className="h-4 w-4 mr-2" />
                Site Settings
              </DropdownMenuItem>
              {site.databaseEnabled && (
                <DropdownMenuItem onClick={() => onOpenServerSettings?.(site)}>
                  <Server className="h-4 w-4 mr-2" />
                  Server Settings
                </DropdownMenuItem>
              )}
              {site.analytics.enabled && site.analytics.provider === 'builtin' && (
                <DropdownMenuItem onClick={() => onViewAnalytics(site)}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Analytics
                </DropdownMenuItem>
              )}
              {site.enabled && (
                <DropdownMenuItem onClick={handleCopyUrl}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy URL
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {site.enabled ? (
                <DropdownMenuItem onClick={() => onDisable(site.id)}>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Disable Site
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onEnable(site.id)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Enable Site
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onDelete(site.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Site
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

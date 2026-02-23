'use client';

import React from 'react';
import { Deployment, Project } from '@/lib/vfs/types';
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
  FileBox,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ThumbnailArea } from '@/components/ui/thumbnail-area';
import { captureDeploymentScreenshot } from '@/lib/utils/deployment-thumbnail';

interface DeploymentCardProps {
  deployment: Deployment;
  project?: Project;
  isPublishing?: boolean;
  onOpenSettings: (deployment: Deployment) => void;
  onOpenServerSettings?: (deployment: Deployment) => void;
  onViewAnalytics: (deployment: Deployment) => void;
  onEditProject: (deployment: Deployment) => void;
  onPublish: (deploymentId: string) => void;
  onDisable: (deploymentId: string) => void;
  onEnable: (deploymentId: string) => void;
  onDelete: (deploymentId: string) => void;
  onExportAsTemplate?: (deployment: Deployment) => void;
  onThumbnailChange?: (deploymentId: string, image: string | undefined) => void;
}

export function DeploymentCard({
  deployment,
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
  onExportAsTemplate,
  onThumbnailChange,
}: DeploymentCardProps) {
  // Determine status
  const isPublished = deployment.lastPublishedVersion !== null && deployment.lastPublishedVersion !== undefined;
  const hasPendingChanges = isPublished && Number(deployment.settingsVersion) > Number(deployment.lastPublishedVersion);

  const publicUrl = deployment.customDomain
    ? `https://${deployment.customDomain}`
    : `${window.location.origin}/deployments/${deployment.id}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(publicUrl);
  };

  const handleViewLive = () => {
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow bg-card">
      {/* Preview Image */}
      <div className="aspect-video bg-muted relative">
        <ThumbnailArea
          image={deployment.previewImage || project?.previewImage}
          onCapture={isPublished ? async () => {
            const deploymentUrl = deployment.customDomain
              ? `https://${deployment.customDomain}`
              : `${window.location.origin}/deployments/${deployment.id}`;
            return captureDeploymentScreenshot(deploymentUrl);
          } : undefined}
          onImageChange={(img) => onThumbnailChange?.(deployment.id, img)}
          size="md"
        />

        {/* Publishing spinner overlay */}
        {isPublishing && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Status Badge Overlay */}
        <div className="absolute top-2 right-2 flex gap-2">
          {!deployment.enabled && (
            <Badge variant="outline" className="bg-gray-100 dark:bg-gray-950 border-gray-300 dark:border-gray-800">
              <EyeOff className="h-3 w-3 mr-1" />
              Disabled
            </Badge>
          )}
          {deployment.underConstruction && deployment.enabled && (
            <Badge variant="outline" className="bg-orange-100 dark:bg-orange-950 border-orange-300 dark:border-orange-800">
              <Construction className="h-3 w-3 mr-1" />
              Under Construction
            </Badge>
          )}
          {hasPendingChanges && deployment.enabled && (
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
          <h3 className="font-semibold text-lg truncate mb-1">{deployment.name}</h3>
          {project && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Folder className="h-3 w-3" />
              <span className="truncate">{project.name}</span>
            </div>
          )}
          {deployment.slug && (
            <p className="text-xs text-muted-foreground mt-1">
              Slug: {deployment.slug}
            </p>
          )}
        </div>

        {/* URL */}
        {deployment.enabled && (
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
            Version: {deployment.settingsVersion}
            {deployment.lastPublishedVersion && (
              <> / {deployment.lastPublishedVersion}</>
            )}
          </div>
          {deployment.publishedAt && (
            <div>
              Published {formatDistanceToNow(new Date(deployment.publishedAt), { addSuffix: true })}
            </div>
          )}
        </div>

        {/* Stats Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {deployment.headScripts.filter(s => s.enabled).length +
            deployment.bodyScripts.filter(s => s.enabled).length >
            0 && (
            <Badge variant="secondary" className="text-xs">
              {deployment.headScripts.filter(s => s.enabled).length +
                deployment.bodyScripts.filter(s => s.enabled).length}{' '}
              Script
              {deployment.headScripts.filter(s => s.enabled).length +
                deployment.bodyScripts.filter(s => s.enabled).length !==
                1 && 's'}
            </Badge>
          )}
          {deployment.cdnLinks.filter(c => c.enabled).length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {deployment.cdnLinks.filter(c => c.enabled).length} CDN Resource
              {deployment.cdnLinks.filter(c => c.enabled).length !== 1 && 's'}
            </Badge>
          )}
          {deployment.analytics.enabled && (
            <Badge variant="secondary" className="text-xs">
              Analytics
            </Badge>
          )}
          {(deployment.seo.title || deployment.seo.description) && (
            <Badge variant="secondary" className="text-xs">
              SEO Configured
            </Badge>
          )}
          {deployment.compliance.enabled && (
            <Badge variant="secondary" className="text-xs">
              Compliance
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {deployment.enabled ? (
            <>
              <Button
                variant={hasPendingChanges ? undefined : 'outline'}
                size="sm"
                className={
                  hasPendingChanges
                    ? 'flex-1 !bg-orange-500 hover:!bg-orange-600 !text-white'
                    : 'flex-1'
                }
                onClick={() => onPublish(deployment.id)}
                disabled={isPublishing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isPublishing ? 'animate-spin' : ''}`} />
                {isPublishing
                  ? 'Publishing...'
                  : hasPendingChanges
                    ? 'Publish Changes'
                    : isPublished
                      ? 'Republish'
                      : 'Publish Deployment'}
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
              onClick={() => onEnable(deployment.id)}
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
              <DropdownMenuItem onClick={() => onEditProject(deployment)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Project
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onOpenSettings(deployment)}>
                <Settings className="h-4 w-4 mr-2" />
                Deployment Settings
              </DropdownMenuItem>
              {deployment.databaseEnabled && (
                <DropdownMenuItem onClick={() => onOpenServerSettings?.(deployment)}>
                  <Server className="h-4 w-4 mr-2" />
                  Server Settings
                </DropdownMenuItem>
              )}
              {deployment.analytics.enabled && deployment.analytics.provider === 'builtin' && (
                <DropdownMenuItem onClick={() => onViewAnalytics(deployment)}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Analytics
                </DropdownMenuItem>
              )}
              {deployment.enabled && (
                <DropdownMenuItem onClick={handleCopyUrl}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy URL
                </DropdownMenuItem>
              )}
              {onExportAsTemplate && (
                <DropdownMenuItem onClick={() => onExportAsTemplate(deployment)}>
                  <FileBox className="h-4 w-4 mr-2" />
                  Export as Deployment Template
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {deployment.enabled ? (
                <DropdownMenuItem onClick={() => onDisable(deployment.id)}>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Disable Deployment
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onEnable(deployment.id)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Enable Deployment
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onDelete(deployment.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Deployment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

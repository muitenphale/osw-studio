'use client';

import React, { useEffect, useState } from 'react';
import { Site } from '@/lib/vfs/types';
import { Server, Database, ChevronDown, Loader2, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SiteSelectorProps {
  projectId: string;
  selectedSiteId: string | null;
  onSiteChange: (siteId: string | null, siteName: string | null) => void;
  className?: string;
}

export function SiteSelector({
  projectId,
  selectedSiteId,
  onSiteChange,
  className,
}: SiteSelectorProps) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch sites for this project
  useEffect(() => {
    const fetchSites = async () => {
      // Only fetch in server mode
      if (process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/projects/${projectId}/sites`);
        if (!response.ok) {
          throw new Error('Failed to fetch sites');
        }

        const data = await response.json();
        setSites(data.sites || []);

        // Auto-select first site if only one exists and nothing is selected
        if (data.sites?.length === 1 && !selectedSiteId) {
          const site = data.sites[0];
          if (site.databaseEnabled) {
            onSiteChange(site.id, site.name);
          }
        }
      } catch (err) {
        console.error('[SiteSelector] Error fetching sites:', err);
        setError('Failed to load sites');
      } finally {
        setLoading(false);
      }
    };

    fetchSites();
  }, [projectId]); // Only refetch when project changes

  // Don't render in browser mode
  if (process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') {
    return null;
  }

  // Don't render if no sites with database enabled
  const databaseEnabledSites = sites.filter(s => s.databaseEnabled);
  if (!loading && databaseEnabledSites.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading sites...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-destructive', className)}>
        <Server className="h-4 w-4" />
        <span>{error}</span>
      </div>
    );
  }

  const selectedSite = sites.find(s => s.id === selectedSiteId);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Database className="h-4 w-4" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Server Context</p>
          <p className="text-xs text-muted-foreground">
            Connect to a site for database, edge functions, and secrets
          </p>
        </TooltipContent>
      </Tooltip>

      <Select
        value={selectedSiteId || 'none'}
        onValueChange={(value) => {
          if (value === 'none') {
            onSiteChange(null, null);
          } else {
            const site = sites.find(s => s.id === value);
            onSiteChange(value, site?.name || null);
          }
        }}
      >
        <SelectTrigger size="sm" className="w-[180px] h-8">
          <SelectValue placeholder="No site connected" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="text-muted-foreground">No site</span>
          </SelectItem>
          {databaseEnabledSites.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              <div className="flex items-center gap-2">
                <Server className="h-3.5 w-3.5" />
                <span>{site.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedSite && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onSiteChange(null, null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Disconnect site</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

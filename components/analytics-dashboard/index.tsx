'use client';

import React, { useState, useEffect } from 'react';
import { Deployment } from '@/lib/vfs/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HeatmapViewer } from '@/components/heatmap-viewer';
import { SessionViewer } from '@/components/session-viewer';
import { EngagementMetrics } from '@/components/engagement-metrics';
import { X, BarChart3, MousePointerClick, Users, Activity, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface AnalyticsDashboardProps {
  deployment: Deployment;
  isOpen: boolean;
  onClose: () => void;
}

interface AnalyticsOverview {
  totalPageviews: number;
  uniqueVisitors: number;
  averageTimeOnSite: number;
  bounceRate: number;
  topPages: Array<{ page: string; views: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  deviceBreakdown: Record<string, number>;
  countryBreakdown: Record<string, number>;
}

interface StorageInfo {
  totalMB: number;
  breakdown: {
    pageviews: { count: number; sizeMB: number };
    interactions: { count: number; sizeMB: number };
    sessions: { count: number; sizeMB: number };
  };
}

export function AnalyticsDashboard({ deployment, isOpen, onClose }: AnalyticsDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notPublished, setNotPublished] = useState(false);

  useEffect(() => {
    if (!deployment) return;

    // Check if deployment has been published (database enabled)
    if (!deployment.databaseEnabled) {
      setNotPublished(true);
      setLoading(false);
      return;
    }

    setNotPublished(false);
    fetchOverview();
    fetchStorage();
  }, [deployment?.id, deployment?.databaseEnabled]);

  const fetchOverview = async () => {
    if (!deployment) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/analytics/${deployment.id}/overview`);

      if (response.status === 401) {
        window.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API Error:', response.status, errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: AnalyticsOverview = await response.json();
      setOverview(data);

      const uniquePages = Array.from(new Set(data.topPages.map(p => p.page)));
      setPages(uniquePages);
    } catch (error) {
      console.error('Failed to fetch analytics overview:', error);
      toast.error(`Failed to load overview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchStorage = async () => {
    if (!deployment) return;
    try {
      const response = await fetch(`/api/analytics/${deployment.id}/storage`);

      if (response.status === 401) {
        window.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Storage API Error:', response.status, errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: StorageInfo = await response.json();
      setStorage(data);
    } catch (error) {
      console.error('Failed to fetch storage info:', error);
      toast.error(`Failed to load storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleExport = async () => {
    if (!deployment) return;
    try {
      const response = await fetch(`/api/analytics/${deployment.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'csv', type: 'all' }),
      });

      if (response.status === 401) {
        window.location.href = '/admin/login';
        return;
      }

      if (!response.ok) throw new Error('Failed to export data');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${deployment.id}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Analytics data exported');
    } catch (error) {
      console.error('Failed to export analytics:', error);
      toast.error('Failed to export analytics data');
    }
  };

  const handleClearData = async () => {
    if (!deployment) return;
    if (!confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/analytics/${deployment.id}/clear?type=all`, {
        method: 'DELETE',
      });

      if (response.status === 401) {
        window.location.href = '/admin/login';
        return;
      }

      if (!response.ok) throw new Error('Failed to clear data');

      toast.success('Analytics data cleared');
      fetchOverview();
      fetchStorage();
    } catch (error) {
      console.error('Failed to clear analytics:', error);
      toast.error('Failed to clear analytics data');
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (!deployment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[64rem] h-[90vh] p-0 flex flex-col">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-2xl">Analytics Dashboard</DialogTitle>
            <DialogDescription>{deployment.name || deployment.id}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={notPublished}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearData} disabled={notPublished}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Data
            </Button>
          </div>
        </div>

        {storage && (
        <div className="border-b px-6 py-2 bg-muted/50 text-sm">
          <span className="text-muted-foreground">Storage:</span>{' '}
          <span className="font-medium">{storage.totalMB.toFixed(2)} MB</span>
          {' • '}
          <span className="text-muted-foreground">Pageviews:</span>{' '}
          <span className="font-medium">{storage.breakdown.pageviews.count.toLocaleString()}</span>
          {' • '}
          <span className="text-muted-foreground">Interactions:</span>{' '}
          <span className="font-medium">{storage.breakdown.interactions.count.toLocaleString()}</span>
          {' • '}
          <span className="text-muted-foreground">Sessions:</span>{' '}
          <span className="font-medium">{storage.breakdown.sessions.count.toLocaleString()}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b px-6">
            <TabsList>
              <TabsTrigger value="overview">
                <BarChart3 className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="heatmaps">
                <MousePointerClick className="h-4 w-4 mr-2" />
                Heatmaps
              </TabsTrigger>
              <TabsTrigger value="sessions">
                <Users className="h-4 w-4 mr-2" />
                Sessions
              </TabsTrigger>
              <TabsTrigger value="engagement">
                <Activity className="h-4 w-4 mr-2" />
                Engagement
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="overview" className="p-6 space-y-6">
              {loading && (
                <div className="flex items-center justify-center h-96">
                  <p className="text-muted-foreground">Loading analytics...</p>
                </div>
              )}

              {!loading && notPublished && (
                <div className="flex flex-col items-center justify-center h-96 text-center">
                  <BarChart3 className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Analytics Not Available</h3>
                  <p className="text-muted-foreground max-w-md">
                    Analytics data will be available after you publish your deployment for the first time.
                    The analytics database is created when the deployment is published.
                  </p>
                </div>
              )}

              {!loading && !notPublished && overview && (
                <>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="border rounded-lg p-4">
                      <div className="text-sm text-muted-foreground">Total Pageviews</div>
                      <div className="text-2xl font-bold">{overview.totalPageviews.toLocaleString()}</div>
                    </div>
                    <div className="border rounded-lg p-4">
                      <div className="text-sm text-muted-foreground">Unique Visitors</div>
                      <div className="text-2xl font-bold">{overview.uniqueVisitors.toLocaleString()}</div>
                    </div>
                    <div className="border rounded-lg p-4">
                      <div className="text-sm text-muted-foreground">Avg. Time on Site</div>
                      <div className="text-2xl font-bold">{formatDuration(overview.averageTimeOnSite)}</div>
                    </div>
                    <div className="border rounded-lg p-4">
                      <div className="text-sm text-muted-foreground">Bounce Rate</div>
                      <div className="text-2xl font-bold">{(overview.bounceRate * 100).toFixed(1)}%</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h3 className="font-medium mb-4">Top Pages</h3>
                    <div className="space-y-2">
                      {overview.topPages.map((page) => (
                        <div key={page.page} className="flex justify-between items-center">
                          <span className="text-sm truncate flex-1">{page.page}</span>
                          <span className="text-sm font-medium ml-4">{page.views.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h3 className="font-medium mb-4">Top Referrers</h3>
                    <div className="space-y-2">
                      {overview.topReferrers.map((referrer) => (
                        <div key={referrer.referrer} className="flex justify-between items-center">
                          <span className="text-sm truncate flex-1">
                            {referrer.referrer || '(Direct)'}
                          </span>
                          <span className="text-sm font-medium ml-4">{referrer.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h3 className="font-medium mb-4">Device Breakdown</h3>
                    <div className="space-y-2">
                      {Object.entries(overview.deviceBreakdown).map(([device, count]) => {
                        const total = Object.values(overview.deviceBreakdown).reduce((sum, c) => sum + c, 0);
                        const percentage = total > 0 ? (count / total) * 100 : 0;

                        return (
                          <div key={device}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="capitalize">{device}</span>
                              <span className="text-muted-foreground">
                                {count.toLocaleString()} ({percentage.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="h-6 bg-muted rounded overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${percentage}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="heatmaps" className="p-6">
              {notPublished ? (
                <div className="flex flex-col items-center justify-center h-96 text-center">
                  <MousePointerClick className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Heatmaps Not Available</h3>
                  <p className="text-muted-foreground max-w-md">
                    Heatmap data will be collected after you publish your deployment.
                  </p>
                </div>
              ) : (
                <HeatmapViewer deploymentId={deployment.id} pages={pages} />
              )}
            </TabsContent>

            <TabsContent value="sessions" className="p-6">
              {notPublished ? (
                <div className="flex flex-col items-center justify-center h-96 text-center">
                  <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Sessions Not Available</h3>
                  <p className="text-muted-foreground max-w-md">
                    Session data will be collected after you publish your deployment.
                  </p>
                </div>
              ) : (
                <SessionViewer deploymentId={deployment.id} />
              )}
            </TabsContent>

            <TabsContent value="engagement" className="p-6">
              {notPublished ? (
                <div className="flex flex-col items-center justify-center h-96 text-center">
                  <Activity className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Engagement Metrics Not Available</h3>
                  <p className="text-muted-foreground max-w-md">
                    Engagement data will be collected after you publish your deployment.
                  </p>
                </div>
              ) : (
                <EngagementMetrics deploymentId={deployment.id} />
              )}
            </TabsContent>
          </div>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

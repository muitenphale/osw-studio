'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Server,
  FolderKanban,
  Globe,
  Activity,
  AlertTriangle,
  FileText,
  Puzzle,
  Layout,
  Database,
  HardDrive,
  Clock,
  Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardData {
  system: {
    version: string;
    nodeVersion: string;
    uptime: number;
    memoryUsed: number;
    memoryTotal: number;
  };
  content: {
    projects: number;
    templates: number;
    skills: number;
    totalFiles: number;
  };
  hosting: {
    publishedSites: number;
    sitesWithDb: number;
    storageUsed: number;
  };
  traffic: {
    requestsLastHour: number;
    requestsLastDay: number;
    errorCount: number;
    topSites: Array<{ siteId: string; siteName: string; count: number }>;
    recentErrors: Array<{ siteId: string; path: string; statusCode: number; timestamp: string }>;
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
      <div className="p-2 bg-zinc-800 rounded-lg">
        <Icon className="w-4 h-4 text-zinc-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-500 truncate">{label}</div>
        <div className="text-sm font-medium text-zinc-200">{value}</div>
        {subValue && <div className="text-xs text-zinc-500">{subValue}</div>}
      </div>
    </div>
  );
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-orange-500" />
      <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
    </div>
  );
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/dashboard');
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const result = await response.json();
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-zinc-400">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
          {lastUpdated && (
            <p className="text-xs text-zinc-500 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* System Section */}
        <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4">
          <SectionHeader title="System" icon={Server} />
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Layout} label="OSWS Version" value={`v${data.system.version}`} />
            <StatCard icon={Cpu} label="Node.js" value={data.system.nodeVersion} />
            <StatCard icon={Clock} label="Uptime" value={formatUptime(data.system.uptime)} />
            <StatCard
              icon={HardDrive}
              label="Memory"
              value={formatBytes(data.system.memoryUsed)}
              subValue={`of ${formatBytes(data.system.memoryTotal)}`}
            />
          </div>
        </div>

        {/* Content Section */}
        <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4">
          <SectionHeader title="Content" icon={FolderKanban} />
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={FolderKanban} label="Projects" value={data.content.projects} />
            <StatCard icon={Layout} label="Templates" value={data.content.templates} />
            <StatCard icon={Puzzle} label="Skills" value={data.content.skills} />
            <StatCard icon={FileText} label="Files" value={formatNumber(data.content.totalFiles)} />
          </div>
        </div>

        {/* Hosting Section */}
        <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4">
          <SectionHeader title="Hosting" icon={Globe} />
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Globe} label="Published Sites" value={data.hosting.publishedSites} />
            <StatCard icon={Database} label="Sites with DB" value={data.hosting.sitesWithDb} />
            <StatCard
              icon={HardDrive}
              label="Storage Used"
              value={formatBytes(data.hosting.storageUsed)}
              subValue="public/sites/"
            />
          </div>
        </div>

        {/* Traffic Section */}
        <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4">
          <SectionHeader title="Traffic (Origin)" icon={Activity} />
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={Activity}
              label="Last Hour"
              value={formatNumber(data.traffic.requestsLastHour)}
              subValue="requests"
            />
            <StatCard
              icon={Activity}
              label="Last 24h"
              value={formatNumber(data.traffic.requestsLastDay)}
              subValue="requests"
            />
            <StatCard
              icon={AlertTriangle}
              label="Errors (24h)"
              value={data.traffic.errorCount}
              subValue="4xx + 5xx"
            />
          </div>
        </div>
      </div>

      {/* Bottom Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Sites */}
        <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4">
          <SectionHeader title="Top Sites (24h)" icon={Globe} />
          {data.traffic.topSites.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">No traffic recorded yet</p>
          ) : (
            <div className="space-y-2">
              {data.traffic.topSites.slice(0, 5).map((site, i) => (
                <div
                  key={site.siteId}
                  className="flex items-center justify-between py-2 px-3 bg-zinc-900/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 w-4">{i + 1}.</span>
                    <span className="text-sm text-zinc-300 truncate max-w-[200px]">
                      {site.siteName}
                    </span>
                  </div>
                  <span className="text-sm text-zinc-400">{formatNumber(site.count)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Errors */}
        <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4">
          <SectionHeader title="Recent Errors" icon={AlertTriangle} />
          {data.traffic.recentErrors.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">No errors recorded</p>
          ) : (
            <div className="space-y-2">
              {data.traffic.recentErrors.slice(0, 5).map((error, i) => (
                <div
                  key={`${error.siteId}-${error.path}-${i}`}
                  className="flex items-center justify-between py-2 px-3 bg-zinc-900/50 rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        error.statusCode >= 500
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {error.statusCode}
                    </span>
                    <span className="text-sm text-zinc-400 truncate max-w-[200px]">
                      {error.path}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {new Date(error.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  Plus,
  FolderOpen,
  Globe,
  Sparkles,
  BookOpen,
  AlertTriangle,
  ExternalLink,
  Newspaper,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { DiscordIcon } from '@/components/ui/discord-icon';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { vfs } from '@/lib/vfs';
import { templateService } from '@/lib/vfs/template-service';
import { skillsService } from '@/lib/vfs/skills';
import pkg from '@/package.json';

const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

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
    publishedDeployments: number;
    deploymentsWithDb: number;
    storageUsed: number;
  };
  traffic: {
    requestsLastHour: number;
    requestsLastDay: number;
    errorCount: number;
    topDeployments: Array<{ deploymentId: string; deploymentName: string; count: number }>;
    recentErrors: Array<{ deploymentId: string; path: string; statusCode: number; timestamp: string }>;
  };
  whatsNew: {
    version: string;
    title: string;
    highlights: string[];
  };
  recentProjects: Array<{
    id: string;
    name: string;
    description: string | null;
    updatedAt: string;
  }>;
  recentDeployments: Array<{
    id: string;
    name: string;
    slug: string;
    enabled: boolean;
    publishedAt: string | null;
    updatedAt: string;
  }>;
}

// Browser mode data (subset of server mode)
interface BrowserDashboardData {
  content: {
    projects: number;
    templates: number;
    skills: number;
  };
  whatsNew: {
    version: string;
    title: string;
    highlights: string[];
  } | null;
  recentProjects: Array<{
    id: string;
    name: string;
    description: string | null;
    updatedAt: string;
  }>;
}

// Fetch dashboard data for browser mode (IndexedDB)
async function fetchBrowserModeData(): Promise<BrowserDashboardData> {
  await vfs.init();

  const projects = await vfs.listProjects();
  const templates = await templateService.listCustomTemplates();
  const skills = await skillsService.getAllSkills();

  // Fetch What's New - version, title, and highlights (matching server mode)
  let whatsNew: BrowserDashboardData['whatsNew'] = null;

  try {
    const response = await fetch('/api/docs/WHATS_NEW.md');
    if (response.ok) {
      const content = await response.text();
      // Find first version heading: ## v{version} - {title}
      const versionMatch = content.match(/^## v(\d+\.\d+\.\d+)\s*-\s*(.+)$/m);
      if (versionMatch) {
        const version = versionMatch[1];
        const title = versionMatch[2].trim();

        // Get content after the version heading until the next ## or ---
        const versionIndex = content.indexOf(versionMatch[0]);
        const afterVersion = content.substring(versionIndex + versionMatch[0].length);
        const nextSectionMatch = afterVersion.match(/^(?:## |---)/m);
        const sectionContent = nextSectionMatch
          ? afterVersion.substring(0, nextSectionMatch.index)
          : afterVersion;

        // Extract bullet points (lines starting with - or *)
        const bulletRegex = /^[-*]\s+\*\*(.+?)\*\*\s*[-–]?\s*(.*)$/gm;
        const highlights: string[] = [];
        let match;

        while ((match = bulletRegex.exec(sectionContent)) !== null && highlights.length < 4) {
          const boldTitle = match[1].trim();
          const description = match[2]?.trim();
          highlights.push(description ? `${boldTitle} - ${description}` : boldTitle);
        }

        // If no bold bullet points found, try regular bullets
        if (highlights.length === 0) {
          const simpleBulletRegex = /^[-*]\s+(.+)$/gm;
          while ((match = simpleBulletRegex.exec(sectionContent)) !== null && highlights.length < 4) {
            const text = match[1].trim();
            if (!text.match(/^\[.*\]\(.*\)$/)) {
              highlights.push(text.replace(/\*\*/g, ''));
            }
          }
        }

        whatsNew = { version, title, highlights };
      }
    }
  } catch {
    // Use null if fetch fails
  }

  return {
    content: {
      projects: projects.length,
      templates: templates.length,
      skills: skills.length,
    },
    whatsNew,
    recentProjects: projects
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || null,
        updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
      })),
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
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

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Quick Actions Bar
function QuickActionsBar({
  onStartTour,
  onNavigate,
}: {
  onStartTour: () => void;
  onNavigate?: (view: string) => void;
}) {
  // In browser mode, use onNavigate callback; in server mode, use Link
  const projectsHref = isServerMode ? '/admin/projects?action=create' : '#';
  const projectsListHref = isServerMode ? '/admin/projects' : '#';
  const docsHref = isServerMode ? '/admin/docs' : '#';

  const handleProjectsClick = (e: React.MouseEvent) => {
    if (!isServerMode && onNavigate) {
      e.preventDefault();
      onNavigate('projects');
    }
  };

  const handleDocsClick = (e: React.MouseEvent) => {
    if (!isServerMode && onNavigate) {
      e.preventDefault();
      onNavigate('docs');
    }
  };

  return (
    <div className="bg-card rounded-xl border border-zinc-800 p-4 mb-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="default" size="sm" asChild className="gap-1.5">
          <Link href={projectsHref} onClick={handleProjectsClick}>
            <Plus className="w-4 h-4" />
            New Project
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <Link href={projectsListHref} onClick={handleProjectsClick}>
            <FolderOpen className="w-4 h-4" />
            Projects
          </Link>
        </Button>
        {isServerMode && (
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href="/admin/deployments">
              <Globe className="w-4 h-4" />
              Deployments
            </Link>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onStartTour} className="gap-1.5">
          <Sparkles className="w-4 h-4" />
          Guided Tour
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a href="https://discord.gg/mAJ8Ss4u" target="_blank" rel="noopener noreferrer">
            <DiscordIcon className="w-4 h-4" />
            Discord
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <Link href={docsHref} onClick={handleDocsClick}>
            <BookOpen className="w-4 h-4" />
            Docs
          </Link>
        </Button>
      </div>
    </div>
  );
}

// What's New Card - always visible, links to full changelog
type WhatsNewProps = {
  version: string;
  title: string;
  highlights?: string[];
};

function WhatsNewCard({
  whatsNew,
  onNavigate,
}: {
  whatsNew: WhatsNewProps;
  onNavigate?: (view: string) => void;
}) {
  if (!whatsNew) return null;

  const handleReadAll = (e: React.MouseEvent) => {
    if (!isServerMode && onNavigate) {
      e.preventDefault();
      window.history.pushState({}, '', '/?doc=whats-new');
      onNavigate('docs');
    }
  };

  const docsHref = isServerMode ? '/admin/docs?doc=whats-new' : '#';

  return (
    <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4 flex flex-col">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-medium text-zinc-200">
            What&apos;s New in v{whatsNew.version}
          </h3>
        </div>
        <Link
          href={docsHref}
          onClick={handleReadAll}
          className="text-xs text-orange-500 hover:text-orange-400 flex items-center gap-1"
        >
          Read all
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <p className="text-sm font-medium text-zinc-200 mb-2">{whatsNew.title}</p>
      {whatsNew.highlights && whatsNew.highlights.length > 0 && (
        <ul className="space-y-1 flex-1">
          {whatsNew.highlights.map((highlight, i) => (
            <li key={i} className="text-xs text-zinc-300 flex items-start gap-2">
              <span className="text-orange-500/70 mt-0.5">•</span>
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Compact System Overview (server mode - full stats)
function CompactOverview({
  data,
  loading,
  onRefresh,
}: {
  data: DashboardData;
  loading: boolean;
  onRefresh: () => void;
}) {
  const stats = [
    { label: 'Version', value: `v${data.system.version}` },
    { label: 'Projects', value: formatNumber(data.content.projects) },
    { label: 'Deployments', value: formatNumber(data.hosting.publishedDeployments) },
    { label: 'Traffic/h', value: formatNumber(data.traffic.requestsLastHour) },
    { label: 'Traffic/d', value: formatNumber(data.traffic.requestsLastDay) },
    { label: 'Errors', value: formatNumber(data.traffic.errorCount), highlight: data.traffic.errorCount > 0 },
    { label: 'Memory', value: formatBytes(data.system.memoryUsed) },
    { label: 'Uptime', value: formatUptime(data.system.uptime) },
  ];

  const half = Math.ceil(stats.length / 2);
  const leftColumn = stats.slice(0, half);
  const rightColumn = stats.slice(half);

  return (
    <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-zinc-300">System Overview</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="h-7 px-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 flex-1 content-start">
        <div className="space-y-1.5">
          {leftColumn.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">{stat.label}</span>
              <span className={`text-sm font-medium ${stat.highlight ? 'text-yellow-500' : 'text-zinc-200'}`}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {rightColumn.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">{stat.label}</span>
              <span className={`text-sm font-medium ${stat.highlight ? 'text-yellow-500' : 'text-zinc-200'}`}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Browser mode Overview (subset of stats)
function BrowserOverview({
  data,
  loading,
  onRefresh,
}: {
  data: BrowserDashboardData;
  loading: boolean;
  onRefresh: () => void;
}) {
  const stats = [
    { label: 'Version', value: `v${pkg.version}` },
    { label: 'Projects', value: formatNumber(data.content.projects) },
    { label: 'Templates', value: formatNumber(data.content.templates) },
    { label: 'Skills', value: formatNumber(data.content.skills) },
  ];

  const half = Math.ceil(stats.length / 2);
  const leftColumn = stats.slice(0, half);
  const rightColumn = stats.slice(half);

  return (
    <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-zinc-300">Content Overview</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="h-7 px-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 flex-1 content-start">
        <div className="space-y-1.5">
          {leftColumn.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">{stat.label}</span>
              <span className="text-sm font-medium text-zinc-200">{stat.value}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {rightColumn.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">{stat.label}</span>
              <span className="text-sm font-medium text-zinc-200">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Recent Projects Card
function RecentProjectsCard({
  projects,
  onNavigate,
  onProjectSelect,
}: {
  projects: DashboardData['recentProjects'] | BrowserDashboardData['recentProjects'];
  onNavigate?: (view: string) => void;
  onProjectSelect?: (projectId: string) => void;
}) {
  const handleViewAll = (e: React.MouseEvent) => {
    if (!isServerMode && onNavigate) {
      e.preventDefault();
      onNavigate('projects');
    }
  };

  const handleProjectClick = (e: React.MouseEvent, projectId: string) => {
    if (!isServerMode && onProjectSelect) {
      e.preventDefault();
      onProjectSelect(projectId);
    }
  };

  const viewAllHref = isServerMode ? '/admin/projects' : '#';

  return (
    <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-medium text-zinc-300">Recent Projects</h3>
        </div>
        <Link
          href={viewAllHref}
          onClick={handleViewAll}
          className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5"
        >
          View all
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {projects.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-2 flex-1 flex items-center justify-center">
          No projects yet
        </p>
      ) : (
        <div className="space-y-1.5 flex-1">
          {projects.slice(0, 3).map((project) => (
            <Link
              key={project.id}
              href={isServerMode ? `/admin/projects?open=${project.id}` : '#'}
              onClick={(e) => handleProjectClick(e, project.id)}
              className="flex items-center justify-between text-xs py-1.5 px-2 bg-zinc-900/50 rounded hover:bg-zinc-800/50 transition-colors"
            >
              <span className="text-zinc-300 truncate flex-1 mr-2">{project.name}</span>
              <span className="text-zinc-500 shrink-0 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(project.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Recent Deployments Card
function RecentDeploymentsCard({ deployments }: { deployments: DashboardData['recentDeployments'] }) {
  return (
    <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-medium text-zinc-300">Recent Deployments</h3>
        </div>
        <Link
          href="/admin/deployments"
          className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5"
        >
          View all
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {deployments.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-2 flex-1 flex items-center justify-center">
          No deployments yet
        </p>
      ) : (
        <div className="space-y-1.5 flex-1">
          {deployments.slice(0, 3).map((deployment) => (
            <Link
              key={deployment.id}
              href={`/admin/deployments?open=${deployment.id}`}
              className="flex items-center justify-between text-xs py-1.5 px-2 bg-zinc-900/50 rounded hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    deployment.enabled ? 'bg-green-500' : 'bg-zinc-500'
                  }`}
                />
                <span className="text-zinc-300 truncate">{deployment.name}</span>
              </div>
              <span className="text-zinc-500 shrink-0 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(deployment.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Compact Top Deployments & Errors
function TrafficLists({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Top Deployments */}
      <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-medium text-zinc-300">Top Deployments (24h)</h3>
        </div>
        {data.traffic.topDeployments.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-2 flex-1 flex items-center justify-center">
            No traffic recorded yet
          </p>
        ) : (
          <div className="space-y-1.5 flex-1">
            {data.traffic.topDeployments.slice(0, 5).map((deployment, i) => (
              <div
                key={deployment.deploymentId}
                className="flex items-center justify-between text-xs py-1 px-2 bg-zinc-900/50 rounded"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-zinc-500 w-4">{i + 1}.</span>
                  <span className="text-zinc-300 truncate">{deployment.deploymentName}</span>
                </div>
                <span className="text-zinc-500 shrink-0">{formatNumber(deployment.count)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Errors */}
      <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-medium text-zinc-300">Recent Errors</h3>
        </div>
        {data.traffic.recentErrors.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-2 flex-1 flex items-center justify-center">
            No errors recorded
          </p>
        ) : (
          <div className="space-y-1.5 flex-1">
            {data.traffic.recentErrors.slice(0, 5).map((error, i) => (
              <div
                key={`${error.deploymentId}-${error.path}-${i}`}
                className="flex items-center justify-between text-xs py-1 px-2 bg-zinc-900/50 rounded"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`font-mono px-1 py-0.5 rounded text-[10px] ${
                      error.statusCode >= 500
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}
                  >
                    {error.statusCode}
                  </span>
                  <span className="text-zinc-400 truncate max-w-[140px]">{error.path}</span>
                </div>
                <span className="text-zinc-500 shrink-0 text-[10px]">
                  {new Date(error.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface DashboardViewProps {
  onNavigate?: (view: string) => void;
  onProjectSelect?: (projectId: string) => void;
  onStartTour?: () => void;
}

export function DashboardView({ onNavigate, onProjectSelect, onStartTour }: DashboardViewProps) {
  const router = useRouter();
  // Server mode data
  const [serverData, setServerData] = useState<DashboardData | null>(null);
  // Browser mode data
  const [browserData, setBrowserData] = useState<BrowserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isServerMode) {
        // Server mode: fetch from API
        const response = await fetch('/api/admin/dashboard');
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data');
        }
        const result = await response.json();
        setServerData(result);
      } else {
        // Browser mode: fetch from IndexedDB
        const result = await fetchBrowserModeData();
        setBrowserData(result);
      }
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

  const handleStartTour = useCallback(() => {
    if (onStartTour) {
      // Browser mode: use callback
      onStartTour();
    } else {
      // Server mode: use router
      router.push('/admin/projects?tour=start');
    }
  }, [router, onStartTour]);

  const handleProjectSelect = useCallback((projectId: string) => {
    if (!isServerMode && onProjectSelect) {
      onProjectSelect(projectId);
    }
  }, [onProjectSelect]);

  // Loading state
  const hasData = isServerMode ? !!serverData : !!browserData;
  if (loading && !hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-3 text-sm text-zinc-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!hasData) return null;

  // Server mode render
  if (isServerMode && serverData) {
    const hasWhatsNew = serverData.whatsNew?.highlights?.length > 0;

    return (
      <div className="h-full overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
            {lastUpdated && (
              <p className="text-xs text-zinc-500 mt-0.5">
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <QuickActionsBar onStartTour={handleStartTour} />

        {/* Row 1: System Overview + What's New */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 [&>*]:min-h-[160px]">
          <CompactOverview data={serverData} loading={loading} onRefresh={fetchData} />
          {hasWhatsNew && <WhatsNewCard whatsNew={serverData.whatsNew} />}
        </div>

        {/* Row 2: Recent Projects + Recent Deployments */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 [&>*]:min-h-[160px]">
          <RecentProjectsCard projects={serverData.recentProjects} />
          <RecentDeploymentsCard deployments={serverData.recentDeployments} />
        </div>

        {/* Row 3: Top Deployments + Recent Errors */}
        <div className="[&>*>*]:min-h-[140px]">
          <TrafficLists data={serverData} />
        </div>
      </div>
    );
  }

  // Browser mode render
  if (!isServerMode && browserData) {
    const hasWhatsNew = browserData.whatsNew !== null;

    return (
      <div className="h-full overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
            {lastUpdated && (
              <p className="text-xs text-zinc-500 mt-0.5">
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <QuickActionsBar onStartTour={handleStartTour} onNavigate={onNavigate} />

        {/* Row 1: Content Overview + What's New */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 [&>*]:min-h-[160px]">
          <BrowserOverview data={browserData} loading={loading} onRefresh={fetchData} />
          {hasWhatsNew && (
            <WhatsNewCard
              whatsNew={browserData.whatsNew!}
              onNavigate={onNavigate}
            />
          )}
        </div>

        {/* Row 2: Recent Projects (no Deployments in browser mode) */}
        <div className="mb-4">
          <RecentProjectsCard
            projects={browserData.recentProjects}
            onNavigate={onNavigate}
            onProjectSelect={handleProjectSelect}
          />
        </div>
      </div>
    );
  }

  return null;
}

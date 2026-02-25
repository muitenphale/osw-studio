'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { Project } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { getSyncOverviewStatus, SyncOverviewStatus } from '@/lib/vfs/auto-sync';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import {
  FolderOpen,
  Globe,
  LayoutTemplate,
  Sparkles,
  Settings,
  Info,
  TestTube,
  Github,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  ChevronDown,
  Cloud,
  LogOut,
  LayoutDashboard,
} from 'lucide-react';
import { DiscordIcon } from '@/components/ui/discord-icon';
import { DOCS_ITEMS } from '@/lib/constants/docs';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import pkg from '@/package.json';

// Collapsed sidebar width
export const COLLAPSED_SIDEBAR_WIDTH = 56; // Width in pixels for icon-only buttons

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path?: string;
  action?: string;
  href?: string;
  serverModeOnly?: boolean;
  hasRecentProjects?: boolean; // Special flag for Projects to show recent projects as sub-items
  subItems?: {
    id: string;
    label: string;
    icon: React.ElementType;
    file?: string; // For docs
  }[];
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: 'dashboard' },
  { id: 'projects', label: 'Projects', icon: FolderOpen, path: 'projects', hasRecentProjects: true },
  { id: 'deployments', label: 'Deployments', icon: Globe, path: 'deployments', serverModeOnly: true },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, path: 'templates' },
  { id: 'skills', label: 'Skills', icon: Sparkles, path: 'skills' },
  {
    id: 'docs',
    label: 'Docs',
    icon: BookOpen,
    path: 'docs',
    subItems: DOCS_ITEMS.map(doc => ({
      id: doc.id,
      label: doc.title,
      icon: doc.icon,
      file: doc.file,
    }))
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: 'settings',
    subItems: [
      { id: 'application', label: 'Application', icon: Settings },
      { id: 'model', label: 'Provider & Model', icon: Sparkles },
    ]
  },
  { id: 'tour', label: 'Guided Tour', icon: Info, action: 'start-tour' },
  { id: 'tester', label: 'Benchmark', icon: TestTube, path: '/test-generation' },
  { id: 'about', label: 'About', icon: Info, action: 'open-about' },
  { id: 'discord', label: 'Discord', icon: DiscordIcon, href: 'https://discord.gg/mAJ8Ss4u' },
  { id: 'github', label: 'GitHub', icon: Github, href: 'https://github.com/o-stahl/osw-studio' },
];

const SYSTEM_ACTIONS: SidebarItem[] = [
  { id: 'sync', label: 'Server Sync', icon: Cloud, action: 'server-sync' },
  { id: 'logout', label: 'Logout', icon: LogOut, action: 'logout' },
];

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onProjectSelect: (project: Project) => void;
  onStartTour?: () => void;
  onOpenAbout?: () => void;
  onOpenSettings?: () => void;
  onServerSync?: () => void;
  onLogoClick?: () => void;
  onPinnedChange?: (pinned: boolean) => void;
  onHoverChange?: (hovering: boolean) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

function SidebarContent({
  currentView,
  onNavigate,
  onProjectSelect,
  onStartTour,
  onOpenAbout,
  onOpenSettings,
  onServerSync,
  onLogoClick,
  onPinnedChange,
  onHoverChange,
  onCollapsedChange,
  mobileOpen = false,
  onMobileOpenChange,
}: SidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDocId = searchParams.get('doc');
  const currentSettingsTab = searchParams.get('settings');
  const [pinned, setPinned] = useState(true); // Pinned = sidebar stays expanded
  const [hovering, setHovering] = useState(false);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [loadingRecentProjects, setLoadingRecentProjects] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncOverviewStatus | null>(null);

  // Initialize expandedItems based on currentView to prevent flash
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (currentView === 'docs') initial.add('docs');
    if (currentView === 'projects') initial.add('projects');
    if (currentView === 'settings') initial.add('settings');
    return initial;
  });
  const [logoHover, setLogoHover] = useState(false);

  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  // Track if we're on mobile (client-side only)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Collapsed state is derived: collapsed when not pinned AND not hovering (desktop only)
  // On mobile, sidebar is never collapsed - it's either open or closed via mobileOpen
  const collapsed = !isMobile && !pinned && !hovering;

  // Auto-expand items when on their view
  useEffect(() => {
    if (currentView === 'docs') {
      setExpandedItems(prev => new Set(prev).add('docs'));
    }
    if (currentView === 'projects') {
      setExpandedItems(prev => new Set(prev).add('projects'));
    }
  }, [currentView]);

  // Load recent projects
  useEffect(() => {
    async function loadRecentProjects() {
      try {
        await vfs.init();
        const projects = await vfs.listProjects();
        const sorted = projects.sort((a, b) =>
          b.updatedAt.getTime() - a.updatedAt.getTime()
        );
        setRecentProjects(sorted.slice(0, 3));
      } catch (error) {
        console.error('Failed to load recent projects:', error);
      } finally {
        setLoadingRecentProjects(false);
      }
    }
    loadRecentProjects();
  }, []);

  // Load sync status for Server Mode
  useEffect(() => {
    if (!isServerMode) return;

    async function loadSyncStatus() {
      try {
        const status = await getSyncOverviewStatus();
        setSyncStatus(status);
      } catch (error) {
        console.error('Failed to load sync status:', error);
      }
    }
    loadSyncStatus();
  }, [isServerMode]);

  // Load pinned state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('osw-admin-sidebar-pinned');
    if (stored !== null) {
      setPinned(stored === 'true');
    }
  }, []);

  // Toggle pinned state
  const togglePinned = () => {
    const newState = !pinned;
    setPinned(newState);
    localStorage.setItem('osw-admin-sidebar-pinned', String(newState));
    onPinnedChange?.(newState);
  };

  // Mouse enter/leave handlers (desktop only)
  const handleMouseEnter = () => {
    if (!isMobile && !pinned) {
      setHovering(true);
      onHoverChange?.(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile && !pinned) {
      setHovering(false);
      onHoverChange?.(false);
    }
  };

  // Notify parent of initial pinned state
  useEffect(() => {
    onPinnedChange?.(pinned);
  }, [pinned, onPinnedChange]);

  // Notify parent of collapsed state
  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  // Filter sidebar items based on Server Mode
  const visibleSidebarItems = SIDEBAR_ITEMS.filter(
    item => !item.serverModeOnly || isServerMode
  );

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleItemAction = async (item: SidebarItem) => {
    // Close mobile menu when action is triggered
    onMobileOpenChange?.(false);

    if (item.href) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
    } else if (item.path) {
      // Check if path is absolute (starts with /)
      if (item.path.startsWith('/')) {
        router.push(item.path);
      } else if (isServerMode) {
        router.push(`/admin/${item.path}`);
      } else {
        // Browser Mode: Use router.push to clear query params when navigating away from docs
        router.push('/');
        onNavigate(item.id);
      }
    } else if (item.action === 'start-tour' && onStartTour) {
      onStartTour();
    } else if (item.action === 'open-about' && onOpenAbout) {
      onOpenAbout();
    } else if (item.action === 'open-settings' && onOpenSettings) {
      onOpenSettings();
    } else if (item.action === 'server-sync' && onServerSync) {
      onServerSync();
    } else if (item.action === 'logout') {
      try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (response.ok) {
          router.push('/admin/login');
        }
      } catch (error) {
        console.error('Logout failed:', error);
      }
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => onMobileOpenChange?.(false)}
        />
      )}

      <div
        className={cn(
          'flex flex-col h-screen bg-card transition-all duration-300',
          // Border: left on mobile (slides from right), right on desktop (stays on left)
          'border-l md:border-l-0 md:border-r',
          // Desktop behavior - always on left
          'md:relative md:left-0',
          pinned ? 'md:relative' : 'md:absolute md:left-0 md:top-0 md:z-40 md:shadow-lg',
          // Mobile behavior - slide in from right, fixed 240px width
          'fixed right-0 top-0 z-50 w-60',
          // Desktop - 240px when expanded, or collapsed width
          collapsed ? '' : 'md:w-60',
          // Mobile: slide from right. Desktop: always visible
          mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        )}
        style={{
          // Apply collapsed width when needed
          width: collapsed ? `${COLLAPSED_SIDEBAR_WIDTH}px` : undefined,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
      {/* Logo/Brand */}
      <button
        onClick={() => {
          // Mobile: close sidebar (if open), do nothing otherwise
          // Desktop: toggle pinned state
          if (isMobile) {
            if (mobileOpen) {
              onMobileOpenChange?.(false);
            }
            // On mobile, don't toggle pinned state
          } else {
            // Desktop: toggle pin/unpin
            togglePinned();
          }
        }}
        onMouseEnter={() => !isMobile && setLogoHover(true)}
        onMouseLeave={() => !isMobile && setLogoHover(false)}
        className={cn(
          "p-3 border-b flex items-center gap-3 h-[54px] overflow-hidden w-full",
          "hover:bg-accent/50 transition-colors cursor-pointer",
          collapsed && "justify-center"
        )}
      >
        {/* Icon container with position relative for chevron overlay */}
        <div className="relative w-6 h-6 flex items-center justify-center flex-shrink-0">
          {/* Logo - hidden on hover */}
          <Logo
            width={24}
            height={24}
            className={cn(
              "transition-opacity absolute",
              logoHover && "opacity-0"
            )}
          />

          {/* Desktop chevron - visible on hover (desktop only) */}
          {/* Left when pinned (collapse), Right when unpinned (expand) */}
          {pinned ? (
            <ChevronLeft
              className={cn(
                "hidden md:block h-6 w-6 transition-opacity absolute",
                logoHover ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
            />
          ) : (
            <ChevronRight
              className={cn(
                "hidden md:block h-6 w-6 transition-opacity absolute",
                logoHover ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
            />
          )}
        </div>

        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold whitespace-nowrap leading-none">
              {logoHover && !pinned ? "Pin" : "Open\u00A0Source Web\u00A0Studio"}
            </span>
            {!(logoHover && !pinned) && (
              <span className="text-[10px] leading-[10px] text-muted-foreground text-left mt-0.5">
                {isServerMode ? `Server, v${pkg.version}` : `v${pkg.version}`}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Main Navigation - Single scrollable container */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {visibleSidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const hasSubItems = (item.subItems && item.subItems.length > 0) || item.hasRecentProjects;
          const isExpanded = expandedItems.has(item.id);

          return (
            <div key={item.id}>
              {/* Wrap parent + children in container - always has padding to prevent layout shift */}
              <div className={cn(
                'p-1',
                isExpanded && hasSubItems && 'bg-muted rounded-2xl'
              )}>
                <div className="relative">
                  <Button
                    variant={isActive && !hasSubItems ? 'default' : 'ghost'}
                    className={cn(
                      'w-full',
                      collapsed ? 'justify-center px-2' : 'justify-start',
                      !collapsed && hasSubItems && 'pr-8' // Make room for chevron
                    )}
                    onClick={() => {
                      // Navigate if item has path (or other action)
                      if (!hasSubItems || currentView !== item.id) {
                        handleItemAction(item);
                      }
                    }}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={cn('h-4 w-4', !collapsed && 'mr-2')} />
                    {!collapsed && item.label}
                  </Button>
                  {!collapsed && hasSubItems && (
                    <button
                      className={cn(
                        'absolute right-2 top-1/2 -translate-y-1/2',
                        'p-1 rounded hover:bg-accent transition-colors'
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleExpanded(item.id);
                      }}
                    >
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 transition-transform',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    </button>
                  )}
                </div>

              {/* Recent Projects Sub-items (for Projects item) */}
              {item.hasRecentProjects && isExpanded && (
                <div className={cn(
                  "mt-1 space-y-1",
                  collapsed ? "flex flex-col items-center" : "ml-4"
                )}>
                  {loadingRecentProjects ? (
                    // Skeleton loaders
                    <>
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex items-center gap-2",
                            collapsed ? "justify-center p-1" : "h-8 px-2"
                          )}
                        >
                          <div className="h-3 w-3 bg-muted-foreground/20 rounded animate-pulse" />
                          {!collapsed && <div className="h-3 flex-1 bg-muted-foreground/20 rounded animate-pulse" />}
                        </div>
                      ))}
                    </>
                  ) : recentProjects.length > 0 ? (
                    // Actual projects
                    recentProjects.map((project) => (
                      <Button
                        key={project.id}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          collapsed ? "w-8 h-8 p-0 justify-center" : "w-full justify-start text-xs"
                        )}
                        onClick={() => {
                          onMobileOpenChange?.(false);
                          onProjectSelect(project);
                        }}
                        title={project.name}
                      >
                        <FolderOpen className={cn("h-3 w-3 flex-shrink-0", !collapsed && "mr-2")} />
                        {!collapsed && <span className="truncate">{project.name}</span>}
                      </Button>
                    ))
                  ) : (
                    !collapsed && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        No recent projects
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Sub-items (for Docs and Settings) */}
              {item.subItems && isExpanded && (
                <div className={cn(
                  "mt-1 space-y-1",
                  collapsed ? "flex flex-col items-center" : "ml-4"
                )}>
                  {item.subItems.map((subItem) => {
                    const SubIcon = subItem.icon;
                    // For docs, check currentDocId. For settings, check URL param or path
                    const isSubItemActive = subItem.file
                      ? currentDocId === subItem.id
                      : item.id === 'settings'
                        ? (isServerMode
                            ? window.location.pathname === `/admin/${item.id}/${subItem.id}`
                            : currentSettingsTab === subItem.id)
                        : (isServerMode && window.location.pathname === `/admin/${item.id}/${subItem.id}`);

                    return (
                      <Button
                        key={subItem.id}
                        variant={isSubItemActive ? 'default' : 'ghost'}
                        size="sm"
                        className={cn(
                          collapsed ? "w-8 h-8 p-0 justify-center" : "w-full justify-start text-xs"
                        )}
                        onClick={() => {
                          onMobileOpenChange?.(false);
                          if (isServerMode) {
                            if (subItem.file) {
                              // Docs sub-item
                              router.push(`/admin/docs?doc=${subItem.id}`);
                            } else {
                              // Settings sub-item
                              router.push(`/admin/${item.id}/${subItem.id}`);
                            }
                          } else {
                            // Browser mode
                            if (subItem.file) {
                              // Docs sub-item - navigate to specific doc
                              router.push(`/?doc=${subItem.id}`);
                              onNavigate(item.id);
                            } else if (item.id === 'settings') {
                              // Settings sub-item - use query param
                              router.push(`/?settings=${subItem.id}`);
                              onNavigate(item.id);
                            } else {
                              // Other sub-items
                              router.push('/');
                              onNavigate(item.id);
                            }
                          }
                        }}
                        title={collapsed ? subItem.label : undefined}
                      >
                        <SubIcon className={cn("h-3 w-3", !collapsed && "mr-2")} />
                        {!collapsed && subItem.label}
                      </Button>
                    );
                  })}
                </div>
              )}
              </div>
            </div>
          );
        })}
      </nav>

      {/* System Actions (Server Mode only) */}
      {isServerMode && (
        <div className="border-t p-2 space-y-1">
          {SYSTEM_ACTIONS.map((item) => {
            const Icon = item.icon;
            const isLogout = item.id === 'logout';
            const isSync = item.id === 'sync';
            const showSyncIndicator = isSync && syncStatus?.needsSync;

            return (
              <Button
                key={item.id}
                variant="ghost"
                size="sm"
                className={cn(
                  'w-full relative',
                  collapsed ? 'justify-center px-2' : 'justify-start',
                  isLogout && 'text-destructive hover:text-destructive hover:bg-destructive/10'
                )}
                onClick={() => handleItemAction(item)}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={cn('h-4 w-4', !collapsed && 'mr-2')} />
                {!collapsed && item.label}
                {/* Orange indicator dot when sync is needed */}
                {showSyncIndicator && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full" />
                )}
              </Button>
            );
          })}
        </div>
      )}

      {/* Pin/Unpin Toggle (desktop only) */}
      <div className="hidden md:block border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'w-full',
            collapsed ? 'justify-center px-2' : 'justify-start'
          )}
          onClick={togglePinned}
          title={collapsed ? (pinned ? "Unpin sidebar" : "Pin sidebar") : undefined}
        >
          {pinned ? (
            <>
              <ChevronLeft className={cn('h-4 w-4', !collapsed && 'mr-2')} />
              {!collapsed && 'Unpin'}
            </>
          ) : (
            <>
              <ChevronRight className={cn('h-4 w-4', !collapsed && 'mr-2')} />
              {!collapsed && 'Pin'}
            </>
          )}
        </Button>
      </div>
    </div>
    </>
  );
}

// Wrapper component with Suspense boundary for Next.js 15
export function Sidebar(props: SidebarProps) {
  return (
    <Suspense fallback={<div className="w-full h-full bg-card" />}>
      <SidebarContent {...props} />
    </Suspense>
  );
}

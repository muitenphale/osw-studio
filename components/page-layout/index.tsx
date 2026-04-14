'use client';

import React, { useState, useEffect } from 'react';
import { Project } from '@/lib/vfs/types';
import { Sidebar } from '@/components/sidebar';
import { AppHeader } from '@/components/ui/app-header';
import { Cloud, AlertTriangle, Database, X } from 'lucide-react';
import { SyncDialog } from '@/components/project-manager/sync-dialog';
import { cn, logger } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { getSyncOverviewStatus, setAutoSyncWorkspaceId } from '@/lib/vfs/auto-sync';
import { getSyncManager } from '@/lib/vfs/sync-manager';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PageLayoutProps {
  children: React.ReactNode;
  currentView: string;
  workspaceId?: string;
  onNavigate: (view: string) => void;
  onProjectSelect: (project: Project) => void;
  onStartTour?: () => void;
  onOpenAbout?: () => void;
  onOpenSettings?: () => void;
  showSidebar?: boolean; // false when in Workspace
}

export function PageLayout({
  children,
  currentView,
  workspaceId,
  onNavigate,
  onProjectSelect,
  onStartTour,
  onOpenAbout,
  onOpenSettings,
  showSidebar = true,
}: PageLayoutProps) {
  const router = useRouter();
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [sidebarHovering, setSidebarHovering] = useState(false);
  const [, setSidebarCollapsed] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [initModalOpen, setInitModalOpen] = useState(false);
  const [localProjectCount, setLocalProjectCount] = useState(0);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [migratingViaRelogin, setMigratingViaRelogin] = useState(false);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);

  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';
  const INIT_DISMISSED_KEY = 'osw-server-init-dismissed';

  // Set workspace context for auto-sync and sync-manager,
  // then check server initialization status
  useEffect(() => {
    if (workspaceId) {
      setAutoSyncWorkspaceId(workspaceId);
      getSyncManager(workspaceId);
    }

    if (!isServerMode || !showSidebar || !workspaceId) return;

    const dismissed = localStorage.getItem(INIT_DISMISSED_KEY);
    if (dismissed === 'true') return;

    async function checkServerInit() {
      try {
        const status = await getSyncOverviewStatus();
        setLocalProjectCount(status.localProjectCount);

        if (status.isUninitialized && status.localProjectCount > 0) {
          setInitModalOpen(true);
        }
      } catch (error) {
        logger.error('Failed to check server initialization:', error);
      }
    }
    checkServerInit();

    async function checkQuota() {
      try {
        const res = await fetch(`/api/w/${workspaceId}/sync/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.quota?.storage) {
          const pct = Math.round((data.quota.storage.usedMb / data.quota.storage.maxMb) * 100);
          if (pct >= 80) {
            setQuotaWarning(`You have used ${pct}% of your workspace storage (${data.quota.storage.usedMb} MB / ${data.quota.storage.maxMb} MB)`);
          } else {
            setQuotaWarning(null);
          }
        }
      } catch {}
    }
    checkQuota();
  }, [workspaceId, isServerMode, showSidebar]);

  // Check if this is a migration scenario (legacy data exists but workspace is empty)
  useEffect(() => {
    if (!initModalOpen || !isServerMode) return;

    async function checkMigration() {
      try {
        // If the workspace is empty but there's a legacy DB, this needs migration via re-login
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setNeedsMigration(true);
          }
        }
      } catch {}
    }
    checkMigration();
  }, [initModalOpen, isServerMode]);

  const handleDismissInitModal = () => {
    localStorage.setItem(INIT_DISMISSED_KEY, 'true');
    setInitModalOpen(false);
  };

  const handleOpenSyncFromInit = () => {
    setInitModalOpen(false);
    setSyncDialogOpen(true);
  };

  const handleMigrationRelogin = async () => {
    setMigratingViaRelogin(true);
    try {
      // Delete the workspace DB files so migration runs fresh on next login
      if (workspaceId) {
        await fetch(`/api/admin/workspaces/${workspaceId}/repair`, { method: 'POST' });
      }
      // Log out — on re-login, ensureDefaultWorkspace will migrate legacy data
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/admin/login');
    } catch {
      setMigratingViaRelogin(false);
    }
  };

  // When in Workspace, don't show sidebar or header
  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="relative flex h-full overflow-hidden">
      <Sidebar
        currentView={currentView}
        workspaceId={workspaceId}
        onNavigate={onNavigate}
        onProjectSelect={onProjectSelect}
        onStartTour={onStartTour}
        onOpenAbout={onOpenAbout}
        onOpenSettings={onOpenSettings}
        onServerSync={() => setSyncDialogOpen(true)}
        onLogoClick={() => router.push(workspaceId ? `/w/${workspaceId}/projects` : '/admin')}
        onPinnedChange={setSidebarPinned}
        onHoverChange={setSidebarHovering}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
      />

      {/* Backdrop when sidebar is unpinned and hovering */}
      {!sidebarPinned && sidebarHovering && (
        <div className="absolute inset-0 bg-black/20 z-30" />
      )}

      <div
        className={cn(
          "flex-1 flex flex-col overflow-hidden transition-all duration-300",
          // On mobile, no margin (sidebar is overlay). On desktop, apply margin when unpinned
          !sidebarPinned && "md:ml-[56px]"
        )}
      >
        {/* Header - mobile only (logo + page name + hamburger) */}
        <AppHeader
          hideLogo={true}
          showMobileMenu={true}
          onMobileMenuClick={() => setMobileSidebarOpen(true)}
          hideActionsOnMobile={true}
          pageName={currentView.charAt(0).toUpperCase() + currentView.slice(1)}
          className="md:hidden"
        />
        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {quotaWarning && (
            <div className="bg-orange-500/10 border-b border-orange-500/20 px-4 py-2 text-sm text-orange-400 flex items-center justify-between">
              <span>{quotaWarning}</span>
              <button
                onClick={() => setQuotaWarning(null)}
                className="text-orange-400/60 hover:text-orange-400 ml-4 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>

      {/* Sync Dialog */}
      <SyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
      />

      {/* First-Time Server Initialization Modal */}
      <Dialog open={initModalOpen} onOpenChange={setInitModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              {needsMigration ? 'Workspace Setup Required' : 'Server Database Not Initialized'}
            </DialogTitle>
            <DialogDescription>
              {needsMigration
                ? 'Your workspace needs to be initialized with your existing data. A quick re-login will set everything up automatically.'
                : `Your server database is empty, but you have ${localProjectCount} project${localProjectCount !== 1 ? 's' : ''} stored locally.`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <Database className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                {needsMigration ? (
                  <>
                    <p className="font-medium">What happens?</p>
                    <p className="text-muted-foreground mt-1">
                      You&apos;ll be briefly logged out. On login, your existing projects, deployments, and settings will be migrated to your workspace automatically.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Why does this matter?</p>
                    <p className="text-muted-foreground mt-1">
                      The <strong>Deployments</strong> feature requires projects to be synced to the server database.
                      Until you push your local projects, the Deployments view won&apos;t show any projects to publish.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleDismissInitModal}
            >
              Dismiss
            </Button>
            {needsMigration ? (
              <Button
                onClick={handleMigrationRelogin}
                disabled={migratingViaRelogin}
              >
                {migratingViaRelogin ? 'Setting up...' : 'Set Up Workspace'}
              </Button>
            ) : (
              <Button
                onClick={handleOpenSyncFromInit}
              >
                <Cloud className="w-4 h-4 mr-2" />
                Open Sync
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

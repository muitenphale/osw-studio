'use client';

import React, { useState, useEffect } from 'react';
import { Project } from '@/lib/vfs/types';
import { Sidebar } from '@/components/sidebar';
import { AppHeader } from '@/components/ui/app-header';
import { Cloud, AlertTriangle, Database } from 'lucide-react';
import { SyncDialog } from '@/components/project-manager/sync-dialog';
import { cn, logger } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { getSyncOverviewStatus } from '@/lib/vfs/auto-sync';
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

  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';
  const INIT_DISMISSED_KEY = 'osw-server-init-dismissed';

  // Check if server needs initialization on mount (Server Mode only)
  useEffect(() => {
    if (!isServerMode || !showSidebar) return;

    // Check if user has already dismissed this modal
    const dismissed = localStorage.getItem(INIT_DISMISSED_KEY);
    if (dismissed === 'true') return;

    async function checkServerInit() {
      try {
        const status = await getSyncOverviewStatus();
        setLocalProjectCount(status.localProjectCount);

        // Show modal if server is uninitialized but local has projects
        if (status.isUninitialized && status.localProjectCount > 0) {
          setInitModalOpen(true);
        }
      } catch (error) {
        logger.error('Failed to check server initialization:', error);
      }
    }
    checkServerInit();
  }, [isServerMode, showSidebar]);

  const handleDismissInitModal = () => {
    localStorage.setItem(INIT_DISMISSED_KEY, 'true');
    setInitModalOpen(false);
  };

  const handleOpenSyncFromInit = () => {
    setInitModalOpen(false);
    setSyncDialogOpen(true);
  };

  // When in Workspace, don't show sidebar or header
  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="relative flex h-screen overflow-hidden">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        onProjectSelect={onProjectSelect}
        onStartTour={onStartTour}
        onOpenAbout={onOpenAbout}
        onOpenSettings={onOpenSettings}
        onServerSync={() => setSyncDialogOpen(true)}
        onLogoClick={() => router.push('/admin')}
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
              Server Database Not Initialized
            </DialogTitle>
            <DialogDescription>
              Your server database is empty, but you have {localProjectCount} project{localProjectCount !== 1 ? 's' : ''} stored locally.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <Database className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Why does this matter?</p>
                <p className="text-muted-foreground mt-1">
                  The <strong>Deployments</strong> feature requires projects to be synced to the server database.
                  Until you push your local projects, the Deployments view won&apos;t show any projects to publish.
                </p>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Click <strong>Open Sync</strong> to push your local projects to the server, or dismiss this message to configure it later.
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleDismissInitModal}
            >
              Dismiss
            </Button>
            <Button
              onClick={handleOpenSyncFromInit}
            >
              <Cloud className="w-4 h-4 mr-2" />
              Open Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

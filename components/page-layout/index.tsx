'use client';

import React, { useState } from 'react';
import { Project } from '@/lib/vfs/types';
import { Sidebar, COLLAPSED_SIDEBAR_WIDTH } from '@/components/sidebar';
import { AppHeader } from '@/components/ui/app-header';
import { Settings, Cloud } from 'lucide-react';
import { SyncDialog } from '@/components/project-manager/sync-dialog';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
        onSyncComplete={() => {
          // Optionally reload data after sync
          setSyncDialogOpen(false);
        }}
      />
    </div>
  );
}

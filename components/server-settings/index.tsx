'use client';

import React from 'react';
import { Deployment } from '@/lib/vfs/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatabaseManager } from '@/components/database-manager';

interface ServerSettingsModalProps {
  deployment: Deployment;
  isOpen: boolean;
  onClose: () => void;
}

export function ServerSettingsModal({ deployment, isOpen, onClose }: ServerSettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Server Settings</DialogTitle>
          <DialogDescription>
            Manage database, edge functions, and secrets for {deployment.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <DatabaseManager deploymentId={deployment.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

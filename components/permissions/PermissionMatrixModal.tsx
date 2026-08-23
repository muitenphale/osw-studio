'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PermissionMatrix } from './PermissionMatrix';

interface PermissionMatrixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange?: () => void;
}

export function PermissionMatrixModal({
  open,
  onOpenChange,
  onModeChange,
}: PermissionMatrixModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lg:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customize permissions (Custom mode)</DialogTitle>
        </DialogHeader>
        <PermissionMatrix onModeChange={onModeChange} />
      </DialogContent>
    </Dialog>
  );
}

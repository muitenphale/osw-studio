'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Download, Upload, Info } from 'lucide-react';
import { BackupService } from '@/lib/vfs/backup-service';
import { track } from '@/lib/telemetry';
import { configManager } from '@/lib/config/storage';
import { AboutModal } from '@/components/about-modal';

export function DataPane() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState('');
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  const handleExportData = async () => {
    try {
      setIsExporting(true);
      await BackupService.exportAllData();
      toast.success('Data exported successfully!');
      track('project_export', { format: 'osws' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.osws';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        setIsImporting(true);
        setImportProgress(0);
        setImportMessage('Validating file...');

        const validation = await BackupService.validateBackupFile(file);
        if (!validation.valid) {
          toast.error(`Invalid backup file: ${validation.reason}`);
          return;
        }

        const shouldReplace = confirm(
          `Import ${validation.metadata?.projectCount || 0} projects?\n\n` +
          'Choose OK to REPLACE all current data, or Cancel to MERGE with existing data.'
        );

        await BackupService.importAllData(file, {
          mode: shouldReplace ? 'replace' : 'merge',
          onProgress: (progress, message) => {
            setImportProgress(progress);
            setImportMessage(message);
          }
        });

        toast.success('Data imported successfully!');
        track('project_import', { format: 'osws' });
        setTimeout(() => window.location.reload(), 1000);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Import failed');
      } finally {
        setIsImporting(false);
        setImportProgress(0);
        setImportMessage('');
      }
    };
    input.click();
  };

  const clearSettings = () => {
    if (confirm('Are you sure you want to clear all settings?')) {
      configManager.clearSettings();
      toast.success('Settings cleared');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Backup and restore your projects, conversations, and settings.
      </p>

      {/* Export Data */}
      <div className="flex items-center gap-3 p-3 rounded-lg border">
        <Download className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Export All Data</div>
          <div className="text-xs text-muted-foreground">
            Download a backup of all projects and data
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportData}
          disabled={isExporting}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </div>

      {/* Import Data */}
      <div className="flex items-center gap-3 p-3 rounded-lg border">
        <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Import Data</div>
          <div className="text-xs text-muted-foreground">
            Restore from a .osws backup file
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleImportData}
          disabled={isImporting}
        >
          {isImporting ? 'Importing...' : 'Import'}
        </Button>
      </div>

      {/* Import Progress */}
      {isImporting && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>{importMessage}</span>
            <span>{importProgress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${importProgress}%` }}
            />
          </div>
        </div>
      )}

      <hr className="border-border" />

      {/* Clear Settings + About */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={clearSettings}
        >
          Clear All Settings
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAboutModalOpen(true)}
        >
          <Info className="mr-1.5 h-3.5 w-3.5" />
          About OSW Studio
        </Button>
      </div>

      <AboutModal
        open={aboutModalOpen}
        onOpenChange={setAboutModalOpen}
      />
    </div>
  );
}

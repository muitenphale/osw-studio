'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Globe, Cloud, FileArchive, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { vfs } from '@/lib/vfs';
import { configManager } from '@/lib/config/storage';
import { detectDeploymentType } from '@/lib/telemetry/config';
import { checkHFCapabilities, loginHF } from '@/lib/auth/hf-auth';
import { HFSpaceTarget } from './hf-space-target';
import { requestDeploymentFor } from '@/lib/deployments/pending-create';

interface DeployDialogProps {
  open: boolean;
  projectId: string;
  onOpenChange: (o: boolean) => void;
}

type Target = 'hf' | 'osws' | 'zip';

const DEPLOY_DOC = '/?doc=deploying-sites';

export function DeployDialog({ open, projectId, onOpenChange }: DeployDialogProps) {
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';
  const isHFSpace = detectDeploymentType() === 'hf_space';
  const hfConnected = !!configManager.getHFAuth()?.access_token;

  // ZIP export is always available (works in every mode and for every runtime), so it's the
  // universal fallback default; prefer a managed target where one is usable.
  const [target, setTarget] = useState<Target>(
    isServerMode ? 'osws' : hfConnected ? 'hf' : 'zip',
  );
  const [zipExporting, setZipExporting] = useState(false);

  const close = () => onOpenChange(false);

  async function handleDownloadZip() {
    setZipExporting(true);
    try {
      await vfs.init();
      const proj = await vfs.getProject(projectId);
      const blob = await vfs.exportProjectAsZip(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(proj?.name || 'project').replace(/\s+/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to export ZIP');
    } finally {
      setZipExporting(false);
    }
  }

  // Enable path for the HuggingFace target when not connected.
  async function connectHuggingFace() {
    if (isHFSpace) {
      try {
        sessionStorage.setItem('hf_oauth_return_project', projectId);
        sessionStorage.setItem('hf_oauth_resume_deploy', projectId);
      } catch {}
      const caps = await checkHFCapabilities();
      if (caps.oauthAvailable && caps.clientId) {
        await loginHF(caps.clientId, caps.scopes);
        return;
      }
    }
    // Off an HF Space (or no OAuth configured): send them to Settings to paste a token.
    window.dispatchEvent(new CustomEvent('nav-to-view', { detail: { view: 'settings' } }));
    close();
  }

  const goToDeployments = () => {
    // Carry the project across. Without it Deployments opens on a list and the deployment has to be
    // pointed at a project by hand, which is how a deployment ends up serving one you did not mean.
    requestDeploymentFor(projectId);
    window.dispatchEvent(new CustomEvent('nav-to-view', { detail: { view: 'deployments' } }));
    close();
  };

  const learnMore = () => window.open(DEPLOY_DOC, '_blank', 'noopener,noreferrer');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Deploy</DialogTitle>
          <DialogDescription>Choose where to deploy this project.</DialogDescription>
        </DialogHeader>

        {/* Target picker */}
        <div className="grid gap-2 py-2">
          {/* HuggingFace Space */}
          <TargetRow
            icon={<Globe className="h-4 w-4" />}
            title="Hugging Face Space"
            subtitle="Publish as a static Space under your HuggingFace account."
            enabled={hfConnected}
            selected={target === 'hf'}
            onSelect={() => setTarget('hf')}
            onLearnMore={learnMore}
            disabledContent={
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Connect HuggingFace to deploy here.
                </span>
                <Button size="sm" variant="outline" onClick={connectHuggingFace}>
                  {isHFSpace ? 'Sign in with HuggingFace' : 'Connect in Settings'}
                </Button>
              </div>
            }
          />

          {/* OSW Studio instance */}
          <TargetRow
            icon={<Cloud className="h-4 w-4" />}
            title="Open Source Web Studio"
            subtitle="Publish to this OSW Studio instance and manage it in Deployments."
            enabled={isServerMode}
            selected={target === 'osws'}
            onSelect={() => setTarget('osws')}
            onLearnMore={learnMore}
            disabledContent={
              <span className="text-xs text-muted-foreground">Available in Server Mode.</span>
            }
          />

          {/* ZIP export — always available, every runtime */}
          <TargetRow
            icon={<FileArchive className="h-4 w-4" />}
            title="Download as ZIP"
            subtitle="Export the project to host anywhere (Netlify, GitHub Pages, Vercel, …)."
            enabled
            selected={target === 'zip'}
            onSelect={() => setTarget('zip')}
            onLearnMore={learnMore}
            disabledContent={null}
          />
        </div>

        {/* Selected target body */}
        {target === 'hf' && hfConnected ? (
          <HFSpaceTarget projectId={projectId} onClose={close} />
        ) : target === 'osws' && isServerMode ? (
          <>
            <div className="py-4 text-sm text-muted-foreground">
              Deployments publish this project to this instance, each with its own settings, custom
              domain and analytics. This opens Deployments with a new one started for this project;
              you enable and publish it there.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button onClick={goToDeployments}>Create a deployment</Button>
            </DialogFooter>
          </>
        ) : target === 'zip' ? (
          <>
            <div className="py-4 text-sm text-muted-foreground">
              Downloads the compiled project as a ZIP you can upload to any static host. Works for
              every project type.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button onClick={handleDownloadZip} disabled={zipExporting}>
                {zipExporting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting…</>
                ) : (
                  'Download ZIP'
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TargetRow({
  icon,
  title,
  subtitle,
  enabled,
  selected,
  onSelect,
  onLearnMore,
  disabledContent,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  enabled: boolean;
  selected: boolean;
  onSelect: () => void;
  onLearnMore: () => void;
  disabledContent: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        !enabled
          ? 'border-border bg-muted/30'
          : selected
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:bg-accent/50 cursor-pointer'
      }`}
      onClick={enabled && !selected ? onSelect : undefined}
      role={enabled ? 'button' : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-2 text-sm font-medium ${enabled ? '' : 'text-muted-foreground'}`}>
          {icon}
          {title}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLearnMore();
          }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Learn more <ExternalLink className="h-3 w-3" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      {!enabled && <div className="mt-2">{disabledContent}</div>}
    </div>
  );
}

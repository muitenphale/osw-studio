'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { setTelemetryOptIn, track } from '@/lib/telemetry';

interface TelemetryDisclosureProps {
  open: boolean;
  onDismiss: () => void;
}

export function TelemetryDisclosure({ open, onDismiss }: TelemetryDisclosureProps) {
  const handleDisable = () => {
    setTelemetryOptIn(false);
    onDismiss();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anonymous Usage Analytics</DialogTitle>
          <DialogDescription>
            Open Source Web Studio collects anonymous usage analytics to help improve the app
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p className="text-sm">
            Built with{' '}
            <a
              href="https://github.com/o-stahl/osw-analytics"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-orange-500/20 text-orange-400 hover:text-orange-300 px-1 py-0.5 rounded no-underline"
            >
              osw-analytics
            </a>
            , an open-source approach to analytics.
          </p>

          <Collapsible>
            <div className="rounded-lg bg-muted/50">
              <CollapsibleTrigger className="flex items-center gap-1.5 w-full p-3 text-xs text-foreground hover:text-foreground transition-colors group">
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                Details
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-3 text-sm text-muted-foreground">
                  <div>
                    <p className="font-bold text-foreground mb-1.5">What will <span className="text-orange-400 uppercase">not</span> be collected:</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      <li>Your prompts or messages</li>
                      <li>Code, file names, or file contents</li>
                      <li>API keys or credentials</li>
                      <li>Inference completions</li>
                      <li>Error messages</li>
                      <li>Anything that could identify you</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-bold text-foreground mb-1.5">What will be collected:</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      <li>Which views are visited (e.g. dashboard, workspace, settings)</li>
                      <li>Which AI providers and models are selected</li>
                      <li>Whether tasks succeed or fail (not what was asked)</li>
                      <li>Which tools the AI uses and whether they work</li>
                      <li>API error types (not error messages)</li>
                      <li>Session heartbeats (how long the app is open)</li>
                      <li>A randomly generated ID stored in your browser to count unique visitors</li>
                    </ul>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <button
            type="button"
            className="text-xs text-muted-foreground underline hover:text-foreground"
            onClick={handleDisable}
          >
            Disable analytics
          </button>
          <Button onClick={() => { track('telemetry_accepted'); onDismiss(); }}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@/lib/stores/workspace';
import { Project } from '@/lib/vfs/types';
import type { DebugEvent } from '@/lib/stores/types';
import { ChevronDown } from 'lucide-react';

interface GenerationShelfProps {
  selectedProject: Project | null;
  onNavigateToProject: (project: { id: string; name: string }) => void;
}

interface ActivityItem {
  verb: string;
  target: string;
  status: 'executing' | 'completed' | 'failed';
}

function parseShellAction(argsJson: string, status: string): { verb: string; target: string } | null {
  try {
    const args = JSON.parse(argsJson);
    const cmd = (args.cmd || '').trim();
    if (!cmd) return null;

    const isRunning = status === 'executing';

    if (/^cat\s+>/.test(cmd) || /<<\s*'?EOF/.test(cmd)) {
      const match = cmd.match(/^cat\s+>\s*(\S+)/) || cmd.match(/>\s*(\S+)\s*<</);
      const file = match?.[1] || 'file';
      return { verb: isRunning ? 'Writing' : 'Wrote', target: file };
    }

    if (/^(cat|head|tail|nl)\s+/.test(cmd) && !/>/.test(cmd)) {
      const parts = cmd.split(/\s+/);
      const file = parts[parts.length - 1];
      return { verb: isRunning ? 'Reading' : 'Read', target: file };
    }

    if (/^(sed|ss)\s+/.test(cmd)) {
      const match = cmd.match(/\s(\S+)\s*$/);
      const file = match?.[1] || 'file';
      return { verb: isRunning ? 'Editing' : 'Edited', target: file };
    }

    if (/^(ls|tree|find)\s*/.test(cmd)) {
      return { verb: isRunning ? 'Listing' : 'Listed', target: cmd.split(/\s+/)[1] || '/' };
    }

    if (/^(grep|rg)\s+/.test(cmd)) {
      return { verb: isRunning ? 'Searching' : 'Searched', target: cmd.split(/\s+/).slice(1, 3).join(' ') };
    }

    if (/^mkdir\s+/.test(cmd)) {
      const dir = cmd.replace(/^mkdir\s+(-p\s+)?/, '').split(/\s+/)[0];
      return { verb: isRunning ? 'Creating' : 'Created', target: dir };
    }

    if (/^(rm|rmdir)\s+/.test(cmd)) {
      const target = cmd.split(/\s+/).pop() || '';
      return { verb: isRunning ? 'Removing' : 'Removed', target };
    }

    if (/^(mv|cp)\s+/.test(cmd)) {
      const parts = cmd.split(/\s+/);
      return { verb: cmd.startsWith('mv') ? (isRunning ? 'Moving' : 'Moved') : (isRunning ? 'Copying' : 'Copied'), target: parts[parts.length - 1] || '' };
    }

    if (/^status\s+/.test(cmd)) {
      return { verb: isRunning ? 'Evaluating' : 'Evaluated', target: 'progress' };
    }

    if (/^delegate\s+/.test(cmd)) {
      const type = cmd.split(/\s+/)[1] || 'agent';
      return { verb: isRunning ? 'Delegating' : 'Delegated', target: type };
    }

    const firstWord = cmd.split(/\s+/)[0];
    return { verb: isRunning ? 'Running' : 'Ran', target: firstWord };
  } catch {
    return null;
  }
}

function deriveActivity(events: DebugEvent[], since: number | null): { items: ActivityItem[]; total: number } {
  const all: ActivityItem[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (since && e.timestamp < since) break;
    if (e.event !== 'tool_status') continue;
    const { status, args } = e.data || {};
    if (status !== 'executing' && status !== 'completed' && status !== 'failed') continue;
    const action = parseShellAction(args || '{}', status);
    if (!action) continue;
    all.unshift({ verb: action.verb, target: action.target, status });
  }
  return { items: all.slice(-5), total: all.length };
}

function deriveUsage(events: DebugEvent[]): { tokens: number; cost: number } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event === 'usage') {
      const d = events[i].data;
      const tokens = d?.totalUsage?.totalTokens ?? 0;
      const cost = d?.totalCost ?? 0;
      if (tokens > 0) return { tokens, cost };
    }
  }
  return null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function formatElapsed(startedAt: number): string {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function GenerationShelf({ selectedProject, onNavigateToProject }: GenerationShelfProps) {
  const [expanded, setExpanded] = useState(false);
  const [, setTick] = useState(0);

  const generating = useWorkspaceStore(s => s.generating);
  const generatingProjectId = useWorkspaceStore(s => s.generatingProjectId);
  const generatingProjectName = useWorkspaceStore(s => s.generatingProjectName);
  const generatingPrompt = useWorkspaceStore(s => s.generatingPrompt);
  const generationResult = useWorkspaceStore(s => s.generationResult);
  const generationStartedAt = useWorkspaceStore(s => s.generationStartedAt);
  const currentModel = useWorkspaceStore(s => s.currentModel);

  const isActive = generating && !!generatingProjectId;
  const hasResult = !generating && !!generationResult && !!generatingProjectId;
  const shouldShow = isActive || hasResult;
  const viewingGeneratingProject = selectedProject?.id === generatingProjectId;

  // Poll for updates — background events aren't in the reactive store, so we
  // re-derive activity on a short interval while the shelf is visible.
  useEffect(() => {
    if (!shouldShow || viewingGeneratingProject) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [shouldShow, viewingGeneratingProject]);

  // Imperative read — backgroundEvents aren't in the reactive store, so the
  // 1-second polling interval above triggers re-renders that re-read this.
  const genEvents = useWorkspaceStore.getState().getGenerationEvents();
  const { items: activity, total: totalActions } = deriveActivity(genEvents, generationStartedAt);
  const usage = deriveUsage(genEvents);

  const latestAction = activity.length > 0 ? activity[activity.length - 1] : null;

  if (!shouldShow || viewingGeneratingProject) return null;

  const handleNavigate = () => {
    if (generatingProjectId && generatingProjectName) {
      onNavigateToProject({ id: generatingProjectId, name: generatingProjectName });
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    useWorkspaceStore.getState().dismissGenerationResult();
  };

  const dotColor = generationResult === 'completed' ? 'bg-green-500' :
    generationResult === 'failed' ? 'bg-destructive' : 'bg-orange-400';

  const verbColor = generationResult === 'completed' ? 'text-green-500' :
    generationResult === 'failed' ? 'text-destructive' : 'text-orange-400';

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[380px] rounded-xl border border-border bg-card shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden">

      {/* Collapsed bar — always visible */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${isActive ? 'animate-pulse' : ''}`} />
        <span className="text-[13px] font-semibold text-foreground whitespace-nowrap font-mono">{generatingProjectName}</span>
        {isActive && generationStartedAt && (
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {formatElapsed(generationStartedAt)}
          </span>
        )}
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {generationResult === 'completed' && <><span className={verbColor}>Done</span>{usage ? ` ${totalActions} actions · $${usage.cost.toFixed(4)}` : ''}</>}
          {generationResult === 'failed' && <span className={verbColor}>Error</span>}
          {isActive && latestAction && <><span className={verbColor}>{latestAction.verb}</span> {latestAction.target}</>}
          {isActive && !latestAction && <span className={verbColor}>Starting…</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-300 ${expanded ? '' : 'rotate-180'}`} />
      </div>

      {/* Expanded content */}
      <div
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: expanded ? 400 : 0 }}
      >
        <div className="px-3.5 pb-3.5">
          <div className="h-px bg-border mb-3" />

          {/* Meta tags */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            {currentModel && (
              <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {currentModel}
              </span>
            )}
            {usage && (
              <>
                <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {formatTokens(usage.tokens)} tokens
                </span>
                <span className="text-[11px] font-mono text-blue-400 bg-muted px-2 py-0.5 rounded">
                  ${usage.cost.toFixed(4)}
                </span>
              </>
            )}
          </div>

          {/* Prompt */}
          {generatingPrompt && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Prompt</div>
              <p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">{generatingPrompt}</p>
            </div>
          )}

          {/* Activity log */}
          {activity.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Activity</div>
              <div className="flex flex-col gap-0.5">
                {totalActions > activity.length && (
                  <div className="text-[11px] text-muted-foreground/40 font-mono py-0.5">+ {totalActions - activity.length} earlier actions</div>
                )}
                {activity.map((item, i) => {
                  const isCurrent = i === activity.length - 1 && isActive && item.status === 'executing';
                  return (
                    <div key={i} className={`flex items-center gap-2 py-0.5 font-mono text-xs ${isCurrent ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                      <span className={`shrink-0 ${isCurrent ? verbColor : ''}`}>{item.verb}</span>
                      <span className="truncate">{item.target}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {hasResult ? (
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg border border-border text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                onClick={handleNavigate}
              >
                Open project
              </button>
              <button
                className="px-3 py-2 rounded-lg border border-border text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                onClick={handleDismiss}
              >
                Dismiss
              </button>
            </div>
          ) : (
            <button
              className="w-full py-2 rounded-lg border border-border text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={handleNavigate}
            >
              Open project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

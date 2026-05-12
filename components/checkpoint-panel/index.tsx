'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, RotateCcw, ArrowRight, Inbox } from 'lucide-react';
import { PanelContainer, PanelHeader } from '@/components/ui/panel';
import { checkpointManager, CheckpointMetadata } from '@/lib/vfs/checkpoint';
import { formatDistanceToNow } from 'date-fns';
import { DebugEvent } from '@/components/debug-panel';

interface CheckpointPanelProps {
  projectId: string;
  events: DebugEvent[];
  currentCheckpointId?: string;
  onRestore: (checkpointId: string, description?: string) => void;
  onScrollToTurn: (checkpointId: string) => void;
  onClose?: () => void;
  refreshKey?: number;
}

export function CheckpointPanel({
  projectId,
  events,
  currentCheckpointId,
  onRestore,
  onScrollToTurn,
  onClose,
  refreshKey
}: CheckpointPanelProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointMetadata[]>([]);

  // Build set of checkpoint IDs that have linked turns in the current session
  const linkedCheckpointIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of events) {
      if (event.event === 'checkpoint_created' && event.data?.checkpointId) {
        ids.add(event.data.checkpointId);
      }
    }
    return ids;
  }, [events]);

  // Load checkpoints on mount and when events change (new checkpoints may have been created)
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const cps = await checkpointManager.getCheckpoints(projectId);
      if (!cancelled) {
        setCheckpoints(cps);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [projectId, events.length, refreshKey]);

  return (
    <PanelContainer>
      <PanelHeader icon={History} title="Checkpoints" color="var(--button-checkpoint-active)" onClose={onClose} panelKey="checkpoints" />

      {/* Checkpoint list */}
      <div className="flex-1 overflow-y-auto">
        {checkpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-4">
            <Inbox className="h-8 w-8 opacity-40" />
            <span className="text-xs text-center">No checkpoints yet. Checkpoints are created automatically when the AI makes changes.</span>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {checkpoints.map((cp) => {
              const isCurrent = cp.id === currentCheckpointId;
              const hasLinkedTurn = linkedCheckpointIds.has(cp.id);

              return (
                <div
                  key={cp.id}
                  className={`rounded-md border px-2.5 py-2 text-xs transition-colors ${
                    isCurrent
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/60 bg-card hover:bg-muted/30'
                  }`}
                >
                  {/* Top row: badge + timestamp */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <Badge
                      variant={cp.kind === 'manual' ? 'default' : 'secondary'}
                      className="text-[9px] px-1.5 py-0 h-4 leading-none"
                    >
                      {cp.kind === 'manual' ? 'save' : cp.kind}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                      {formatDistanceToNow(new Date(cp.timestamp), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-foreground/80 truncate leading-snug mb-1.5">
                    {cp.description}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {hasLinkedTurn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => onScrollToTurn(cp.id)}
                      >
                        <ArrowRight className="h-3 w-3 mr-0.5" />
                        Jump
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground ml-auto"
                      onClick={() => onRestore(cp.id, cp.description)}
                    >
                      <RotateCcw className="h-3 w-3 mr-0.5" />
                      Restore
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PanelContainer>
  );
}

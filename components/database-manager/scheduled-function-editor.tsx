'use client';

import React, { useState, useEffect } from 'react';
import { ScheduledFunction, EdgeFunction } from '@/lib/vfs/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertCircle, Info } from 'lucide-react';

interface ScheduledFunctionEditorProps {
  scheduledFunction: ScheduledFunction | null;
  edgeFunctions: EdgeFunction[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<ScheduledFunction>) => Promise<void>;
}

export function ScheduledFunctionEditor({
  scheduledFunction: fn,
  edgeFunctions,
  isOpen,
  onClose,
  onSave,
}: ScheduledFunctionEditorProps) {
  const [name, setName] = useState(fn?.name || '');
  const [functionId, setFunctionId] = useState(fn?.functionId || '');
  const [cronExpression, setCronExpression] = useState(fn?.cronExpression || '');
  const [timezone, setTimezone] = useState(fn?.timezone || 'UTC');
  const [description, setDescription] = useState(fn?.description || '');
  const [config, setConfig] = useState(fn?.config ? JSON.stringify(fn.config, null, 2) : '{}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(fn?.name || '');
      setFunctionId(fn?.functionId || '');
      setCronExpression(fn?.cronExpression || '');
      setTimezone(fn?.timezone || 'UTC');
      setDescription(fn?.description || '');
      setConfig(fn?.config ? JSON.stringify(fn.config, null, 2) : '{}');
      setError(null);
    }
  }, [fn, isOpen]);

  const handleSave = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
      setError('Name must be lowercase letters, numbers, and hyphens only');
      return;
    }
    if (!functionId) {
      setError('Edge function selection is required');
      return;
    }
    if (!cronExpression.trim()) {
      setError('Cron expression is required');
      return;
    }

    let parsedConfig: Record<string, unknown> = {};
    if (config.trim()) {
      try {
        const parsed = JSON.parse(config);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setError('Config must be a JSON object');
          return;
        }
        parsedConfig = parsed;
      } catch {
        setError('Config must be valid JSON');
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        functionId,
        cronExpression: cronExpression.trim(),
        timezone: timezone.trim() || 'UTC',
        description: description.trim() || undefined,
        config: parsedConfig,
        enabled: fn?.enabled ?? true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scheduled function');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {fn ? 'Edit Schedule' : 'Create Schedule'}
          </DialogTitle>
          <DialogDescription>
            Run an edge function on a cron schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="sched-name">Name</Label>
            <Input
              id="sched-name"
              value={name}
              onChange={e => setName(e.target.value.toLowerCase())}
              placeholder="daily-report"
              disabled={!!fn}
            />
          </div>

          {/* Edge Function */}
          <div className="space-y-2">
            <Label htmlFor="sched-function">Edge Function</Label>
            <Select value={functionId} onValueChange={setFunctionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a function..." />
              </SelectTrigger>
              <SelectContent>
                {edgeFunctions.map(ef => (
                  <SelectItem key={ef.id} value={ef.id}>
                    {ef.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {edgeFunctions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No edge functions available. Create one in the Functions tab first.
              </p>
            )}
          </div>

          {/* Cron Expression */}
          <div className="space-y-2">
            <Label htmlFor="sched-cron">Cron Expression</Label>
            <Input
              id="sched-cron"
              value={cronExpression}
              onChange={e => setCronExpression(e.target.value)}
              placeholder="0 8 * * *"
              className="font-mono"
            />
          </div>

          {/* Timezone */}
          <div className="space-y-2">
            <Label htmlFor="sched-tz">Timezone</Label>
            <Input
              id="sched-tz"
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              placeholder="UTC"
            />
            <p className="text-xs text-muted-foreground">
              e.g. UTC, America/New_York, Europe/London
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="sched-desc">Description (optional)</Label>
            <Input
              id="sched-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this schedule do?"
            />
          </div>

          {/* Config */}
          <div className="space-y-2">
            <Label htmlFor="sched-config">Config JSON (optional)</Label>
            <Textarea
              id="sched-config"
              value={config}
              onChange={e => setConfig(e.target.value)}
              placeholder="{}"
              className="font-mono text-sm h-20"
            />
            <p className="text-xs text-muted-foreground">
              Custom data passed as the request body to the edge function.
            </p>
          </div>

          {/* Cron Reference */}
          <div className="bg-muted/30 border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Info className="h-4 w-4" />
              Cron Patterns <span className="font-normal text-muted-foreground">(minimum 5 min interval)</span>
            </div>
            <div className="grid gap-1 text-xs font-mono">
              <div><span className="text-muted-foreground">*/5 * * * *</span>  Every 5 minutes</div>
              <div><span className="text-muted-foreground">0 * * * *</span>    Every hour</div>
              <div><span className="text-muted-foreground">0 8 * * *</span>    Daily at 8am</div>
              <div><span className="text-muted-foreground">0 0 * * 1</span>    Every Monday at midnight</div>
              <div><span className="text-muted-foreground">0 0 1 * *</span>    First of every month</div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              fn ? 'Save Changes' : 'Create Schedule'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

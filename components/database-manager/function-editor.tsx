'use client';

import React, { useState, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { EdgeFunction } from '@/lib/vfs/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertCircle, Info } from 'lucide-react';
import { useTheme } from 'next-themes';

interface FunctionEditorProps {
  deploymentId: string;
  function: EdgeFunction | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<EdgeFunction>) => Promise<void>;
}

const DEFAULT_CODE = `// Access the request object
// request.method - HTTP method
// request.body - Parsed request body
// request.query - Query string parameters
// request.headers - Request headers

// Use the database
// db.query(sql, params) - Execute SELECT query
// db.run(sql, params) - Execute INSERT/UPDATE/DELETE
// db.all(sql, params) - Alias for query

// Return a response
// Response.json(data, status) - Return JSON
// Response.text(text, status) - Return text
// Response.error(message, status) - Return error

// Example: List items
const items = db.all('SELECT * FROM items LIMIT 10');
Response.json({ items });
`;

export function FunctionEditor({
  deploymentId,
  function: fn,
  isOpen,
  onClose,
  onSave,
}: FunctionEditorProps) {
  const [name, setName] = useState(fn?.name || '');
  const [description, setDescription] = useState(fn?.description || '');
  const [method, setMethod] = useState<EdgeFunction['method']>(fn?.method || 'ANY');
  const [code, setCode] = useState(fn?.code || DEFAULT_CODE);
  const [timeoutMs, setTimeoutMs] = useState(fn?.timeoutMs || 5000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setName(fn?.name || '');
      setDescription(fn?.description || '');
      setMethod(fn?.method || 'ANY');
      setCode(fn?.code || DEFAULT_CODE);
      setTimeoutMs(fn?.timeoutMs || 5000);
      setError(null);
    }
  }, [fn, isOpen]);

  const handleSave = async () => {
    setError(null);

    // Basic validation
    if (!name.trim()) {
      setError('Function name is required');
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
      setError('Name must be lowercase letters, numbers, and hyphens only');
      return;
    }
    if (!code.trim()) {
      setError('Function code is required');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        method,
        code,
        timeoutMs,
        enabled: fn?.enabled ?? true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save function');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {fn ? 'Edit Function' : 'Create Function'}
          </DialogTitle>
          <DialogDescription>
            Define an HTTP endpoint that can access your deployment database.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* Name & Method */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="name">Function Name</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value.toLowerCase())}
                placeholder="my-function"
                disabled={!!fn}
              />
              {deploymentId && (
                <p className="text-xs text-muted-foreground">
                  URL: /api/deployments/{deploymentId}/functions/<span className="font-mono">{name || 'name'}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="method">HTTP Method</Label>
              <Select value={method} onValueChange={v => setMethod(v as EdgeFunction['method'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">ANY</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this function do?"
            />
          </div>

          {/* Timeout */}
          <div className="space-y-2">
            <Label htmlFor="timeout">Timeout (seconds)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="timeout"
                type="number"
                min={1}
                max={30}
                value={timeoutMs / 1000}
                onChange={e => setTimeoutMs(Math.min(30, Math.max(1, parseInt(e.target.value) || 5)) * 1000)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">1-30 seconds</span>
            </div>
          </div>

          {/* Code Editor */}
          <div className="space-y-2">
            <Label>Function Code</Label>
            <div className="h-64 border rounded-lg overflow-hidden">
              <MonacoEditor
                language="javascript"
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                value={code}
                onChange={value => setCode(value || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                }}
              />
            </div>
          </div>

          {/* API Reference */}
          <div className="bg-muted/30 border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Info className="h-4 w-4" />
              Available APIs
            </div>
            <div className="grid gap-2 text-xs font-mono">
              <div><span className="text-blue-500">request</span>.method, .body, .query, .headers, .params, .path</div>
              <div><span className="text-green-500">db</span>.query(sql, params), .run(sql, params), .all(sql, params)</div>
              <div><span className="text-purple-500">Response</span>.json(data, status), .text(text, status), .error(msg, status)</div>
              <div><span className="text-yellow-500">fetch</span>(url, options) - External HTTP requests</div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4" />
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
              fn ? 'Save Changes' : 'Create Function'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

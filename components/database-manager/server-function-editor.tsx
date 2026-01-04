'use client';

import React, { useState, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { ServerFunction } from '@/lib/vfs/types';
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
import { Loader2, AlertCircle, Info } from 'lucide-react';
import { useTheme } from 'next-themes';

interface ServerFunctionEditorProps {
  function: ServerFunction | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<ServerFunction>) => Promise<void>;
}

const DEFAULT_CODE = `// Server functions receive arguments via the 'args' array
// and have access to 'db' and 'fetch'

// Example: Validate an API key
const [apiKey] = args;
if (!apiKey) {
  return { valid: false, error: 'No API key provided' };
}

const users = db.query(
  'SELECT id, name FROM users WHERE api_key = ?',
  [apiKey]
);

if (users.length === 0) {
  return { valid: false, error: 'Invalid API key' };
}

return { valid: true, user: users[0] };
`;

export function ServerFunctionEditor({
  function: fn,
  isOpen,
  onClose,
  onSave,
}: ServerFunctionEditorProps) {
  const [name, setName] = useState(fn?.name || '');
  const [description, setDescription] = useState(fn?.description || '');
  const [code, setCode] = useState(fn?.code || DEFAULT_CODE);
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
      setCode(fn?.code || DEFAULT_CODE);
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
    // Validate JS identifier (camelCase or snake_case)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      setError('Name must be a valid identifier (letters, numbers, underscores; cannot start with number)');
      return;
    }
    // Check reserved names
    const reserved = ['db', 'fetch', 'console', 'args', 'request', 'Response', 'server'];
    if (reserved.includes(name)) {
      setError(`"${name}" is reserved and cannot be used`);
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
        code,
        enabled: fn?.enabled ?? true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save server function');
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
            {fn ? 'Edit Server Function' : 'Create Server Function'}
          </DialogTitle>
          <DialogDescription>
            Define a reusable helper function that edge functions can call via server.{name || 'name'}(args).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Function Name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              placeholder="validateAuth"
              disabled={!!fn}
            />
            <p className="text-xs text-muted-foreground">
              Usage in edge functions: <span className="font-mono">server.{name || 'name'}(arg1, arg2, ...)</span>
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this helper do?"
            />
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
              Available in Server Functions
            </div>
            <div className="grid gap-2 text-xs font-mono">
              <div><span className="text-orange-500">args</span> - Array of arguments passed from edge function</div>
              <div><span className="text-green-500">db</span>.query(sql, params), .run(sql, params), .all(sql, params)</div>
              <div><span className="text-yellow-500">fetch</span>(url, options) - External HTTP requests</div>
              <div><span className="text-blue-500">console</span>.log(), .error(), .warn() - Logging</div>
            </div>
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                <strong>Note:</strong> Return a value to send data back to the calling edge function.
                Server functions are synchronous and share the timeout with the parent edge function.
              </p>
            </div>
          </div>

          {/* Example */}
          <div className="bg-muted/30 border rounded-lg p-4 space-y-2">
            <div className="text-sm font-medium">Example: Using in Edge Function</div>
            <pre className="text-xs font-mono bg-background p-2 rounded overflow-x-auto">
{`// Edge function code
const auth = server.${name || 'validateAuth'}(request.headers['x-api-key']);
if (!auth.valid) {
  Response.error(auth.error, 401);
  return;
}

// User is authenticated
const products = db.query('SELECT * FROM products WHERE user_id = ?', [auth.user.id]);
Response.json({ products });`}
            </pre>
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

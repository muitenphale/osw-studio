'use client';

import React, { useState, useEffect } from 'react';
import { Secret } from '@/lib/vfs/types';
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
import { Loader2, AlertCircle, Eye, EyeOff, Info } from 'lucide-react';

interface SecretEditorProps {
  secret: Secret | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; value?: string; description?: string }) => Promise<void>;
}

export function SecretEditor({
  secret,
  isOpen,
  onClose,
  onSave,
}: SecretEditorProps) {
  const [name, setName] = useState(secret?.name || '');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState(secret?.description || '');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(secret?.name || '');
      setValue('');
      setDescription(secret?.description || '');
      setShowValue(false);
      setError(null);
    }
  }, [secret, isOpen]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Convert to SCREAMING_SNAKE_CASE
    const newValue = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '')
      .replace(/^[0-9]+/, ''); // Remove leading numbers
    setName(newValue);
  };

  const handleSave = async () => {
    setError(null);

    // Basic validation
    if (!name.trim()) {
      setError('Secret name is required');
      return;
    }
    // Validate SCREAMING_SNAKE_CASE
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      setError('Name must be SCREAMING_SNAKE_CASE (uppercase letters, numbers, underscores; must start with letter)');
      return;
    }
    // Value required for new secrets
    if (!secret && !value.trim()) {
      setError('Secret value is required');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        value: value.trim() || undefined,
        description: description.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save secret');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {secret ? 'Edit Secret' : 'Create Secret'}
          </DialogTitle>
          <DialogDescription>
            Store sensitive values like API keys securely. Edge functions can access them via secrets.get('{name || 'NAME'}').
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Secret Name</Label>
            <Input
              id="name"
              value={name}
              onChange={handleNameChange}
              placeholder="STRIPE_API_KEY"
              disabled={!!secret}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Use SCREAMING_SNAKE_CASE (e.g., API_KEY, SENDGRID_TOKEN)
            </p>
          </div>

          {/* Value */}
          <div className="space-y-2">
            <Label htmlFor="value">
              {secret ? 'New Value (leave empty to keep current)' : 'Secret Value'}
            </Label>
            <div className="relative">
              <Input
                id="value"
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={secret ? 'Enter new value to change...' : 'sk_live_...'}
                className="pr-10 font-mono"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setShowValue(!showValue)}
              >
                {showValue ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {secret
                ? 'Leave empty to keep the existing value'
                : 'This value will be encrypted and never displayed again'}
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Production Stripe API key"
            />
          </div>

          {/* Usage Reference */}
          <div className="bg-muted/30 border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Info className="h-4 w-4" />
              Usage in Edge Functions
            </div>
            <pre className="text-xs font-mono bg-background p-2 rounded overflow-x-auto">
{`// Get secret value
const apiKey = secrets.get('${name || 'STRIPE_API_KEY'}');

// Check if secret exists
if (secrets.has('${name || 'STRIPE_API_KEY'}')) {
  // Use the secret
}

// List all available secrets
const allSecrets = secrets.list(); // ['${name || 'STRIPE_API_KEY'}', ...]`}
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
              secret ? 'Save Changes' : 'Create Secret'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

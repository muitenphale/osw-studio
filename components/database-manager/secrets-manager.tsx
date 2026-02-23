'use client';

import React, { useState, useEffect } from 'react';
import { Secret } from '@/lib/vfs/types';
import {
  Plus, Loader2, AlertCircle, Key, MoreVertical, Pencil, Trash2, AlertTriangle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SecretEditor } from './secret-editor';
import { cn } from '@/lib/utils';
import type { SecretsDataProvider } from './data-providers';

interface SecretsManagerProps {
  deploymentId?: string;
  dataProvider?: SecretsDataProvider;
}

export function SecretsManager({ deploymentId, dataProvider }: SecretsManagerProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [encryptionConfigured, setEncryptionConfigured] = useState(true);

  useEffect(() => {
    loadSecrets();
  }, [deploymentId, dataProvider]);

  const loadSecrets = async () => {
    try {
      setLoading(true);
      setError(null);
      if (dataProvider) {
        const result = await dataProvider.list();
        setSecrets(result.secrets);
        setEncryptionConfigured(result.encryptionConfigured);
      } else if (deploymentId) {
        const res = await fetch(`/api/admin/deployments/${deploymentId}/secrets`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load secrets');
        }
        const data = await res.json();
        setSecrets(data.secrets);
        setEncryptionConfigured(data.encryptionConfigured);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load secrets');
    } finally {
      setLoading(false);
    }
  };

  const deleteSecret = async (secret: Secret) => {
    if (!confirm(`Delete secret "${secret.name}"? This cannot be undone.`)) return;

    try {
      if (dataProvider) {
        await dataProvider.remove(secret.id);
      } else if (deploymentId) {
        const res = await fetch(`/api/admin/deployments/${deploymentId}/secrets/${secret.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete secret');
      } else {
        return;
      }
      await loadSecrets();
    } catch (err) {
      console.error('Failed to delete secret:', err);
    }
  };

  const handleSave = async (data: { name: string; value?: string; description?: string }) => {
    try {
      if (dataProvider) {
        await dataProvider.save(editingSecret?.id || null, data);
      } else if (!deploymentId) {
        throw new Error('No deployment ID available');
      } else if (editingSecret) {
        const res = await fetch(`/api/admin/deployments/${deploymentId}/secrets/${editingSecret.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update secret');
        }
      } else {
        const res = await fetch(`/api/admin/deployments/${deploymentId}/secrets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create secret');
        }
      }

      setEditingSecret(null);
      setIsCreating(false);
      await loadSecrets();
    } catch (err) {
      throw err;
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={loadSecrets}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Secrets</h3>
        <Button
          size="sm"
          onClick={() => setIsCreating(true)}
          disabled={!encryptionConfigured}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Secret
        </Button>
      </div>

      {/* Warning if encryption not configured */}
      {!encryptionConfigured && (
        <div className="flex items-center gap-2 text-sm bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 p-3 rounded-lg mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Encryption not configured</p>
            <p className="text-xs opacity-80">
              Set the SECRETS_ENCRYPTION_KEY environment variable to enable secrets.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {secrets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center border rounded-lg">
            <Key className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No secrets yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Store API keys and tokens securely for your edge functions
            </p>
            <Button
              size="sm"
              onClick={() => setIsCreating(true)}
              disabled={!encryptionConfigured}
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Secret
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {secrets.map(secret => (
              <div
                key={secret.id}
                className="border rounded-lg p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Key className="h-4 w-4 text-yellow-500 shrink-0" />
                      <span className="font-mono font-medium truncate">{secret.name}</span>
                      {!secret.hasValue && (
                        <Badge variant="outline" className="text-amber-600 border-amber-500/50 bg-amber-500/10 text-xs shrink-0">
                          Value not set
                        </Badge>
                      )}
                    </div>
                    {secret.description && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {secret.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="shrink-0">Updated {formatDate(secret.updatedAt)}</span>
                      <span className="font-mono truncate">secrets.get('{secret.name}')</span>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingSecret(secret)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteSecret(secret)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Secret Editor Dialog */}
      {(isCreating || editingSecret) && (
        <SecretEditor
          secret={editingSecret}
          isOpen={true}
          onClose={() => {
            setIsCreating(false);
            setEditingSecret(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

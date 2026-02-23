'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SchemaViewer } from '@/components/database-manager/schema-viewer';
import { SqlEditor } from '@/components/database-manager/sql-editor';

interface SchemaEditorProps {
  projectId: string;
  enabled: boolean;
  onSchemaChange?: (schema: string) => void;
}

// Keep these exports — used by vfs/index.ts for transient file generation
export function getProjectSchema(projectId: string): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(`osw-db-schema-${projectId}`) || '';
}

export function setProjectSchema(projectId: string, schema: string): void {
  if (typeof window === 'undefined') return;
  if (schema) {
    localStorage.setItem(`osw-db-schema-${projectId}`, schema);
  } else {
    localStorage.removeItem(`osw-db-schema-${projectId}`);
  }
}

/**
 * Save schema to localStorage and apply DDL to the project database (Server Mode only).
 * Used by project-manager and template-manager during project creation.
 */
export async function applyProjectDatabaseSchema(projectId: string, ddl: string): Promise<void> {
  setProjectSchema(projectId, ddl);
  if (process.env.NEXT_PUBLIC_SERVER_MODE === 'true') {
    try {
      const res = await fetch(`/api/projects/${projectId}/database/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: ddl }),
      });
      if (!res.ok) {
        console.warn('[Schema] DDL apply failed — will auto-heal on Schema tab open');
      }
    } catch {
      // Non-fatal — auto-apply on Schema tab open will recover
    }
  }
}

type SubTab = 'tables' | 'sql' | 'ddl';

export function SchemaEditor({ projectId, enabled, onSchemaChange }: SchemaEditorProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('tables');
  const [ddl, setDdl] = useState('');
  const [applying, setApplying] = useState(false);
  const [schemaKey, setSchemaKey] = useState(0);
  const autoAppliedRef = useRef<string | null>(null);

  const schemaEndpoint = `/api/projects/${projectId}/database/schema`;
  const queryEndpoint = `/api/projects/${projectId}/database/query`;

  // Auto-apply: if localStorage has schema DDL but the project database has no tables,
  // apply the DDL automatically. This self-heals when the initial application during
  // project creation failed (e.g., project not yet synced to SQLite, server restart).
  useEffect(() => {
    if (!enabled) return;
    // Only auto-apply once per projectId
    if (autoAppliedRef.current === projectId) return;

    const storedSchema = getProjectSchema(projectId);
    if (!storedSchema) return;

    const tryAutoApply = async () => {
      try {
        // Check if database already has tables
        const schemaRes = await fetch(schemaEndpoint);
        if (!schemaRes.ok) return;
        const schemaData = await schemaRes.json();
        if (schemaData.tables && schemaData.tables.length > 0) {
          autoAppliedRef.current = projectId;
          return; // Already has tables, nothing to do
        }

        // Database is empty but localStorage has DDL — apply it
        const res = await fetch(queryEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: storedSchema }),
        });

        if (res.ok) {
          autoAppliedRef.current = projectId;
          setSchemaKey(prev => prev + 1);
        }
      } catch {
        // Non-fatal — user can manually apply via DDL tab
      }
    };

    tryAutoApply();
  }, [enabled, projectId, schemaEndpoint, queryEndpoint]);

  const applyDDL = useCallback(async () => {
    if (!ddl.trim()) return;

    setApplying(true);
    try {
      const res = await fetch(queryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: ddl.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to apply DDL');
        return;
      }

      toast.success('DDL applied successfully');

      // Update localStorage schema (append DDL) so AI server context stays in sync
      const existing = getProjectSchema(projectId);
      const updated = existing ? `${existing}\n\n${ddl.trim()}` : ddl.trim();
      setProjectSchema(projectId, updated);
      onSchemaChange?.(updated);

      // Refresh SchemaViewer
      setSchemaKey(prev => prev + 1);
      setDdl('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply DDL');
    } finally {
      setApplying(false);
    }
  }, [ddl, queryEndpoint, projectId, onSchemaChange]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tab buttons */}
      <div className="flex items-center gap-1 mb-3 border-b pb-2">
        {(['tables', 'sql', 'ddl'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeSubTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {tab === 'tables' ? 'Tables' : tab === 'sql' ? 'SQL' : 'DDL'}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 min-h-0">
        {activeSubTab === 'tables' && (
          <SchemaViewer
            key={schemaKey}
            schemaEndpoint={schemaEndpoint}
            showSystemTablesToggle={false}
          />
        )}

        {activeSubTab === 'sql' && (
          <SqlEditor queryEndpoint={queryEndpoint} />
        )}

        {activeSubTab === 'ddl' && (
          <div className="h-full flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Apply DDL</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CREATE TABLE, ALTER TABLE, and other DDL statements
                </p>
              </div>
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={applyDDL}
                disabled={applying || !ddl.trim()}
              >
                {applying ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                Apply
              </Button>
            </div>
            <textarea
              data-schema-editor
              className="flex-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              placeholder={`-- Create or modify tables\nCREATE TABLE IF NOT EXISTS example (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);`}
              value={ddl}
              onChange={(e) => setDdl(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

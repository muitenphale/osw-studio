'use client';

import React, { useState, useEffect } from 'react';
import { TableInfo } from '@/lib/vfs/types';
import { ChevronRight, ChevronDown, Table2, KeyRound, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SchemaViewerProps {
  deploymentId?: string;
  schemaEndpoint?: string;
  showSystemTablesToggle?: boolean;
}

export function SchemaViewer({ deploymentId, schemaEndpoint, showSystemTablesToggle = true }: SchemaViewerProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [showSystemTables, setShowSystemTables] = useState(false);

  const endpoint = schemaEndpoint || `/api/admin/deployments/${deploymentId}/database/schema`;

  useEffect(() => {
    loadSchema();
  }, [endpoint]);

  const loadSchema = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(endpoint);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load schema');
      }
      const data = await res.json();
      setTables(data.tables);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schema');
    } finally {
      setLoading(false);
    }
  };

  const toggleTable = (tableName: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  const filteredTables = showSystemTables
    ? tables
    : tables.filter(t => !t.isSystemTable);

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
        <Button variant="outline" onClick={loadSchema}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Database Tables</h3>
        {showSystemTablesToggle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSystemTables(!showSystemTables)}
            className="text-xs"
          >
            {showSystemTables ? (
              <>
                <EyeOff className="h-3.5 w-3.5 mr-1" />
                Hide System Tables
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 mr-1" />
                Show System Tables
              </>
            )}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto border rounded-lg">
        {filteredTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Table2 className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No user tables found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create tables using the SQL editor
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredTables.map(table => (
              <div key={table.name} className={cn(
                "transition-colors",
                table.isSystemTable && "bg-muted/30"
              )}>
                <button
                  onClick={() => toggleTable(table.name)}
                  className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  {expandedTables.has(table.name) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Table2 className="h-4 w-4 text-blue-500" />
                  <span className="flex-1 font-mono text-sm">{table.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {table.rowCount} row{table.rowCount !== 1 ? 's' : ''}
                  </span>
                  {table.isSystemTable && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">system</span>
                  )}
                </button>

                {expandedTables.has(table.name) && (
                  <div className="bg-muted/20 border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2 font-medium">Column</th>
                          <th className="text-left p-2 font-medium">Type</th>
                          <th className="text-left p-2 font-medium">Nullable</th>
                          <th className="text-left p-2 font-medium">Default</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.columns.map(col => (
                          <tr key={col.name} className="border-b last:border-0">
                            <td className="p-2 font-mono flex items-center gap-1.5">
                              {col.primaryKey && (
                                <KeyRound className="h-3 w-3 text-yellow-500" />
                              )}
                              {col.name}
                            </td>
                            <td className="p-2 font-mono text-muted-foreground">
                              {col.type || 'TEXT'}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {col.nullable ? 'Yes' : 'No'}
                            </td>
                            <td className="p-2 font-mono text-muted-foreground text-xs">
                              {col.defaultValue || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SchemaViewer } from './schema-viewer';
import { SqlEditor } from './sql-editor';
import { FunctionsManager } from './functions-manager';
import { ServerFunctionsManager } from './server-functions-manager';
import { SecretsManager } from './secrets-manager';
import { ScheduledFunctionsManager } from './scheduled-functions-manager';
import { LogsViewer } from './logs-viewer';
import { Database, Code2, Terminal, ScrollText, Wrench, Key, Clock } from 'lucide-react';

interface DatabaseManagerProps {
  deploymentId: string;
}

export function DatabaseManager({ deploymentId }: DatabaseManagerProps) {
  const [activeTab, setActiveTab] = useState('schema');

  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="schema" className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Schema
          </TabsTrigger>
          <TabsTrigger value="query" className="flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5" />
            SQL
          </TabsTrigger>
          <TabsTrigger value="functions" className="flex items-center gap-1.5">
            <Code2 className="h-3.5 w-3.5" />
            Functions
          </TabsTrigger>
          <TabsTrigger value="helpers" className="flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Helpers
          </TabsTrigger>
          <TabsTrigger value="secrets" className="flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5" />
            Secrets
          </TabsTrigger>
          <TabsTrigger value="schedules" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Schedules
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5">
            <ScrollText className="h-3.5 w-3.5" />
            Logs
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden mt-4">
          <TabsContent value="schema" className="h-full m-0">
            <SchemaViewer deploymentId={deploymentId} />
          </TabsContent>

          <TabsContent value="query" className="h-full m-0">
            <SqlEditor deploymentId={deploymentId} />
          </TabsContent>

          <TabsContent value="functions" className="h-full m-0">
            <FunctionsManager deploymentId={deploymentId} />
          </TabsContent>

          <TabsContent value="helpers" className="h-full m-0">
            <ServerFunctionsManager deploymentId={deploymentId} />
          </TabsContent>

          <TabsContent value="secrets" className="h-full m-0">
            <SecretsManager deploymentId={deploymentId} />
          </TabsContent>

          <TabsContent value="schedules" className="h-full m-0">
            <ScheduledFunctionsManager deploymentId={deploymentId} />
          </TabsContent>

          <TabsContent value="logs" className="h-full m-0">
            <LogsViewer deploymentId={deploymentId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export { SchemaViewer } from './schema-viewer';
export { SqlEditor } from './sql-editor';
export { FunctionsManager } from './functions-manager';
export { ServerFunctionsManager } from './server-functions-manager';
export { SecretsManager } from './secrets-manager';
export { ScheduledFunctionsManager } from './scheduled-functions-manager';
export { LogsViewer } from './logs-viewer';

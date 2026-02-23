/**
 * Data provider interfaces for database manager components.
 * Allows components to work with both API (deployment runtime) and IndexedDB (project definitions).
 */

import type { EdgeFunction, ServerFunction, Secret, ScheduledFunction } from '@/lib/vfs/types';

export interface FunctionsDataProvider {
  list(): Promise<EdgeFunction[]>;
  save(id: string | null, data: Partial<EdgeFunction>): Promise<void>;
  remove(id: string): Promise<void>;
  toggle(id: string, enabled: boolean): Promise<void>;
}

export interface ServerFunctionsDataProvider {
  list(): Promise<ServerFunction[]>;
  save(id: string | null, data: Partial<ServerFunction>): Promise<void>;
  remove(id: string): Promise<void>;
  toggle(id: string, enabled: boolean): Promise<void>;
}

export interface SecretsDataProvider {
  list(): Promise<{ secrets: Secret[]; encryptionConfigured: boolean }>;
  save(id: string | null, data: { name: string; value?: string; description?: string }): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ScheduledFunctionsDataProvider {
  listScheduled(): Promise<ScheduledFunction[]>;
  listEdgeFunctions(): Promise<EdgeFunction[]>;
  save(id: string | null, data: Partial<ScheduledFunction>): Promise<void>;
  remove(id: string): Promise<void>;
  toggle(id: string, enabled: boolean): Promise<void>;
}

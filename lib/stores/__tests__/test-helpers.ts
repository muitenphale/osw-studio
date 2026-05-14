import { vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createOrchestratorSlice, OrchestratorSlice } from '../slices/orchestrator';
import { createProjectSlice, ProjectSlice } from '../slices/project';

type TestStoreState = OrchestratorSlice & ProjectSlice;

export function createTestStore() {
  return createStore<TestStoreState>()((...a) => ({
    ...createOrchestratorSlice(...a),
    ...createProjectSlice(...a),
  }));
}

export function setupOrchestratorMocks() {
  vi.mock('@/lib/config/storage', () => ({
    configManager: {
      getSelectedProvider: () => 'openai',
      getApiKey: () => 'sk-test',
      getDefaultModel: () => 'gpt-4',
      getProviderModel: () => 'gpt-4',
      getCachedModels: () => null,
    },
    migrateBackendKey: () => false,
  }));
  vi.mock('@/lib/llm/providers/registry', () => ({
    getProvider: () => ({ name: 'OpenAI', apiKeyRequired: true, isLocal: false }),
    modelSupportsVision: () => false,
  }));
  vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
  vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
  vi.mock('@/lib/llm/debug-events-state', () => ({
    debugEventsState: { saveEvents: vi.fn(), clearEvents: vi.fn(), loadEvents: vi.fn().mockResolvedValue([]) },
  }));
  vi.mock('@/lib/vfs', () => ({ vfs: { hasServerContext: () => false, refreshServerContext: vi.fn() } }));
  vi.mock('@/lib/preview/runtime-errors', () => ({
    drainRuntimeErrors: () => [],
    peekRuntimeErrors: () => [],
    formatRuntimeErrors: () => '',
    resetRuntimeErrors: vi.fn(),
  }));
  vi.mock('@/lib/utils', () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
}

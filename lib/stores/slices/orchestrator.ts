import { StateCreator } from 'zustand';
import type { DebugEvent } from '../types';
import { MultiAgentOrchestrator } from '@/lib/llm/multi-agent-orchestrator';
import type { PendingImage } from '@/lib/llm/multi-agent-orchestrator';
import { configManager } from '@/lib/config/storage';
import { getProvider } from '@/lib/llm/providers/registry';
import { toast } from 'sonner';
import { track } from '@/lib/telemetry';
import { vfs } from '@/lib/vfs';
import type { ProjectRuntime } from '@/lib/vfs/types';
import { debugEventsState } from '@/lib/llm/debug-events-state';
import { drainRuntimeErrors } from '@/lib/preview/runtime-errors';
import { logger } from '@/lib/utils';

const MAX_DEBUG_EVENTS = 2000;
let debugIdCounter = 0;

let persistProjectId: string | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// When the user views a different project while generation runs, events accumulate
// here instead of in the store's debugEvents (which shows the viewed project's history).
let backgroundEvents: DebugEvent[] = [];

function debouncedSave(events: DebugEvent[]) {
  if (!persistProjectId) return;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  const pid = persistProjectId;
  saveDebounceTimer = setTimeout(() => {
    Promise.resolve(debugEventsState.saveEvents(pid, events)).catch(error => {
      logger.error('Failed to persist debug events:', error);
    });
  }, 500);
}

function flushSave(events: DebugEvent[]) {
  if (!persistProjectId) return;
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  const pid = persistProjectId;
  Promise.resolve(debugEventsState.saveEvents(pid, events)).catch(error => {
    logger.error('Failed to flush debug events:', error);
  });
}

interface StartGenerationOptions {
  chatMode?: boolean;
  projectId: string;
  focusContext?: any;
  placedBlocks?: any[];
  isTourLockingInput?: boolean;
}

export interface OrchestratorSlice {
  generating: boolean;
  orchestratorInstance: MultiAgentOrchestrator | null;
  persistedInstance: MultiAgentOrchestrator | null;
  debugEvents: DebugEvent[];
  currentModel: string;
  projectCost: number;
  generatingProjectId: string | null;
  generatingProjectName: string | null;
  generatingPrompt: string | null;
  generationResult: 'completed' | 'failed' | null;
  generationStartedAt: number | null;

  addDebugEvent: (event: string, data: any) => void;
  clearDebugEvents: () => void;
  getGenerationEvents: () => DebugEvent[];
  handleProgress: (event: string, data: any) => void;
  startGeneration: (message: string, images?: PendingImage[], options?: StartGenerationOptions) => Promise<void>;
  stopGeneration: () => void;
  continueGeneration: () => void;
  resetOrchestrator: () => void;
  setCurrentModel: (model: string) => void;
  setProjectCost: (cost: number) => void;
  loadDebugEvents: (projectId: string) => Promise<void>;
  clearChat: (projectId: string) => Promise<void>;
  initPersistence: (projectId: string) => void;
  cleanupPersistence: () => void;
  dismissGenerationResult: () => void;
}

type CombinedState = OrchestratorSlice & {
  projectId: string;
  projectName: string;
  markDirty: () => void;
  bumpRefreshTrigger: () => void;
  updateProjectSettings: (settings: { runtime?: ProjectRuntime }) => void;
};

export const createOrchestratorSlice: StateCreator<CombinedState, [], [], OrchestratorSlice> = (set, get) => ({
  generating: false,
  orchestratorInstance: null,
  persistedInstance: null,
  debugEvents: [],
  currentModel: '',
  projectCost: 0,
  generatingProjectId: null,
  generatingProjectName: null,
  generatingPrompt: null,
  generationResult: null,
  generationStartedAt: null,

  addDebugEvent: (event: string, data: any) => {
    const { generatingProjectId, projectId } = get();
    const isBackground = !!generatingProjectId && generatingProjectId !== projectId;

    const debugEvent: DebugEvent = {
      id: `${Date.now()}-${debugIdCounter++}`,
      timestamp: Date.now(),
      event,
      data,
      count: 1,
      version: 1,
    };

    if (isBackground) {
      // User is viewing a different project — accumulate in shadow buffer, persist to IDB only
      const shouldCoalesce = event === 'assistant_delta' || event === 'tool_param_delta' || event === 'reasoning_delta';
      if (shouldCoalesce && backgroundEvents.length > 0) {
        const searchLimit = Math.max(0, backgroundEvents.length - 4);
        for (let i = backgroundEvents.length - 1; i >= searchLimit; i--) {
          if (backgroundEvents[i].event === event) {
            const target = backgroundEvents[i];
            backgroundEvents[i] = {
              ...target,
              timestamp: Date.now(),
              version: target.version + 1,
              count: target.count + 1,
              data: { all: target.data.all ? [...target.data.all, data] : [target.data, data] },
            };
            debouncedSave(backgroundEvents);
            return;
          }
        }
      }
      backgroundEvents.push(debugEvent);
      if (backgroundEvents.length > MAX_DEBUG_EVENTS) {
        backgroundEvents = backgroundEvents.slice(-MAX_DEBUG_EVENTS);
      }
      debouncedSave(backgroundEvents);
      return;
    }

    set(state => {
      const prev = state.debugEvents;
      const shouldCoalesce = event === 'assistant_delta' || event === 'tool_param_delta' || event === 'reasoning_delta';

      if (shouldCoalesce && prev.length > 0) {
        const searchLimit = Math.max(0, prev.length - 4);
        for (let i = prev.length - 1; i >= searchLimit; i--) {
          if (prev[i].event === event) {
            const target = prev[i];
            const updatedEvent: DebugEvent = {
              ...target,
              timestamp: Date.now(),
              version: target.version + 1,
              count: target.count + 1,
              data: {
                all: target.data.all
                  ? [...target.data.all, data]
                  : [target.data, data],
              },
            };
            const newEvents = [...prev.slice(0, i), updatedEvent, ...prev.slice(i + 1)];
            return { debugEvents: newEvents };
          }
        }
      }

      let newEvents = [...prev, debugEvent];
      if (newEvents.length > MAX_DEBUG_EVENTS) {
        newEvents = newEvents.slice(-MAX_DEBUG_EVENTS);
      }

      return { debugEvents: newEvents };
    });
    debouncedSave(get().debugEvents);
  },

  clearDebugEvents: () => {
    set({ debugEvents: [] });
  },

  getGenerationEvents: () => {
    const { generatingProjectId, projectId } = get();
    const isBackground = !!generatingProjectId && generatingProjectId !== projectId;
    return isBackground && backgroundEvents.length > 0 ? backgroundEvents : get().debugEvents;
  },

  handleProgress: (event: string, data: any) => {
    const state = get();
    state.addDebugEvent(event, data);

    const isViewingGeneratingProject = state.generatingProjectId === state.projectId;

    if (event === 'tool_status' && data?.status === 'completed' && isViewingGeneratingProject) {
      state.markDirty();
      state.bumpRefreshTrigger();
    }

    if (event === 'usage' && data?.totalCost != null) {
      set({ projectCost: data.totalCost });
    }

    if (event === 'runtimeChanged' && data?.runtime && isViewingGeneratingProject) {
      state.updateProjectSettings({ runtime: data.runtime });
    }
  },

  startGeneration: async (message: string, images?: PendingImage[], options?: StartGenerationOptions) => {
    const state = get();
    if (state.generating) return;
    if (options?.isTourLockingInput) return;

    drainRuntimeErrors();

    const trimmedPrompt = message.trim();
    if (!trimmedPrompt && (!images || images.length === 0)) {
      toast.error('Please enter a prompt');
      return;
    }

    const currentProvider = configManager.getSelectedProvider();
    const providerConfig = getProvider(currentProvider);
    const apiKey = configManager.getApiKey();

    if (providerConfig.apiKeyRequired && !apiKey) {
      toast.error(`Please set your ${providerConfig.name} API key in settings`);
      return;
    }

    if (providerConfig.isLocal) {
      const localModel = configManager.getProviderModel(currentProvider);
      if (!localModel) {
        toast.error(`No model selected for ${providerConfig.name}. Please select a model in settings.`);
        return;
      }
    }

    const chatMode = options?.chatMode ?? false;
    let modelToUse = configManager.getProviderModel(currentProvider) || configManager.getDefaultModel();
    if (typeof window !== 'undefined') {
      const useSeparateChatModel = localStorage.getItem(`osw-studio-use-separate-chat-model-${currentProvider}`) === 'true';
      if (useSeparateChatModel) {
        if (chatMode) {
          const chatModel = localStorage.getItem(`osw-studio-chat-model-${currentProvider}`);
          if (chatModel) modelToUse = chatModel;
        } else {
          const codeModel = localStorage.getItem(`osw-studio-code-model-${currentProvider}`);
          if (codeModel) modelToUse = codeModel;
        }
      }
    }

    if (!modelToUse) {
      toast.error(`No model selected for ${chatMode ? 'chat' : 'code'} mode. Please select a model in settings.`);
      return;
    }

    const projectId = options?.projectId || '';
    const projectName = get().projectName || 'Untitled';
    set({
      generating: true,
      currentModel: modelToUse,
      generatingProjectId: projectId,
      generatingProjectName: projectName,
      generatingPrompt: trimmedPrompt,
      generationResult: null,
      generationStartedAt: Date.now(),
    });
    if (typeof globalThis.dispatchEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent('generationStateChanged', { detail: { generating: true } }));
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    track('task_started', { provider: currentProvider, model: modelToUse, task_id: taskId });
    const taskStartTime = Date.now();

    try {
      let orchestrator = get().persistedInstance;

      if (!orchestrator) {
        const { handleProgress } = get();
        orchestrator = new MultiAgentOrchestrator(
          projectId,
          'orchestrator',
          handleProgress,
          { chatMode, model: modelToUse },
        );

        const conversationMessages = get().debugEvents
          .filter(event => event.event === 'conversation_message')
          .map(event => event.data.message);

        if (conversationMessages.length > 0) {
          orchestrator.importConversation(conversationMessages);
        }

        set({ persistedInstance: orchestrator });
      }

      set({ orchestratorInstance: orchestrator });

      const imageData = images?.map(img => ({ data: img.data, mediaType: img.mediaType }));
      const executeOptions: Record<string, any> = {};
      if (imageData?.length) executeOptions.images = imageData;

      const result = await orchestrator.execute(
        trimmedPrompt,
        Object.keys(executeOptions).length > 0 ? executeOptions : undefined,
      );

      if (result.success) {
        if (vfs.hasServerContext()) {
          await vfs.refreshServerContext();
        }
        track('task_complete', {
          provider: currentProvider, model: modelToUse,
          duration_ms: Date.now() - taskStartTime, task_id: taskId,
          tool_count: result.toolCount ?? 0, turn_count: result.turnCount ?? 0,
          api_error_count: result.apiErrorCount ?? 0,
        });
        set({ generationResult: 'completed' });
        toast.success('Task completed');
      } else {
        track('task_fail', {
          provider: currentProvider, model: modelToUse, reason: 'api_error',
          duration_ms: Date.now() - taskStartTime, task_id: taskId,
          tool_count: result.toolCount ?? 0, turn_count: result.turnCount ?? 0,
          api_error_count: result.apiErrorCount ?? 0,
        });
        set({ generationResult: 'failed' });
        toast.error(result.summary || 'Generation failed', { duration: 5000, position: 'bottom-center' });
      }
    } catch (error) {
      logger.error('Generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate';
      track('task_fail', {
        provider: currentProvider, model: modelToUse, reason: 'api_error',
        duration_ms: Date.now() - taskStartTime, task_id: taskId,
      });
      set({ generationResult: 'failed' });
      get().addDebugEvent('error', { message: errorMessage });
      toast.error(errorMessage, { duration: 5000, position: 'bottom-center' });
    } finally {
      set({ generating: false, orchestratorInstance: null });
      const eventsToFlush = backgroundEvents.length > 0 ? backgroundEvents : get().debugEvents;
      flushSave(eventsToFlush);
      backgroundEvents = [];
      if (typeof globalThis.dispatchEvent === 'function') {
        globalThis.dispatchEvent(new CustomEvent('generationStateChanged', { detail: { generating: false } }));
      }
    }
  },

  stopGeneration: () => {
    const { orchestratorInstance } = get();
    if (orchestratorInstance) {
      orchestratorInstance.stop();
      track('task_fail', {
        provider: configManager.getSelectedProvider(),
        model: get().currentModel || configManager.getDefaultModel(),
        reason: 'stopped',
      });
      toast.info('Generation stopped');
    }
    set({ generating: false, generationResult: null, generatingProjectId: null, generatingProjectName: null, generatingPrompt: null, generationStartedAt: null });
    backgroundEvents = [];
    if (typeof globalThis.dispatchEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent('generationStateChanged', { detail: { generating: false } }));
    }
  },

  continueGeneration: () => {
    const { orchestratorInstance } = get();
    if (orchestratorInstance) {
      orchestratorInstance.continue();
      toast.info('Resuming task...');
    }
  },

  resetOrchestrator: () => {
    if (get().generating) return;
    set({ orchestratorInstance: null, persistedInstance: null });
  },

  setCurrentModel: (model: string) => set({ currentModel: model }),

  setProjectCost: (cost: number) => set({ projectCost: cost }),

  loadDebugEvents: async (projectId: string) => {
    const { persistedInstance, generatingProjectId, debugEvents } = get();

    // If the orchestrator is running for THIS project, in-memory events are authoritative.
    if (persistedInstance && generatingProjectId === projectId) {
      // Returning to the generating project — restore background events if any
      if (backgroundEvents.length > 0) {
        set({ debugEvents: backgroundEvents });
        backgroundEvents = [];
      }
      return;
    }

    // If generation is running for a DIFFERENT project, stash current events in the
    // background buffer so the orchestrator's addDebugEvent calls persist correctly.
    if (persistedInstance && generatingProjectId !== projectId) {
      backgroundEvents = [...debugEvents];
    }

    try {
      const savedEvents = await debugEventsState.loadEvents(projectId);
      if (savedEvents.length > 0) {
        const normalized: DebugEvent[] = savedEvents.map(e => ({
          ...e,
          count: (e as any).count ?? 1,
          version: (e as any).version ?? 1,
        }));
        set({ debugEvents: normalized });
      } else {
        set({ debugEvents: [] });
      }
    } catch (error) {
      logger.error('Failed to load debug events:', error);
    }
  },

  clearChat: async (projectId: string) => {
    set({ debugEvents: [], persistedInstance: null });
    try {
      await debugEventsState.clearEvents(projectId);
    } catch (error) {
      logger.error('Failed to clear debug events:', error);
    }
  },

  initPersistence: (projectId: string) => {
    const { generating, generatingProjectId } = get();
    if (generating && generatingProjectId) {
      if (generatingProjectId !== projectId) {
        // Viewing a different project — don't overwrite the persist target
        return;
      }
      // Returning to the generating project — restore persist target and clear background buffer
      persistProjectId = projectId;
      backgroundEvents = [];
      return;
    }
    persistProjectId = projectId;
  },

  cleanupPersistence: () => {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    persistProjectId = null;
  },

  dismissGenerationResult: () => {
    if (get().generating) {
      set({ generationResult: null });
    } else {
      set({ generationResult: null, generatingProjectId: null, generatingProjectName: null, generatingPrompt: null, generationStartedAt: null });
    }
  },
});

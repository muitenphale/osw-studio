import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OswsProviderAdapter, ProviderAdapterConfig } from '../provider-adapter';
import { requestSnapshotStore } from '../request-snapshot';
import type { Message } from '../core/types';

vi.mock('@/lib/api/backend-status', () => ({
  apiFetch: vi.fn(async () => makeSSEResponse([
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello.' }, index: 0, finish_reason: 'stop' }] })}\n\n`,
    'data: [DONE]\n\n',
  ])),
}));

vi.mock('../models-dev', () => ({
  ensureModelsDevPricing: vi.fn(async () => {}),
}));

vi.mock('../models-api', () => ({
  fetchAvailableModels: vi.fn(async () => []),
}));

vi.mock('../pricing-cache', () => ({
  registerOpenRouterPricingFromApi: vi.fn(),
  registerPricingFromProviderModels: vi.fn(),
}));

import { ensureModelsDevPricing } from '../models-dev';
import { fetchAvailableModels } from '../models-api';
import { registerOpenRouterPricingFromApi, registerPricingFromProviderModels } from '../pricing-cache';

function makeSSEResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function makeAdapter(): OswsProviderAdapter {
  const config: ProviderAdapterConfig = {
    getProviderConfig: () => ({ provider: 'openai', apiKey: 'k', model: 'gpt-test', baseUrl: undefined }),
    getApiUrl: () => 'http://localhost/api/generate',
    getReasoningEnabled: () => false,
    getDebugStreamEnabled: () => false,
    getModelPricing: () => null,
    getCachedModels: () => null,
    progress: { onEvent: vi.fn() },
  };
  return new OswsProviderAdapter(config);
}

const messages: Message[] = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'hi' },
];

describe('OswsProviderAdapter request snapshot capture', () => {
  beforeEach(() => {
    requestSnapshotStore.setEnabled(false);
    requestSnapshotStore.clear();
  });

  it('captures the outgoing message history when capture is enabled', async () => {
    requestSnapshotStore.setEnabled(true);
    await makeAdapter().call({ messages });

    const snap = requestSnapshotStore.getSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.messages).toEqual(messages);
    expect(snap!.provider).toBe('openai');
    expect(snap!.model).toBe('gpt-test');
  });

  it('captures nothing when disabled', async () => {
    await makeAdapter().call({ messages });
    expect(requestSnapshotStore.getSnapshot()).toBeNull();
  });

  it('does not capture silent (compaction) calls', async () => {
    requestSnapshotStore.setEnabled(true);
    await makeAdapter().call({ messages, silent: true });
    expect(requestSnapshotStore.getSnapshot()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ensurePricing — exercised indirectly via call()
// ---------------------------------------------------------------------------

describe('ensurePricing paths', () => {
  function makeAdapterWith(overrides: Partial<ProviderAdapterConfig>): OswsProviderAdapter {
    const config: ProviderAdapterConfig = {
      getProviderConfig: () => ({ provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-4', baseUrl: undefined }),
      getApiUrl: () => 'http://localhost/api/generate',
      getReasoningEnabled: () => false,
      getDebugStreamEnabled: () => false,
      getModelPricing: () => null,
      getCachedModels: () => null,
      progress: { onEvent: vi.fn() },
      ...overrides,
    };
    return new OswsProviderAdapter(config);
  }

  beforeEach(() => {
    vi.mocked(ensureModelsDevPricing).mockClear();
    vi.mocked(fetchAvailableModels).mockClear();
    vi.mocked(registerOpenRouterPricingFromApi).mockClear();
    vi.mocked(registerPricingFromProviderModels).mockClear();
  });

  it('skips all fetches when getModelPricing returns data', async () => {
    const adapter = makeAdapterWith({
      getModelPricing: () => ({ input: 3, output: 15 }),
    });

    await adapter.call({ messages });

    expect(ensureModelsDevPricing).not.toHaveBeenCalled();
  });

  it('calls ensureModelsDevPricing as fallback for non-openrouter providers', async () => {
    const adapter = makeAdapterWith({
      getModelPricing: () => null,
    });

    await adapter.call({ messages });

    expect(ensureModelsDevPricing).toHaveBeenCalled();
  });

  it('tries OpenRouter cached models before falling back to models.dev', async () => {
    let pricingCallCount = 0;
    const adapter = makeAdapterWith({
      getProviderConfig: () => ({ provider: 'openrouter', apiKey: 'k', model: 'meta-llama/llama-3', baseUrl: undefined }),
      getModelPricing: () => {
        pricingCallCount++;
        return pricingCallCount <= 1 ? null : { input: 1, output: 1 };
      },
      getCachedModels: () => ({
        models: [{ id: 'meta-llama/llama-3', supportsFunctions: true }],
      }),
    });

    await adapter.call({ messages });

    expect(registerPricingFromProviderModels).toHaveBeenCalledWith('openrouter', expect.any(Array));
    expect(ensureModelsDevPricing).not.toHaveBeenCalled();
  });

  it('falls back to models.dev when OpenRouter cached models do not cover the model', async () => {
    const adapter = makeAdapterWith({
      getProviderConfig: () => ({ provider: 'openrouter', apiKey: 'k', model: 'meta-llama/llama-3', baseUrl: undefined }),
      getModelPricing: () => null,
      getCachedModels: () => ({
        models: [{ id: 'meta-llama/llama-3' }],
      }),
    });

    await adapter.call({ messages });

    expect(fetchAvailableModels).toHaveBeenCalled();
    expect(ensureModelsDevPricing).toHaveBeenCalled();
  });

  it('caches the pricing check per provider:model — does not re-run', async () => {
    const adapter = makeAdapterWith({
      getModelPricing: () => null,
    });

    await adapter.call({ messages });
    await adapter.call({ messages });

    expect(ensureModelsDevPricing).toHaveBeenCalledTimes(1);
  });
});

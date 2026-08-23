import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderModel } from '@/lib/llm/providers/types';

vi.mock('@/lib/config/storage', () => ({
  configManager: {
    setProviderPricing: vi.fn(),
  },
}));

vi.mock('@/lib/utils', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

let fetchMock: ReturnType<typeof vi.fn>;

const DEV_FIXTURE = {
  anthropic: {
    id: 'anthropic',
    models: {
      'claude-sonnet-4-20250514': {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        cost: { input: 3, output: 15 },
        modalities: { input: ['text', 'image'], output: ['text'] },
        tool_call: true,
        reasoning: true,
        limit: { context: 200000, output: 64000 },
      },
      'claude-haiku-3-5': {
        id: 'claude-haiku-3-5',
        name: 'Claude Haiku 3.5',
        cost: { input: 0.8, output: 4 },
        modalities: { input: ['text'], output: ['text'] },
        tool_call: true,
        limit: { context: 200000, output: 8192 },
      },
    },
  },
  google: {
    id: 'google',
    models: {
      'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        cost: { input: 0.15, output: 0.6 },
        modalities: { input: ['text', 'image', 'audio'], output: ['text', 'image'] },
        tool_call: true,
        reasoning: false,
        limit: { context: 1048576, output: 65536 },
      },
    },
  },
};

function makeModel(id: string, overrides: Partial<ProviderModel> = {}): ProviderModel {
  return { id, name: id, contextLength: 128000, ...overrides };
}

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => DEV_FIXTURE,
  }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('enrichModelsFromModelsDev', () => {
  it('fills pricing when model has none', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('claude-sonnet-4-20250514');

    const result = await enrichModelsFromModelsDev('anthropic', [model]);

    expect(result[0].pricing).toEqual({ input: 3, output: 15, reasoning: undefined });
  });

  it('does not overwrite existing pricing', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const existingPricing = { input: 99, output: 99 };
    const model = makeModel('claude-sonnet-4-20250514', { pricing: existingPricing });

    await enrichModelsFromModelsDev('anthropic', [model]);

    expect(model.pricing).toBe(existingPricing);
  });

  it('fills modalities from dev data', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('claude-sonnet-4-20250514');

    await enrichModelsFromModelsDev('anthropic', [model]);

    expect(model.inputModalities).toEqual(['text', 'image']);
    expect(model.supportsVision).toBe(true);
  });

  it('does not overwrite existing inputModalities', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('claude-sonnet-4-20250514', { inputModalities: ['text'] });

    await enrichModelsFromModelsDev('anthropic', [model]);

    expect(model.inputModalities).toEqual(['text']);
  });

  it('fills supportsFunctions and supportsReasoning', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('claude-sonnet-4-20250514');

    await enrichModelsFromModelsDev('anthropic', [model]);

    expect(model.supportsFunctions).toBe(true);
    expect(model.supportsReasoning).toBe(true);
  });

  it('does not overwrite existing supportsFunctions', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('claude-sonnet-4-20250514', { supportsFunctions: false });

    await enrichModelsFromModelsDev('anthropic', [model]);

    expect(model.supportsFunctions).toBe(false);
  });

  it('updates contextLength when existing is <= 128000', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('claude-sonnet-4-20250514', { contextLength: 128000 });

    await enrichModelsFromModelsDev('anthropic', [model]);

    expect(model.contextLength).toBe(200000);
  });

  it('does not overwrite contextLength > 128000', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('claude-sonnet-4-20250514', { contextLength: 200001 });

    await enrichModelsFromModelsDev('anthropic', [model]);

    expect(model.contextLength).toBe(200001);
  });

  it('fills maxTokens when undefined', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('claude-sonnet-4-20250514');

    await enrichModelsFromModelsDev('anthropic', [model]);

    expect(model.maxTokens).toBe(64000);
  });

  it('returns models unchanged for unmapped provider', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('some-model');

    const result = await enrichModelsFromModelsDev('lmstudio' as any, [model]);

    expect(result).toEqual([model]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips models not found in dev data', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('nonexistent-model');

    await enrichModelsFromModelsDev('anthropic', [model]);

    expect(model.pricing).toBeUndefined();
    expect(model.supportsFunctions).toBeUndefined();
  });

  it('maps output modalities including image', async () => {
    const { enrichModelsFromModelsDev } = await import('../models-dev');
    const model = makeModel('gemini-2.5-flash');

    await enrichModelsFromModelsDev('gemini', [model]);

    expect(model.outputModalities).toEqual(['text', 'image']);
  });
});

describe('loadModelsFromModelsDev', () => {
  it('returns ProviderModel array for mapped provider', async () => {
    const { loadModelsFromModelsDev } = await import('../models-dev');

    const result = await loadModelsFromModelsDev('anthropic');

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    const ids = result!.map(m => m.id);
    expect(ids).toContain('claude-sonnet-4-20250514');
    expect(ids).toContain('claude-haiku-3-5');
  });

  it('returns null for unmapped provider', async () => {
    const { loadModelsFromModelsDev } = await import('../models-dev');

    const result = await loadModelsFromModelsDev('lmstudio' as any);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when fetch fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const { loadModelsFromModelsDev } = await import('../models-dev');

    const result = await loadModelsFromModelsDev('anthropic');

    expect(result).toBeNull();
  });

  it('converts dev model fields to ProviderModel shape', async () => {
    const { loadModelsFromModelsDev } = await import('../models-dev');

    const result = await loadModelsFromModelsDev('anthropic');
    const sonnet = result!.find(m => m.id === 'claude-sonnet-4-20250514')!;

    expect(sonnet.name).toBe('Claude Sonnet 4');
    expect(sonnet.contextLength).toBe(200000);
    expect(sonnet.maxTokens).toBe(64000);
    expect(sonnet.supportsFunctions).toBe(true);
    expect(sonnet.supportsVision).toBe(true);
    expect(sonnet.supportsReasoning).toBe(true);
    expect(sonnet.pricing).toEqual({ input: 3, output: 15, reasoning: undefined });
    expect(sonnet.inputModalities).toEqual(['text', 'image']);
  });
});

describe('ensureModelsDevPricing', () => {
  it('registers pricing for all mapped providers', async () => {
    const { configManager } = await import('@/lib/config/storage');
    const { ensureModelsDevPricing } = await import('../models-dev');

    await ensureModelsDevPricing();

    expect(configManager.setProviderPricing).toHaveBeenCalled();
    const calls = vi.mocked(configManager.setProviderPricing).mock.calls;
    const providers = calls.map(c => c[0]);
    expect(providers).toContain('anthropic');
    expect(providers).toContain('gemini');
  });

  it('is idempotent — second call is a no-op', async () => {
    const { configManager } = await import('@/lib/config/storage');
    const { ensureModelsDevPricing } = await import('../models-dev');

    await ensureModelsDevPricing();
    const firstCallCount = vi.mocked(configManager.setProviderPricing).mock.calls.length;

    await ensureModelsDevPricing();
    expect(vi.mocked(configManager.setProviderPricing).mock.calls.length).toBe(firstCallCount);
  });

  it('does nothing when fetch fails', async () => {
    const { configManager } = await import('@/lib/config/storage');
    vi.mocked(configManager.setProviderPricing).mockClear();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const { ensureModelsDevPricing } = await import('../models-dev');

    await ensureModelsDevPricing();

    expect(configManager.setProviderPricing).not.toHaveBeenCalled();
  });
});

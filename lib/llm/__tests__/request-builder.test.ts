import { describe, it, expect } from 'vitest';
import { getApiEndpoint, buildHeaders, resolveTemperature } from '@/lib/llm/request-builder';
import { getProvider } from '@/lib/llm/providers/registry';

describe('getApiEndpoint', () => {
  it('opencode-go + minimax model + anthropic wire → /messages on opencode-go base URL', () => {
    const result = getApiEndpoint('opencode-go', getProvider('opencode-go'), 'minimax-m2.7', {}, undefined, 'anthropic');
    expect(result).toBe('https://opencode.ai/zen/go/v1/messages');
  });

  it('anthropic provider + anthropic wire → api.anthropic.com/v1/messages', () => {
    const result = getApiEndpoint('anthropic', getProvider('anthropic'), 'claude-x', {}, undefined, 'anthropic');
    expect(result).toBe('https://api.anthropic.com/v1/messages');
  });

  it('opencode-go + glm model + openai wire → /chat/completions on opencode-go base URL', () => {
    const result = getApiEndpoint('opencode-go', getProvider('opencode-go'), 'glm-5.2', {}, undefined, 'openai');
    expect(result).toBe('https://opencode.ai/zen/go/v1/chat/completions');
  });
});

describe('buildHeaders', () => {
  it('opencode-go + anthropic wire → x-api-key and anthropic-version, no anthropic-beta', () => {
    const headers = buildHeaders('opencode-go', 'sk-x', null, getProvider('opencode-go'), 'anthropic');
    expect(headers['x-api-key']).toBe('sk-x');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-beta']).toBeUndefined();
  });

  it('anthropic provider + anthropic wire → x-api-key AND anthropic-beta (supportsFunctions=true)', () => {
    const config = getProvider('anthropic');
    expect(config.supportsFunctions).toBe(true); // guard assertion
    const headers = buildHeaders('anthropic', 'sk-x', null, config, 'anthropic');
    expect(headers['x-api-key']).toBe('sk-x');
    expect(headers['anthropic-beta']).toBe('tools-2024-04-04');
  });

  it('opencode-go + openai wire → Authorization Bearer, no x-api-key', () => {
    const headers = buildHeaders('opencode-go', 'sk-x', null, getProvider('opencode-go'), 'openai');
    expect(headers['Authorization']).toBe('Bearer sk-x');
    expect(headers['x-api-key']).toBeUndefined();
  });
});

describe('buildHeaders custom headers', () => {
  const custom = getProvider('some-unregistered-custom-id');

  it('forwards a configured header alongside the Bearer token', () => {
    const headers = buildHeaders('some-unregistered-custom-id', 'sk-x', null, custom, 'openai', { 'X-Tenant': 'acme' });
    expect(headers['Authorization']).toBe('Bearer sk-x');
    expect(headers['X-Tenant']).toBe('acme');
  });

  it('sends nothing extra when none are configured (the existing Bearer-only path)', () => {
    const headers = buildHeaders('some-unregistered-custom-id', 'sk-x', null, custom, 'openai');
    expect(headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer sk-x' });
  });

  it('keeps the API key when a configured header also claims Authorization', () => {
    // Precedence: the token field owns the header, so a second source cannot displace it.
    const headers = buildHeaders('some-unregistered-custom-id', 'sk-x', null, custom, 'openai', {
      Authorization: 'Bearer other',
      'X-Tenant': 'acme',
    });
    expect(headers['Authorization']).toBe('Bearer sk-x');
    expect(headers['X-Tenant']).toBe('acme');
  });

  it('does not let a configured header replace Content-Type', () => {
    const headers = buildHeaders('some-unregistered-custom-id', 'sk-x', null, custom, 'openai', {
      'Content-Type': 'text/plain',
    });
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('drops a rejected name rather than passing it to fetch', () => {
    const headers = buildHeaders('some-unregistered-custom-id', undefined, null, custom, 'openai', {
      Host: 'evil.example',
      Connection: 'keep-alive',
      'X-Tenant': 'acme',
    });
    expect(headers['Host']).toBeUndefined();
    expect(headers['Connection']).toBeUndefined();
    expect(headers['X-Tenant']).toBe('acme');
  });
});

describe('resolveTemperature', () => {
  it('opencode-go + kimi- model → 1', () => {
    expect(resolveTemperature('opencode-go', 'kimi-k2.7-code')).toBe(1);
  });

  it('opencode-go + non-kimi model → 0.7', () => {
    expect(resolveTemperature('opencode-go', 'glm-5.2')).toBe(0.7);
  });

  it('openai + gpt-5-nano → 1', () => {
    expect(resolveTemperature('openai', 'gpt-5-nano')).toBe(1);
  });

  it('anthropic + claude-x → 0.7', () => {
    expect(resolveTemperature('anthropic', 'claude-x')).toBe(0.7);
  });
});

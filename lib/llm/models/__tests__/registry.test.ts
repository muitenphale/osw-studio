import { describe, it, expect } from 'vitest';
import { BUILT_IN_MODEL_TEMPLATES, isBuiltInTemplateId } from '@/lib/llm/models/registry';

describe('BUILT_IN_MODEL_TEMPLATES', () => {
  it('every preset has a valid, well-formed shape', () => {
    expect(BUILT_IN_MODEL_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of BUILT_IN_MODEL_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.builtin).toBe(true);
      expect(t.description).toBeTruthy();
      // Agent is required and must be a concrete model ref.
      expect(t.assignment.agent.provider).toBeTruthy();
      expect(t.assignment.agent.model).toBeTruthy();
      // Optional slots are either off, a ref, or a valid sentinel.
      const img = t.assignment.imageGen;
      expect(img === null || (typeof img === 'object' && !!img.model) || img === 'agent').toBe(true);
      const voice = t.assignment.voiceInput;
      expect(voice === null || voice === 'browser' || voice === 'agent' || (typeof voice === 'object' && !!voice.model)).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = BUILT_IN_MODEL_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('isBuiltInTemplateId matches registry ids only', () => {
    for (const t of BUILT_IN_MODEL_TEMPLATES) expect(isBuiltInTemplateId(t.id)).toBe(true);
    expect(isBuiltInTemplateId('default')).toBe(false);
    expect(isBuiltInTemplateId('t1')).toBe(false);
  });
});

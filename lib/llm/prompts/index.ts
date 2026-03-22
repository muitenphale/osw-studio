import type { ProjectRuntime } from '@/lib/vfs/types';
import { HANDLEBARS_DOMAIN_PROMPT } from './handlebars';
import { STATIC_DOMAIN_PROMPT } from './static';
import { REACT_DOMAIN_PROMPT } from './react';
import { PREACT_DOMAIN_PROMPT } from './preact';
import { SVELTE_DOMAIN_PROMPT } from './svelte';
import { VUE_DOMAIN_PROMPT } from './vue';
import { PYTHON_DOMAIN_PROMPT } from './python';
import { LUA_DOMAIN_PROMPT } from './lua';

const ALL_DOMAIN_PROMPTS: readonly string[] = [
  HANDLEBARS_DOMAIN_PROMPT,
  STATIC_DOMAIN_PROMPT,
  REACT_DOMAIN_PROMPT,
  PREACT_DOMAIN_PROMPT,
  SVELTE_DOMAIN_PROMPT,
  VUE_DOMAIN_PROMPT,
  PYTHON_DOMAIN_PROMPT,
  LUA_DOMAIN_PROMPT,
];

export function getDomainPrompt(runtime: ProjectRuntime): string {
  switch (runtime) {
    case 'handlebars':
      return HANDLEBARS_DOMAIN_PROMPT;
    case 'react':
      return REACT_DOMAIN_PROMPT;
    case 'preact':
      return PREACT_DOMAIN_PROMPT;
    case 'svelte':
      return SVELTE_DOMAIN_PROMPT;
    case 'vue':
      return VUE_DOMAIN_PROMPT;
    case 'python':
      return PYTHON_DOMAIN_PROMPT;
    case 'lua':
      return LUA_DOMAIN_PROMPT;
    case 'static':
    default:
      return STATIC_DOMAIN_PROMPT;
  }
}

/**
 * Check if a .PROMPT.md content is one of the built-in default prompts.
 * Used to determine if we can silently replace it on runtime change.
 */
export function isDefaultDomainPrompt(content: string): boolean {
  const trimmed = content.trim();
  return ALL_DOMAIN_PROMPTS.some(p => p.trim() === trimmed);
}

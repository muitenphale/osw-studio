import type { ProjectRuntime } from '@/lib/vfs/types';
import { HANDLEBARS_DOMAIN_PROMPT } from './handlebars';
import { STATIC_DOMAIN_PROMPT } from './static';
import { REACT_DOMAIN_PROMPT } from './react';
import { PREACT_DOMAIN_PROMPT } from './preact';
import { SVELTE_DOMAIN_PROMPT } from './svelte';
import { VUE_DOMAIN_PROMPT } from './vue';
import { PYTHON_DOMAIN_PROMPT } from './python';
import { LUA_DOMAIN_PROMPT } from './lua';

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

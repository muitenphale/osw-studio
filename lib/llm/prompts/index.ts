import type { ProjectRuntime } from '@/lib/vfs/types';
import { WEBSITE_DOMAIN_PROMPT } from './website';
import { REACT_DOMAIN_PROMPT } from './react';
import { PREACT_DOMAIN_PROMPT } from './preact';
import { SVELTE_DOMAIN_PROMPT } from './svelte';
import { VUE_DOMAIN_PROMPT } from './vue';

export function getDomainPrompt(runtime: ProjectRuntime): string {
  switch (runtime) {
    case 'react':
      return REACT_DOMAIN_PROMPT;
    case 'preact':
      return PREACT_DOMAIN_PROMPT;
    case 'svelte':
      return SVELTE_DOMAIN_PROMPT;
    case 'vue':
      return VUE_DOMAIN_PROMPT;
    case 'static':
    default:
      return WEBSITE_DOMAIN_PROMPT;
  }
}

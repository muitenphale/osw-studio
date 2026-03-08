import type { ProjectRuntime } from '@/lib/vfs/types';
import { WEBSITE_DOMAIN_PROMPT } from './website';
import { REACT_DOMAIN_PROMPT } from './react';

/**
 * Returns the domain prompt for a given project runtime.
 * Used when creating empty projects (no template) to seed .PROMPT.md.
 */
export function getDomainPrompt(runtime: ProjectRuntime): string {
  switch (runtime) {
    case 'react':
      return REACT_DOMAIN_PROMPT;
    case 'static':
    default:
      return WEBSITE_DOMAIN_PROMPT;
  }
}

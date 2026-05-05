/**
 * Built-in Skills Registry
 * Central registry for all built-in skills
 */

import { BuiltInSkillDefinition, BuiltInGroupDefinition } from './types';
import { WORKFLOW_SKILL } from './built-in/workflow';
import { RESPONSIVE_SKILL } from './built-in/responsive';
import { HANDLEBARS_ADVANCED_SKILL } from './built-in/handlebars-advanced';
import { ACCESSIBILITY_SKILL } from './built-in/accessibility';
import { SERVER_SKILL } from './built-in/server';
import { FUNCTIONS_SKILL } from './built-in/functions';
import { DATABASE_SKILL } from './built-in/database';
import { SECRETS_SKILL } from './built-in/secrets';
import { FRONTEND_DESIGN_SKILL } from './built-in/frontend-design';
import { FRONTEND_DESIGN_BOLD_GEOMETRIC_SKILL } from './built-in/frontend-design-bold-geometric';
import { FRONTEND_DESIGN_SOFT_ORGANIC_SKILL } from './built-in/frontend-design-soft-organic';
import { FRONTEND_DESIGN_EDITORIAL_SKILL } from './built-in/frontend-design-editorial';
import { FRONTEND_DESIGN_MINIMAL_SKILL } from './built-in/frontend-design-minimal';
import { FRONTEND_DESIGN_BRUTALIST_SKILL } from './built-in/frontend-design-brutalist';
import { FRONTEND_DESIGN_RETRO_FUTURISTIC_SKILL } from './built-in/frontend-design-retro-futuristic';
import { FRONTEND_DESIGN_ART_DECO_SKILL } from './built-in/frontend-design-art-deco';
import { FRONTEND_DESIGN_MAXIMALIST_SKILL } from './built-in/frontend-design-maximalist';
import { FRONTEND_DESIGN_PLAYFUL_SKILL } from './built-in/frontend-design-playful';
import { FRONTEND_DESIGN_INDUSTRIAL_SKILL } from './built-in/frontend-design-industrial';
import { FRONTEND_DESIGN_LUXURY_SKILL } from './built-in/frontend-design-luxury';
import { FRONTEND_DESIGN_TERMINAL_SKILL } from './built-in/frontend-design-terminal';

/**
 * Registry of all built-in skills
 * Skills are hardcoded as strings (like templates) to avoid build-time imports
 */
export const BUILT_IN_SKILLS: BuiltInSkillDefinition[] = [
  {
    id: 'workflow',
    content: WORKFLOW_SKILL
  },
  {
    id: 'responsive',
    content: RESPONSIVE_SKILL
  },
  {
    id: 'handlebars-advanced',
    content: HANDLEBARS_ADVANCED_SKILL
  },
  {
    id: 'accessibility',
    content: ACCESSIBILITY_SKILL
  },
  {
    id: 'server',
    content: SERVER_SKILL
  },
  {
    id: 'functions',
    content: FUNCTIONS_SKILL
  },
  {
    id: 'database',
    content: DATABASE_SKILL
  },
  {
    id: 'secrets',
    content: SECRETS_SKILL
  },
  {
    id: 'frontend-design',
    content: FRONTEND_DESIGN_SKILL
  },
  {
    id: 'frontend-design-bold-geometric',
    content: FRONTEND_DESIGN_BOLD_GEOMETRIC_SKILL
  },
  {
    id: 'frontend-design-soft-organic',
    content: FRONTEND_DESIGN_SOFT_ORGANIC_SKILL
  },
  {
    id: 'frontend-design-editorial',
    content: FRONTEND_DESIGN_EDITORIAL_SKILL
  },
  {
    id: 'frontend-design-minimal',
    content: FRONTEND_DESIGN_MINIMAL_SKILL
  },
  {
    id: 'frontend-design-brutalist',
    content: FRONTEND_DESIGN_BRUTALIST_SKILL
  },
  {
    id: 'frontend-design-retro-futuristic',
    content: FRONTEND_DESIGN_RETRO_FUTURISTIC_SKILL
  },
  {
    id: 'frontend-design-art-deco',
    content: FRONTEND_DESIGN_ART_DECO_SKILL
  },
  {
    id: 'frontend-design-maximalist',
    content: FRONTEND_DESIGN_MAXIMALIST_SKILL
  },
  {
    id: 'frontend-design-playful',
    content: FRONTEND_DESIGN_PLAYFUL_SKILL
  },
  {
    id: 'frontend-design-industrial',
    content: FRONTEND_DESIGN_INDUSTRIAL_SKILL
  },
  {
    id: 'frontend-design-luxury',
    content: FRONTEND_DESIGN_LUXURY_SKILL
  },
  {
    id: 'frontend-design-terminal',
    content: FRONTEND_DESIGN_TERMINAL_SKILL
  }
];

/**
 * Built-in skill groups
 * Groups bulk-toggle multiple skills. Membership is fixed; the group's
 * enabled state is user-controlled.
 */
export const BUILT_IN_GROUPS: BuiltInGroupDefinition[] = [
  {
    id: 'frontend-design',
    name: 'Frontend Design',
    description: 'Design philosophy hub plus 12 aesthetic sub-skills (bold-geometric, soft-organic, editorial, minimal, brutalist, retro-futuristic, art-deco, maximalist, playful, industrial, luxury, terminal).',
    memberIds: [
      'frontend-design',
      'frontend-design-bold-geometric',
      'frontend-design-soft-organic',
      'frontend-design-editorial',
      'frontend-design-minimal',
      'frontend-design-brutalist',
      'frontend-design-retro-futuristic',
      'frontend-design-art-deco',
      'frontend-design-maximalist',
      'frontend-design-playful',
      'frontend-design-industrial',
      'frontend-design-luxury',
      'frontend-design-terminal',
    ],
  },
  {
    id: 'server-mode',
    name: 'Server Mode',
    description: 'Backend capabilities for hosted deployments — edge functions, SQLite, encrypted secrets. Disable for browser-only projects.',
    memberIds: ['server', 'functions', 'database', 'secrets'],
  },
  {
    id: 'web-standards',
    name: 'Web Standards',
    description: 'Cross-cutting concerns when delivering HTML to browsers — mobile layouts and WCAG compliance. Independent of visual aesthetics.',
    memberIds: ['responsive', 'accessibility'],
  },
];

/**
 * Get a built-in skill by ID
 */
export function getBuiltInSkill(id: string): BuiltInSkillDefinition | undefined {
  return BUILT_IN_SKILLS.find(skill => skill.id === id);
}

/**
 * Get all built-in skill IDs
 */
export function getBuiltInSkillIds(): string[] {
  return BUILT_IN_SKILLS.map(skill => skill.id);
}

/**
 * Get a built-in group by ID
 */
export function getBuiltInGroup(id: string): BuiltInGroupDefinition | undefined {
  return BUILT_IN_GROUPS.find(g => g.id === id);
}

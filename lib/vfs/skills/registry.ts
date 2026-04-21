/**
 * Built-in Skills Registry
 * Central registry for all built-in skills
 */

import { BuiltInSkillDefinition } from './types';
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
  }
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

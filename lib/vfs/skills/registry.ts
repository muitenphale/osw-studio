/**
 * Built-in Skills Registry
 * Central registry for all built-in skills
 */

import { BuiltInSkillDefinition } from './types';
import { OSW_PLANNING_SKILL } from './built-in/osw-planning';
import { OSW_ONE_SHOT_SKILL } from './built-in/osw-one-shot';
import { HANDLEBARS_ADVANCED_SKILL } from './built-in/handlebars-advanced';
import { ACCESSIBILITY_SKILL } from './built-in/accessibility';
import { SERVER_SKILL } from './built-in/server';
import { FUNCTIONS_SKILL } from './built-in/functions';
import { DATABASE_SKILL } from './built-in/database';
import { SECRETS_SKILL } from './built-in/secrets';

/**
 * Registry of all built-in skills
 * Skills are hardcoded as strings (like templates) to avoid build-time imports
 */
export const BUILT_IN_SKILLS: BuiltInSkillDefinition[] = [
  {
    id: 'osw-planning',
    content: OSW_PLANNING_SKILL
  },
  {
    id: 'osw-one-shot',
    content: OSW_ONE_SHOT_SKILL
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

/**
 * Built-in Skills Registry
 * Central registry for all built-in skills
 */

import { BuiltInSkillDefinition } from './types';
import { OSW_WORKFLOW_SKILL } from './built-in/osw-workflow';
import { HANDLEBARS_ADVANCED_SKILL } from './built-in/handlebars-advanced';
import { ACCESSIBILITY_SKILL } from './built-in/accessibility';

/**
 * Registry of all built-in skills
 * Skills are hardcoded as strings (like templates) to avoid build-time imports
 */
export const BUILT_IN_SKILLS: BuiltInSkillDefinition[] = [
  {
    id: 'osw-workflow',
    content: OSW_WORKFLOW_SKILL
  },
  {
    id: 'handlebars-advanced',
    content: HANDLEBARS_ADVANCED_SKILL
  },
  {
    id: 'accessibility',
    content: ACCESSIBILITY_SKILL
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

/**
 * Skills Service - Manages skill CRUD operations
 * Skills are stored in localStorage (custom) and loaded from built-in registry
 */

import { Skill, SkillMetadata } from './types';
import { parseSkillFile } from './parser';
import { BUILT_IN_SKILLS } from './registry';
import { logger } from '@/lib/utils';
import JSZip from 'jszip';

const CUSTOM_SKILLS_KEY = 'osw_custom_skills';
const ENABLED_STATE_KEY = 'osw_skills_enabled_state';

interface EnabledState {
  globalEnabled: boolean;
  skillEvaluationEnabled: boolean;
  disabledSkills: Set<string>; // IDs of disabled skills
}

/**
 * Skills Service - Global singleton
 */
class SkillsService {
  private customSkills: Map<string, Skill> = new Map();
  private initialized = false;
  private enabledState: EnabledState = {
    globalEnabled: true,
    skillEvaluationEnabled: false,
    disabledSkills: new Set(),
  };

  /**
   * Initialize the service - load custom skills and enabled state from localStorage
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load custom skills
      const stored = localStorage.getItem(CUSTOM_SKILLS_KEY);
      if (stored) {
        const skills: Skill[] = JSON.parse(stored);
        skills.forEach(skill => {
          // Restore Date objects
          skill.createdAt = new Date(skill.createdAt);
          skill.updatedAt = new Date(skill.updatedAt);
          this.customSkills.set(skill.id, skill);
        });
      }

      // Load enabled state
      const enabledStateStored = localStorage.getItem(ENABLED_STATE_KEY);
      if (enabledStateStored) {
        const state = JSON.parse(enabledStateStored);
        this.enabledState = {
          globalEnabled: state.globalEnabled ?? true,
          skillEvaluationEnabled: state.skillEvaluationEnabled ?? false,
          disabledSkills: new Set(state.disabledSkills || []),
        };
      }

      this.initialized = true;
      logger.info(`[SkillsService] Loaded ${this.customSkills.size} custom skills`);
    } catch (error) {
      logger.error('[SkillsService] Failed to load custom skills', error);
    }
  }

  /**
   * Persist custom skills to localStorage
   */
  private saveCustomSkills(): void {
    try {
      const skills = Array.from(this.customSkills.values());
      localStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(skills));
    } catch (error) {
      logger.error('[SkillsService] Failed to save custom skills', error);
      throw new Error('Failed to save skills');
    }
  }

  /**
   * Persist enabled state to localStorage
   */
  private saveEnabledState(): void {
    try {
      const state = {
        globalEnabled: this.enabledState.globalEnabled,
        skillEvaluationEnabled: this.enabledState.skillEvaluationEnabled,
        disabledSkills: Array.from(this.enabledState.disabledSkills),
      };
      localStorage.setItem(ENABLED_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      logger.error('[SkillsService] Failed to save enabled state', error);
    }
  }

  /**
   * Get all skills (built-in + custom)
   */
  async getAllSkills(): Promise<Skill[]> {
    await this.init();

    const skills: Skill[] = [];

    // Add built-in skills
    for (const builtIn of BUILT_IN_SKILLS) {
      try {
        const { frontmatter, markdown } = parseSkillFile(builtIn.content);
        skills.push({
          id: builtIn.id,
          name: frontmatter.name,
          description: frontmatter.description,
          content: builtIn.content,
          markdown,
          isBuiltIn: true,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        });
      } catch (error) {
        logger.error(`[SkillsService] Failed to parse built-in skill: ${builtIn.id}`, error);
      }
    }

    // Add custom skills
    skills.push(...Array.from(this.customSkills.values()));

    return skills;
  }

  /**
   * Get skill metadata for system prompt (lightweight)
   */
  async getSkillsMetadata(): Promise<SkillMetadata[]> {
    const skills = await this.getAllSkills();
    return skills.map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      path: `/.skills/${skill.id}.md`,
      isBuiltIn: skill.isBuiltIn,
    }));
  }

  /**
   * Get a single skill by ID
   */
  async getSkill(id: string): Promise<Skill | null> {
    await this.init();

    // Check custom skills first
    const customSkill = this.customSkills.get(id);
    if (customSkill) return customSkill;

    // Check built-in skills
    const builtInSkill = BUILT_IN_SKILLS.find(s => s.id === id);
    if (builtInSkill) {
      try {
        const { frontmatter, markdown } = parseSkillFile(builtInSkill.content);
        return {
          id: builtInSkill.id,
          name: frontmatter.name,
          description: frontmatter.description,
          content: builtInSkill.content,
          markdown,
          isBuiltIn: true,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        };
      } catch (error) {
        logger.error(`[SkillsService] Failed to parse built-in skill: ${id}`, error);
      }
    }

    return null;
  }

  /**
   * Create a new custom skill from SKILL.md content
   */
  async createSkill(content: string): Promise<Skill> {
    await this.init();

    try {
      const { frontmatter, markdown } = parseSkillFile(content);
      const id = frontmatter.name; // Use name as ID

      // Check if skill already exists
      if (this.customSkills.has(id) || BUILT_IN_SKILLS.some(s => s.id === id)) {
        throw new Error(`Skill with name "${id}" already exists`);
      }

      const skill: Skill = {
        id,
        name: frontmatter.name,
        description: frontmatter.description,
        content,
        markdown,
        isBuiltIn: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.customSkills.set(id, skill);
      this.saveCustomSkills();

      logger.info(`[SkillsService] Created skill: ${id}`);
      return skill;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to create skill');
    }
  }

  /**
   * Update an existing custom skill
   */
  async updateSkill(id: string, content: string): Promise<Skill> {
    await this.init();

    const existingSkill = this.customSkills.get(id);
    if (!existingSkill) {
      throw new Error(`Skill "${id}" not found`);
    }

    if (existingSkill.isBuiltIn) {
      throw new Error('Cannot update built-in skills');
    }

    try {
      const { frontmatter, markdown } = parseSkillFile(content);

      // If name changed, this is a new skill
      if (frontmatter.name !== id) {
        throw new Error('Skill name cannot be changed. Create a new skill instead.');
      }

      const updatedSkill: Skill = {
        ...existingSkill,
        name: frontmatter.name,
        description: frontmatter.description,
        content,
        markdown,
        updatedAt: new Date(),
      };

      this.customSkills.set(id, updatedSkill);
      this.saveCustomSkills();

      logger.info(`[SkillsService] Updated skill: ${id}`);
      return updatedSkill;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to update skill');
    }
  }

  /**
   * Delete a custom skill
   */
  async deleteSkill(id: string): Promise<void> {
    await this.init();

    const skill = this.customSkills.get(id);
    if (!skill) {
      throw new Error(`Skill "${id}" not found`);
    }

    if (skill.isBuiltIn) {
      throw new Error('Cannot delete built-in skills');
    }

    this.customSkills.delete(id);
    this.saveCustomSkills();

    logger.info(`[SkillsService] Deleted skill: ${id}`);
  }

  /**
   * Import skills from a ZIP file
   */
  async importSkills(zipBlob: Blob): Promise<Skill[]> {
    await this.init();

    const importedSkills: Skill[] = [];

    try {
      const zip = await JSZip.loadAsync(zipBlob);

      for (const [filename, file] of Object.entries(zip.files)) {
        if (file.dir) continue;
        if (!filename.endsWith('.md')) continue;

        const content = await file.async('string');

        try {
          const skill = await this.createSkill(content);
          importedSkills.push(skill);
        } catch (error) {
          logger.warn(`[SkillsService] Failed to import ${filename}:`, error);
          // Continue importing other skills
        }
      }

      logger.info(`[SkillsService] Imported ${importedSkills.length} skills`);
      return importedSkills;
    } catch (error) {
      logger.error('[SkillsService] Failed to import skills', error);
      throw new Error('Failed to import skills');
    }
  }

  /**
   * Import a single skill from .md file
   */
  async importSkillFile(file: File): Promise<Skill> {
    const content = await file.text();
    return this.createSkill(content);
  }

  /**
   * Export skills as a ZIP file
   */
  async exportSkills(skillIds: string[]): Promise<Blob> {
    await this.init();

    const zip = new JSZip();

    for (const id of skillIds) {
      const skill = await this.getSkill(id);
      if (!skill) {
        logger.warn(`[SkillsService] Skill not found for export: ${id}`);
        continue;
      }

      zip.file(`${skill.id}.md`, skill.content);
    }

    logger.info(`[SkillsService] Exported ${skillIds.length} skills`);
    return await zip.generateAsync({ type: 'blob' });
  }

  /**
   * Clear all custom skills (for testing/reset)
   */
  async clearCustomSkills(): Promise<void> {
    this.customSkills.clear();
    localStorage.removeItem(CUSTOM_SKILLS_KEY);
    logger.info('[SkillsService] Cleared all custom skills');
  }

  // ============================================
  // Enable/Disable Management
  // ============================================

  /**
   * Check if skills system is globally enabled
   */
  async isGloballyEnabled(): Promise<boolean> {
    await this.init();
    return this.enabledState.globalEnabled;
  }

  /**
   * Set global enabled state for skills system
   */
  async setGlobalEnabled(enabled: boolean): Promise<void> {
    await this.init();
    this.enabledState.globalEnabled = enabled;
    this.saveEnabledState();
    logger.info(`[SkillsService] Global enabled set to: ${enabled}`);
  }

  /**
   * Check if skill evaluation pre-flight is enabled
   */
  async isEvaluationEnabled(): Promise<boolean> {
    await this.init();
    return this.enabledState.globalEnabled && this.enabledState.skillEvaluationEnabled;
  }

  /**
   * Set skill evaluation pre-flight enabled state
   */
  async setEvaluationEnabled(enabled: boolean): Promise<void> {
    await this.init();
    this.enabledState.skillEvaluationEnabled = enabled;
    this.saveEnabledState();
    logger.info(`[SkillsService] Skill evaluation set to: ${enabled}`);
  }

  /**
   * Check if a specific skill is enabled
   */
  async isSkillEnabled(skillId: string): Promise<boolean> {
    await this.init();
    if (!this.enabledState.globalEnabled) return false;
    return !this.enabledState.disabledSkills.has(skillId);
  }

  /**
   * Enable a specific skill
   */
  async enableSkill(skillId: string): Promise<void> {
    await this.init();
    this.enabledState.disabledSkills.delete(skillId);
    this.saveEnabledState();
    logger.info(`[SkillsService] Enabled skill: ${skillId}`);
  }

  /**
   * Disable a specific skill
   */
  async disableSkill(skillId: string): Promise<void> {
    await this.init();
    this.enabledState.disabledSkills.add(skillId);
    this.saveEnabledState();
    logger.info(`[SkillsService] Disabled skill: ${skillId}`);
  }

  /**
   * Get only enabled skills (respects global and per-skill settings)
   */
  async getEnabledSkills(): Promise<Skill[]> {
    await this.init();

    // If globally disabled, return empty array
    if (!this.enabledState.globalEnabled) {
      return [];
    }

    // Get all skills and filter by enabled state
    const allSkills = await this.getAllSkills();
    return allSkills.filter(skill => !this.enabledState.disabledSkills.has(skill.id));
  }

  /**
   * Get enabled skills metadata for system prompt (lightweight)
   */
  async getEnabledSkillsMetadata(): Promise<SkillMetadata[]> {
    const enabledSkills = await this.getEnabledSkills();
    return enabledSkills.map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      path: `/.skills/${skill.id}.md`,
      isBuiltIn: skill.isBuiltIn,
    }));
  }

  // ============================================
  // Sync Support (Server Mode)
  // ============================================

  /**
   * Get all custom skills (for sync)
   */
  async getCustomSkills(): Promise<Skill[]> {
    await this.init();
    return Array.from(this.customSkills.values());
  }

  /**
   * Update a skill's sync metadata after successful sync
   */
  async updateSyncMetadata(skillId: string, lastSyncedAt: Date, serverUpdatedAt: Date): Promise<void> {
    await this.init();

    const skill = this.customSkills.get(skillId);
    if (!skill || skill.isBuiltIn) return;

    const updatedSkill: Skill = {
      ...skill,
      lastSyncedAt,
      serverUpdatedAt,
    };

    this.customSkills.set(skillId, updatedSkill);
    this.saveCustomSkills();

    logger.info(`[SkillsService] Updated sync metadata for skill: ${skillId}`);
  }

  /**
   * Import a skill from server (pull)
   * Creates or updates local skill with server data
   */
  async importFromServer(serverSkill: Skill): Promise<void> {
    await this.init();

    // Restore Date objects
    const skill: Skill = {
      ...serverSkill,
      createdAt: new Date(serverSkill.createdAt),
      updatedAt: new Date(serverSkill.updatedAt),
      lastSyncedAt: new Date(),
      serverUpdatedAt: new Date(serverSkill.updatedAt),
      isBuiltIn: false,
    };

    this.customSkills.set(skill.id, skill);
    this.saveCustomSkills();

    logger.info(`[SkillsService] Imported skill from server: ${skill.id}`);
  }

  /**
   * Check if a skill exists locally
   */
  async hasSkill(id: string): Promise<boolean> {
    await this.init();
    return this.customSkills.has(id) || BUILT_IN_SKILLS.some(s => s.id === id);
  }
}

// Export singleton instance
export const skillsService = new SkillsService();

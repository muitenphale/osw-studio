/**
 * Agent Skills Type Definitions
 * Follows Anthropic SKILL.md conventions with YAML frontmatter
 */

/**
 * YAML frontmatter metadata from SKILL.md files
 */
export interface SkillFrontmatter {
  name: string;           // Skill identifier (lowercase, hyphens)
  description: string;    // What the skill does and when to use it
  license?: string;       // Optional license information
  [key: string]: unknown; // Allow additional custom fields
}

/**
 * Parsed skill with metadata and content
 */
export interface Skill {
  id: string;            // Unique identifier (same as name from frontmatter)
  name: string;          // Display name from frontmatter
  description: string;   // Description from frontmatter
  content: string;       // Full SKILL.md content (including frontmatter)
  markdown: string;      // Markdown content only (without frontmatter)
  isBuiltIn: boolean;    // Whether this is a built-in skill
  createdAt: Date;
  updatedAt: Date;
  // Sync metadata (Server Mode)
  lastSyncedAt?: Date | null;      // When skill was last synced with server
  serverUpdatedAt?: Date | null;   // Server's updatedAt timestamp
}

/**
 * Skill metadata for system prompt (lightweight)
 */
export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  path: string;          // VFS path: /.skills/{id}.md
  isBuiltIn: boolean;
}

/**
 * Built-in skill definition (before parsing)
 */
export interface BuiltInSkillDefinition {
  id: string;
  content: string;       // Raw SKILL.md content
}

/**
 * A skill group bundles multiple skills under one bulk-toggle.
 * A skill is active if it is individually enabled OR belongs to at least one enabled group.
 */
export interface SkillGroup {
  id: string;
  name: string;
  description?: string;
  memberIds: string[];    // skill IDs
  isBuiltIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Built-in group definition (before instantiation)
 */
export interface BuiltInGroupDefinition {
  id: string;
  name: string;
  description?: string;
  memberIds: string[];
}

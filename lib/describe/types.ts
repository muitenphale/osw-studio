/**
 * Project Brief — canonical schema for the Describe-mode setup flow.
 *
 * Filled progressively as the setup agent converses with the user.
 * Serialized into .PROMPT.md when the project is created.
 */

import type { ProjectRuntime } from '@/lib/vfs/types';

// --- Brief schema ---

export interface ProjectBrief {
  /** Project name (1–50 chars). */
  name?: string;

  /** Semantic project type — what the user is building, not a technical category. */
  type?: string;

  /** Page list for website-type projects. */
  pages?: string[];

  /** CSS framework / styling approach. */
  styling?: BriefStyling;

  /** Server-side capabilities inferred from user's stated needs. */
  capabilities?: BriefCapabilities;

  /** Tone, vibe, aesthetic direction — freeform. */
  direction?: string;

  /** Runtime engine. Usually inferred by the agent. */
  runtime?: ProjectRuntime;

  /** VFS template ID to scaffold from (e.g. 'blank', 'contact-landing'). */
  template?: string;

  /** Open-ended notes that don't fit other fields. */
  notes?: string;

  /** LLMs may add fields not in this schema — preserve them. */
  [key: string]: unknown;
}

export type BriefStyling = 'tailwind' | 'pure-css' | 'bulma' | 'bootstrap' | string;

export interface BriefCapabilities {
  /** Needs server/edge functions (contact form, API, etc.). */
  serverFunctions?: boolean;
  /** Needs a database. */
  database?: boolean;
  /** Needs user authentication. */
  auth?: boolean;
  /** Needs scheduled tasks. */
  scheduledTasks?: boolean;
  /** Freeform capability notes the schema doesn't cover. */
  other?: string[];
  /** LLMs may add capabilities not in this schema — preserve them. */
  [key: string]: unknown;
}

// --- Pending decisions tracker ---

export interface PendingDecision {
  /** Short label (e.g. "Project name", "Typography"). */
  label: string;
}

// --- Spec sections (substantive context for .DESIGN.md) ---

export interface SpecSection {
  /** Section heading (e.g. "Target audience", "Content"). */
  heading: string;
  /** Prose content under this heading. */
  content: string;
}

// --- Brief state (includes metadata the sidebar needs) ---

export interface BriefState {
  brief: ProjectBrief;
  pending: PendingDecision[];
  /** Approximate total decisions the agent is tracking. */
  totalDecisions: number;
  /** How many have been resolved. */
  resolvedCount: number;
  /** Accumulated spec sections for .DESIGN.md. */
  spec: SpecSection[];
}

/** Check if the brief has the minimum required fields for project creation. */
export function isBriefReady(brief: ProjectBrief): boolean {
  return !!(brief.name && brief.runtime && brief.template);
}

/** Initial empty state. */
export function createEmptyBriefState(): BriefState {
  return {
    brief: {},
    pending: [],
    totalDecisions: 0,
    resolvedCount: 0,
    spec: [],
  };
}

import type { TemplateIntent } from '../types';

/** The heading shown above a group of templates, and the order the groups appear in. */
export interface TemplateIntentConfig {
  id: TemplateIntent;
  label: string;
  /** One line under the heading, saying what belongs here. */
  description: string;
  /**
   * Closed the first time someone opens the list, before they have expressed a preference.
   *
   * Only the starting point: once a section is opened or closed by hand, that choice is stored and
   * this is not consulted again.
   */
  collapsedByDefault?: boolean;
}

/**
 * The sections of the template list, in the order they are shown.
 *
 * Ordered by how far someone has already decided what they are making, running from the empty
 * projects through publishing to building. A section with nothing in it is not drawn, so adding an
 * intent here before any template uses it costs nothing.
 */
export const TEMPLATE_INTENTS: TemplateIntentConfig[] = [
  {
    id: 'starter',
    label: 'Runtime starters',
    description: 'The smallest working setup for a runtime, from plain HTML to Svelte or Python',
    // First but closed. These are the starting points rather than a description of what you are
    // making, so they would otherwise be eight rows in front of every section that says what it
    // makes. A closed section still reports when the current pick is inside it.
    collapsedByDefault: true,
  },
  {
    id: 'website',
    label: 'Website',
    description: 'Pages you publish and people read: portfolios, blogs, documentation',
  },
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Files you keep working in: notes, research, reference, writing',
  },
  {
    id: 'app',
    label: 'App',
    description: 'Something people use: forms, inboxes, tools with a backend behind them',
  },
  {
    id: 'project-kit',
    label: 'Project Kit',
    description: 'Scaffolds you export and run elsewhere',
  },
];

/**
 * Where a template with no declared intent is listed.
 *
 * Only custom templates reach this: every built-in declares one. An imported template says nothing
 * about what it is for, and guessing from its files would put it under a heading its author never
 * chose, so they are grouped by where they came from instead.
 */
export const UNCATEGORIZED_LABEL = 'Your templates';
export const UNCATEGORIZED_DESCRIPTION = 'Imported templates, which do not say what they are for';

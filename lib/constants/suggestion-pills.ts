export interface SuggestionPill { id: string; label: string; prompt: string }

/**
 * How many starters sit on the row above the composer. The rest go behind an overflow menu:
 * the row is directly above the input, so it must not grow enough to push it down.
 */
export const INLINE_SUGGESTION_COUNT = 3;

// Fast first-task starters shown above the composer: a single-page build, a multi-page build,
// and one that configures the workspace for a goal (custom runtime + CDN stack + .PROMPT.md),
// which shows the project space is not limited to the built-in runtimes.
export const SUGGESTION_PILLS: SuggestionPill[] = [
  {
    id: 'portfolio',
    label: 'Personal portfolio (one page)',
    prompt: 'Build a single page personal portfolio: a short intro with my name and role, a projects grid of three cards with links, and a contact section with email and social links.',
  },
  {
    id: 'multipage-site',
    label: 'Multi-page site with shared nav',
    prompt: 'Build a small multi-page site with Home, About, and Contact pages that share the same header and footer, with working navigation between the pages.',
  },
  {
    id: 'workspace-setup',
    label: 'Set up the workspace for an animated site',
    prompt: 'Set up the workspace for building an animated marketing site: use Handlebars templating so pages share a layout, load Tailwind CSS and Motion from a CDN, note the stack and conventions in .PROMPT.md, and scaffold a home page with a shared header and footer and a Motion entrance animation.',
  },
];

/**
 * Sync broadcast channel
 *
 * The Server Sync dialog is mounted by PageLayout, a sibling subtree to whatever view is on screen,
 * so a completed push cannot reach the project gallery or the deployments page through props. Both
 * of those render server-backed lists that would otherwise stay on the snapshot they mounted with —
 * which is why the deployment project picker kept needing a full page reload after a sync.
 *
 * Deliberately a distinct name from the existing 'projectsChanged' event, which the guided tour
 * dispatches for its own purposes; reusing it would make the tour trigger server refetches.
 */

export const SERVER_PROJECTS_CHANGED = 'serverProjectsChanged';

/**
 * Announce that the set of projects on the server may have changed.
 *
 * Listeners must respond with a plain re-read. A listener that pushes would be re-entrant, since
 * this fires from inside push paths.
 */
export function notifyServerProjectsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SERVER_PROJECTS_CHANGED));
}

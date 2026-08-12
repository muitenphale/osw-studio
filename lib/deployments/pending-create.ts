/**
 * The project a Deploy action wants a deployment created for.
 *
 * Deploy lives in the workspace; Deployments is a different view rendered from `content-area`, so
 * the two sit in sibling subtrees with no shared state. Sending the project through the
 * `nav-to-view` event does not work either: the view has to be mounted to hear it, and it mounts
 * because of that same event.
 *
 * So the request is left here for the view to collect when it mounts. Reading it clears it, so a
 * later visit to Deployments does not reopen the dialog.
 */
let pendingProjectId: string | null = null;

export function requestDeploymentFor(projectId: string): void {
  pendingProjectId = projectId;
}

/** Returns the pending project once, then forgets it. */
export function takePendingDeploymentRequest(): string | null {
  const id = pendingProjectId;
  pendingProjectId = null;
  return id;
}

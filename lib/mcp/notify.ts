import 'server-only';
import { eventBus } from '@/lib/server-generate/singleton';

/**
 * Telling the open workspace tab that an MCP client changed something.
 *
 * Without this, work done through the connector lands in the workspace database and the tab never
 * hears about it: a new project reads as "server only" in Server Sync, and an edited one as
 * "server has updates", both waiting for a manual pull. Server-mode generation already avoids that
 * by emitting `files_changed` as it writes, and this is the same idea for the connector.
 *
 * The whole project is pulled rather than named paths, because the shell reports what it printed,
 * not what it touched. That costs a full pull per change; the alternative is wrapping the VFS to
 * collect dirty paths, which is worth doing if a large project makes this slow.
 */
export function notifyProjectChanged(input: {
  userId: string;
  projectId: string;
  projectName: string;
  created: boolean;
  clientLabel: string;
}): void {
  // The taskId is the buffer key on the bus; a connector change has no task, so the project id
  // stands in, and the buffer is dropped straight afterwards.
  eventBus.emit(`mcp:${input.projectId}`, input.projectId, 'mcp_project_changed', {
    projectId: input.projectId,
    projectName: input.projectName,
    created: input.created,
    clientLabel: input.clientLabel,
  }, input.userId);
  eventBus.clearTask(`mcp:${input.projectId}`);
}

/**
 * Telling the open tab that an MCP client changed a deployment.
 *
 * The deployment tools changed server state and said nothing, so the Deployments page kept showing
 * the list it mounted with: a publish or an unpublish through the connector was invisible until a
 * reload. Carries no project id, because a deployment list is not per-project.
 */
export function notifyDeploymentChanged(input: {
  userId: string;
  deploymentId: string;
  deploymentName: string;
  action: 'created' | 'published' | 'unpublished' | 'updated';
  clientLabel: string;
}): void {
  eventBus.emit(`mcp:deployment:${input.deploymentId}`, input.deploymentId, 'mcp_deployment_changed', {
    deploymentId: input.deploymentId,
    deploymentName: input.deploymentName,
    action: input.action,
    clientLabel: input.clientLabel,
  }, input.userId);
  eventBus.clearTask(`mcp:deployment:${input.deploymentId}`);
}

import { describe, it, expect, beforeEach } from 'vitest';
import { requestDeploymentFor, takePendingDeploymentRequest } from '@/lib/deployments/pending-create';

/**
 * Deploy in the workspace hands the project to the Deployments view, which is not mounted at the
 * time. Taking the request has to clear it: otherwise every later visit to Deployments reopens the
 * create dialog for a project the user has moved on from.
 */
describe('a pending deployment request', () => {
  beforeEach(() => takePendingDeploymentRequest());

  it('is delivered once and then forgotten', () => {
    requestDeploymentFor('project-1');

    expect(takePendingDeploymentRequest()).toBe('project-1');
    expect(takePendingDeploymentRequest()).toBeNull();
  });

  it('is nothing when Deployments was opened directly', () => {
    expect(takePendingDeploymentRequest()).toBeNull();
  });

  it('keeps only the most recent project', () => {
    requestDeploymentFor('project-1');
    requestDeploymentFor('project-2');

    expect(takePendingDeploymentRequest()).toBe('project-2');
  });
});

/**
 * Deployment Database - Backward Compatibility Re-export
 *
 * @deprecated Use RuntimeDatabase from './runtime-database' for runtime operations,
 * and AnalyticsDatabase from './analytics-database' for analytics operations.
 *
 * This file re-exports RuntimeDatabase as DeploymentDatabase so that existing
 * consumers (admin API routes, etc.) continue to work without changes.
 * The analytics types are also re-exported for backward compatibility.
 */

export { RuntimeDatabase as DeploymentDatabase } from './runtime-database';

// Re-export analytics types for backward compatibility
export type {
  PageviewData,
  InteractionData,
  SessionData,
  AnalyticsStats,
} from './analytics-database';

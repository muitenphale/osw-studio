// lib/webhooks/types.ts

export type WebhookEventType =
  | 'user.created'
  | 'user.updated'
  | 'user.deactivated'
  | 'workspace.created'
  | 'workspace.updated'
  | 'workspace.deleted'
  | 'workspace.access_granted'
  | 'workspace.access_revoked';

export interface WebhookEvent {
  id: number;
  event_type: WebhookEventType;
  payload: string; // JSON
  created_at: string;
  delivered: boolean;
  delivered_at: string | null;
  attempts: number;
  last_attempted_at: string | null;
}

export interface UserCreatedPayload {
  userId: string;
  email: string;
  displayName: string | null;
}

export interface UserUpdatedPayload {
  userId: string;
  email: string;
  displayName: string | null;
}

export interface UserDeactivatedPayload {
  userId: string;
}

export interface WorkspaceCreatedPayload {
  workspaceId: string;
  name: string;
  ownerId: string;
}

export interface WorkspaceUpdatedPayload {
  workspaceId: string;
  name: string;
}

export interface WorkspaceDeletedPayload {
  workspaceId: string;
}

export interface WorkspaceAccessGrantedPayload {
  workspaceId: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface WorkspaceAccessRevokedPayload {
  workspaceId: string;
  email: string;
}

export type WebhookPayload =
  | UserCreatedPayload
  | UserUpdatedPayload
  | UserDeactivatedPayload
  | WorkspaceCreatedPayload
  | WorkspaceUpdatedPayload
  | WorkspaceDeletedPayload
  | WorkspaceAccessGrantedPayload
  | WorkspaceAccessRevokedPayload;

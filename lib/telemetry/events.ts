export type TelemetryEventName =
  | 'session_start'
  | 'pageview'
  | 'heartbeat'
  | 'provider_selected'
  | 'model_selected'
  | 'task_started'
  | 'task_complete'
  | 'task_fail'
  | 'tool_call'
  | 'api_error'
  | 'telemetry_disabled'
  | 'telemetry_accepted';

export type TelemetryEventProperties = Record<string, unknown>;

export interface TelemetryEvent {
  event: TelemetryEventName;
  timestamp: number;
  fields: Record<string, unknown>;
}

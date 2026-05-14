export interface DebugEvent {
  id: string;
  timestamp: number;
  event: string;
  data: any;
  count: number;
  version: number;
}

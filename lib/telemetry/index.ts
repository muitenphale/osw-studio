import { TelemetryTracker } from './tracker';
import { TelemetryEventName, TelemetryEventProperties } from './events';

let tracker: TelemetryTracker | null = null;

export function initTelemetry(): void {
  if (tracker) return;
  tracker = new TelemetryTracker();
  tracker.init();
}

export function track(event: TelemetryEventName, properties?: TelemetryEventProperties): void {
  tracker?.track(event, properties);
}

export function setTelemetryOptIn(value: boolean): void {
  tracker?.setOptIn(value);
}

export interface ProcessedFile {
  path: string;
  content: string | ArrayBuffer;
  mimeType: string;
  blobUrl?: string;
}

export interface Route {
  path: string;
  file: string;
  title?: string;
}

export interface CompiledProject {
  entryPoint: string;
  files: ProcessedFile[];
  routes: Route[];
  blobUrls: Map<string, string>;
}

export interface FocusContextPayload {
  domPath: string;
  tagName: string;
  attributes: Record<string, string>;
  outerHTML: string;
}

export interface PlacementBlockInfo {
  id: string;
  name: string;
  wireframeHtml: string;
}

export interface PlacementResult {
  blockId: string;
  placementId: string;
  domPath: string;
  position: 'before' | 'after';
  htmlContext: string;
}

export type ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export type PreviewMessage =
  | { type: 'navigate'; path: string }
  | { type: 'reload' }
  | { type: 'error'; error: string }
  | { type: 'selector-selection'; payload: FocusContextPayload }
  | { type: 'selector-cancelled' }
  | { type: 'console'; level: ConsoleLevel; args: string[] }
  | { type: 'placement-complete'; payload: PlacementResult }
  | { type: 'placement-cancelled' }
  | { type: 'iframe-click' };

export type PreviewHostMessage =
  | { type: 'selector-toggle'; active: boolean }
  | { type: 'placement-start'; block: PlacementBlockInfo }
  | { type: 'placement-hover'; x: number; y: number }
  | { type: 'placement-drop' }
  | { type: 'placement-cancel' }
  | { type: 'placement-remove'; placementId: string };

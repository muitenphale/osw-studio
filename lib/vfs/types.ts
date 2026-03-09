export type ProjectRuntime = 'static' | 'react' | 'preact' | 'svelte' | 'vue';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  settings: {
    runtime?: ProjectRuntime;  // defaults to 'static' when absent
    defaultTemplate?: string;
    globalStyles?: string;
    previewEntryPoint?: string;  // defaults to '/index.html' when absent
  };
  lastSavedCheckpointId?: string | null;
  lastSavedAt?: Date | null;
  previewImage?: string; // base64 data URL of project preview
  previewUpdatedAt?: Date; // when the preview was last captured
  lastSyncedAt?: Date | null; // Server mode: when project was last synced with server
  serverUpdatedAt?: Date | null; // Server mode: cached server's updatedAt timestamp
  syncStatus?: 'synced' | 'syncing' | 'error' | 'never-synced'; // Server mode: current sync state
  costTracking?: {
    totalCost: number;
    providerBreakdown: Record<string, {
      totalCost: number;
      tokenUsage: {
        input: number;
        output: number;
        reasoning?: number;
        cached?: number;
      };
      requestCount: number;
      lastUpdated: Date;
    }>;
    sessionHistory?: Array<{
      sessionId: string;
      cost: number;
      provider: string;
      timestamp: Date;
      tokenUsage?: {
        input: number;
        output: number;
      };
      correction?: boolean;
    }>;
  };
}

// Deployment - Published version of a project
export interface Deployment {
  // Identity
  id: string;
  projectId: string;
  name: string;
  slug?: string;
  enabled: boolean;

  // Publishing configuration
  underConstruction: boolean;
  customDomain?: string;
  headScripts: ScriptConfig[];
  bodyScripts: ScriptConfig[];
  cdnLinks: CdnConfig[];
  analytics: AnalyticsConfig;
  seo: SeoConfig;
  compliance: ComplianceConfig;

  // State tracking
  settingsVersion: number;
  lastPublishedVersion?: number;

  // Preview
  previewImage?: string; // base64 data URL of deployment screenshot
  previewUpdatedAt?: Date;

  // Database feature (for edge functions - future feature)
  databaseEnabled?: boolean;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date | null;
}

// Legacy: Publish Settings (kept for backward compatibility)
export interface PublishSettings {
  // Status
  enabled: boolean;
  underConstruction: boolean;
  customDomain?: string;

  // Scripts & Resources
  headScripts: ScriptConfig[];
  bodyScripts: ScriptConfig[];
  cdnLinks: CdnConfig[];

  // Analytics
  analytics: AnalyticsConfig;

  // SEO
  seo: SeoConfig;

  // Compliance
  compliance: ComplianceConfig;

  // State tracking
  settingsVersion: number;
  lastPublishedVersion?: number;
}

export interface ScriptConfig {
  id: string;
  name: string;
  content: string;
  type: 'inline' | 'external';
  src?: string; // URL for external scripts
  async?: boolean;
  defer?: boolean;
  enabled: boolean;
}

export interface CdnConfig {
  id: string;
  name: string;
  url: string;
  type: 'css' | 'js';
  integrity?: string;
  crossorigin?: 'anonymous' | 'use-credentials';
  enabled: boolean;
}

export interface AnalyticsConfig {
  enabled: boolean;
  provider: 'builtin' | 'gtm' | 'ga4' | 'plausible' | 'custom';
  trackingId?: string;
  customScript?: string;
  privacyMode: boolean;

  // Enhanced analytics features (toggleable)
  features?: {
    basicTracking?: boolean;       // Pageviews, referrers (always enabled if analytics on)
    heatmaps?: boolean;             // Click/scroll heatmaps (heavy data)
    sessionRecording?: boolean;     // Journey tracking
    performanceMetrics?: boolean;   // Core Web Vitals, load times
    engagementTracking?: boolean;   // Time on page, scroll depth
    customEvents?: boolean;         // Goal/conversion tracking
  };

  // Data retention settings (in days)
  retention?: {
    pageviews?: number;    // Default: 90 days
    interactions?: number; // Default: 30 days (heatmap data)
    sessions?: number;     // Default: 60 days
  };

  // Analytics token (for secure tracking)
  token?: string;
  tokenGeneratedAt?: string;
}

export interface SeoConfig {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  canonical?: string;
  noIndex?: boolean;
  noFollow?: boolean;
}

export interface ComplianceConfig {
  enabled: boolean;
  bannerPosition: 'top' | 'bottom';
  bannerStyle: 'bar' | 'modal' | 'corner';
  message: string;
  acceptButtonText: string;
  declineButtonText: string;
  privacyPolicyUrl?: string;
  cookiePolicyUrl?: string;
  mode: 'opt-in' | 'opt-out';
  blockAnalytics: boolean;
}

export interface VirtualFile {
  id: string;
  projectId: string;
  path: string;
  name: string;
  type: 'html' | 'css' | 'js' | 'json' | 'text' | 'template' | 'image' | 'video' | 'binary';
  content: string | ArrayBuffer;
  mimeType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    isEntry?: boolean;
    dependencies?: string[];
    isTransient?: boolean;
    isBuiltIn?: boolean;
    isServerContext?: boolean;
    isReadOnly?: boolean;
  };
}

export interface FileTreeNode {
  id: string;
  projectId: string;
  path: string;
  name: string;
  type: 'directory' | 'file';
  parentPath: string | null;
  isExpanded?: boolean;
  children?: string[];
  metadata?: Record<string, unknown>;
}

export interface FileOperation {
  projectId: string;
  path: string;
  content?: string | ArrayBuffer;
  newPath?: string;
}

export interface PatchOperation {
  search: string;
  replace: string;
}

export type FileType = VirtualFile['type'];

export const MIME_TYPES: Record<FileType, string> = {
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  text: 'text/plain',
  template: 'text/x-handlebars-template',
  image: 'image/*',
  video: 'video/*',
  binary: 'application/octet-stream'
};

export const SUPPORTED_EXTENSIONS = {
  html: ['html', 'htm'],
  css: ['css'],
  js: ['js', 'mjs', 'jsx', 'ts', 'tsx', 'svelte', 'vue'],
  json: ['json'],
  text: ['txt', 'md', 'xml', 'svg'],
  template: ['hbs', 'handlebars'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp'],
  video: ['mp4', 'webm', 'ogg']
};

export const FILE_SIZE_LIMITS = {
  text: 5 * 1024 * 1024,
  html: 5 * 1024 * 1024,
  css: 5 * 1024 * 1024,
  js: 5 * 1024 * 1024,
  json: 5 * 1024 * 1024,
  template: 5 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  binary: 10 * 1024 * 1024
};

export function getFileTypeFromPath(path: string): FileType {
  const ext = path.split('.').pop()?.toLowerCase();
  
  for (const [type, extensions] of Object.entries(SUPPORTED_EXTENSIONS)) {
    if (extensions.includes(ext || '')) {
      return type as FileType;
    }
  }
  
  return 'text';
}

export function getSpecificMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  
  const mimeMap: Record<string, string> = {
    'html': 'text/html',
    'htm': 'text/html',
    
    'css': 'text/css',
    
    'js': 'application/javascript',
    'mjs': 'application/javascript',
    'jsx': 'application/javascript',
    'ts': 'application/typescript',
    'tsx': 'application/typescript',
    'svelte': 'text/x-svelte',
    'vue': 'text/x-vue',

    'json': 'application/json',
    
    'txt': 'text/plain',
    'md': 'text/markdown',
    'xml': 'application/xml',
    'svg': 'image/svg+xml',
    
    'hbs': 'text/x-handlebars-template',
    'handlebars': 'text/x-handlebars-template',
    
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'bmp': 'image/bmp',
    
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'video/ogg'
  };
  
  return mimeMap[ext || ''] || 'application/octet-stream';
}

export function isFileSupported(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase();
  for (const extensions of Object.values(SUPPORTED_EXTENSIONS)) {
    if (extensions.includes(ext || '')) {
      return true;
    }
  }
  return false;
}

export function getMimeType(type: FileType): string {
  return MIME_TYPES[type];
}

// Template System Types

export interface CustomTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  files: Array<{path: string; content: string | ArrayBuffer}>;
  directories: string[];
  assets?: Array<{
    filename: string;
    path: string;
  }>;
  metadata: {
    author?: string;
    authorUrl?: string;
    license: string;              // Required, defaults to "personal"
    licenseLabel?: string;        // For custom licenses
    licenseDescription?: string;  // For custom licenses
    tags?: string[];
    thumbnail?: string;           // Base64 data URL
    previewImages?: string[];     // Array of base64 images
    downloadUrl?: string;
  };
  runtime?: ProjectRuntime;
  importedAt: Date;
  updatedAt?: Date;
  backendFeatures?: BackendFeatures;
}

export interface LicenseOption {
  value: string;
  label: string;
  description: string;
}

// Edge Functions Types
export interface EdgeFunction {
  id: string;
  projectId: string;
  name: string;          // URL-safe name (e.g., "products", "get-user")
  description?: string;
  code: string;          // JavaScript code
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY';
  enabled: boolean;
  timeoutMs: number;     // Default 5000, max 30000
  createdAt: Date;
  updatedAt: Date;
}

export interface FunctionLog {
  id: number;
  functionId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  error?: string;
  timestamp: Date;
}

// Database Schema Types (for SQL schema viewer)
export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  rowCount: number;
  isSystemTable: boolean;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
}

// Server Functions (callable from edge functions)
export interface ServerFunction {
  id: string;
  projectId: string;
  name: string;          // Function name (e.g., 'validateAuth', 'formatPrice')
  description?: string;
  code: string;          // JavaScript function body (receives args, has db/fetch access)
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Secrets (encrypted key-value storage for edge functions)
export interface Secret {
  id: string;
  projectId: string;
  name: string;          // e.g., 'STRIPE_API_KEY', 'SENDGRID_KEY'
  description?: string;
  hasValue: boolean;     // true if user has set a value, false if placeholder
  value?: string;        // Cleartext value for project-level storage (never sent to client in API responses)
  createdAt: Date;
  updatedAt: Date;
}

// Scheduled Functions (cron-triggered edge function execution)
export interface ScheduledFunction {
  id: string;
  projectId: string;
  name: string;                          // URL-safe: lowercase, numbers, hyphens
  description?: string;
  functionId: string;                     // FK → edge_functions.id
  cronExpression: string;                 // e.g. '0 8 * * *'
  timezone: string;                       // e.g. 'UTC', 'America/New_York'
  config: Record<string, unknown>;        // Custom body passed to edge function
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  lastStatus?: 'success' | 'error';
  lastError?: string;
  lastDurationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Backend Features (for templates that include backend infrastructure)
export interface BackendFeatures {
  edgeFunctions?: Array<{
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY';
    code: string;
    description?: string;
    enabled?: boolean;
    timeoutMs?: number;
  }>;
  serverFunctions?: Array<{
    name: string;
    code: string;
    description?: string;
    enabled?: boolean;
  }>;
  secrets?: Array<{
    name: string;
    description?: string;
  }>;
  scheduledFunctions?: Array<{
    name: string;
    functionName: string;   // name of the edge function to link
    cronExpression: string;
    timezone?: string;
    description?: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
  }>;
  databaseSchema?: string;
  deploymentSettings?: Record<string, unknown>;
}

export const LICENSE_OPTIONS: LicenseOption[] = [
  {
    value: 'personal',
    label: 'Personal Use Only',
    description: 'Cannot be resold or used commercially'
  },
  {
    value: 'commercial',
    label: 'Commercial Use',
    description: 'Can be used in commercial projects, cannot resell template'
  },
  {
    value: 'mit',
    label: 'MIT License',
    description: 'Use freely, must include copyright notice'
  },
  {
    value: 'apache-2.0',
    label: 'Apache 2.0',
    description: 'Similar to MIT, with patent protection'
  },
  {
    value: 'gpl-3.0',
    label: 'GPL 3.0',
    description: 'Open source, derivatives must also be GPL'
  },
  {
    value: 'bsd-3-clause',
    label: 'BSD 3-Clause',
    description: 'Permissive, cannot use author name for promotion'
  },
  {
    value: 'cc-by-4.0',
    label: 'CC BY 4.0',
    description: 'Free use with attribution'
  },
  {
    value: 'cc-by-sa-4.0',
    label: 'CC BY-SA 4.0',
    description: 'Free use with attribution, share-alike'
  },
  {
    value: 'cc-by-nc-4.0',
    label: 'CC BY-NC 4.0',
    description: 'Free for non-commercial use with attribution'
  },
  {
    value: 'unlicense',
    label: 'Unlicense (Public Domain)',
    description: 'No restrictions, completely free to use'
  },
  {
    value: 'all-rights-reserved',
    label: 'All Rights Reserved',
    description: 'Most restrictive, requires explicit permission'
  },
  {
    value: 'custom',
    label: 'Custom License',
    description: 'Specify your own terms'
  }
];

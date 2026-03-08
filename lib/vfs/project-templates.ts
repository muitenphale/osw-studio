
import { type AssetConfig } from './templates/utils';

export interface ProjectTemplate {
  name: string;
  description: string;
  files: Array<{
    path: string;
    content: string;
    isBase64?: boolean; // For binary files encoded as base64
  }>;
  directories: string[];
  assets?: AssetConfig[];
}

// Re-export all templates and utilities from the modular structure
export {
  DEMO_PROJECT_TEMPLATE,
  BAREBONES_PROJECT_TEMPLATE,
  CONTACT_LANDING_PROJECT_TEMPLATE,
  BLOG_PROJECT_TEMPLATE,
  REACT_STARTER_PROJECT_TEMPLATE,
  REACT_DEMO_PROJECT_TEMPLATE,
  createProjectFromTemplate,
  type AssetConfig,
  BUILT_IN_TEMPLATES,
  getBuiltInTemplate,
  getBuiltInTemplateIds,
  getBuiltInTemplatesForRuntime,
  type BuiltInTemplateMetadata
} from './templates';
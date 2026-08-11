
// The template types moved to ./templates/types so the registry can name them without importing
// this module, which re-exports the registry. Re-exported here because most of the app imports
// them from this path.
//
// Like ./templates, this does not re-export the template constants: doing so would defeat the
// per-template chunk split that `loadProjectTemplate` exists to get.

export {
  createProjectFromTemplate,
  customTemplateToProjectTemplate,
  applyBuiltInTemplate,
  instantiateBuiltInTemplate,
  loadBuiltInProjectTemplate,
  BUILT_IN_TEMPLATES,
  BUILT_IN_TEMPLATE_DEFINITIONS,
  DEFAULT_TEMPLATE_ID,
  getBuiltInTemplateDefinition,
} from './templates';

export type {
  AssetConfig,
  ProjectTemplate,
  BuiltInTemplateMetadata,
  BuiltInTemplateDefinition,
} from './templates';

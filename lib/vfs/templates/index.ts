// Deliberately does not re-export the template constants. Each one is reached through
// `getBuiltInTemplateDefinition(id).loadProjectTemplate()`, which the bundler can split into its
// own chunk; a static re-export here would pull every template into the bundle of anything that
// imports this module, whatever it actually asked for, and the lazy loaders would buy nothing.
// The few callers that want one specific template import its module directly.

export { createProjectFromTemplate, customTemplateToProjectTemplate } from './utils';
export {
  applyBuiltInTemplate,
  instantiateBuiltInTemplate,
  loadBuiltInProjectTemplate,
} from './instantiate';
export {
  BUILT_IN_TEMPLATES,
  BUILT_IN_TEMPLATE_DEFINITIONS,
  DEFAULT_TEMPLATE_ID,
  getBuiltInTemplateDefinition,
} from './registry';
export type {
  AssetConfig,
  ProjectTemplate,
  BuiltInTemplateMetadata,
  BuiltInTemplateDefinition,
} from './types';

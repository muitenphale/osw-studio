// Main re-export file for modular templates
export { DEMO_PROJECT_TEMPLATE } from './demo';
export { BAREBONES_PROJECT_TEMPLATE } from './barebones';
export { CONTACT_LANDING_PROJECT_TEMPLATE } from './contact-landing';
export { BLOG_PROJECT_TEMPLATE } from './blog';
export { createProjectFromTemplate, type AssetConfig } from './utils';
export { BUILT_IN_TEMPLATES, getBuiltInTemplate, getBuiltInTemplateIds, type BuiltInTemplateMetadata } from './registry';
import type { Project } from '@/lib/vfs/types';
import type { ProjectBrief, SpecSection } from './types';
import { vfs } from '@/lib/vfs';
import {
  BAREBONES_PROJECT_TEMPLATE,
  HANDLEBARS_STARTER_PROJECT_TEMPLATE,
  DEMO_PROJECT_TEMPLATE,
  CONTACT_LANDING_PROJECT_TEMPLATE,
  BLOG_PROJECT_TEMPLATE,
  REACT_STARTER_PROJECT_TEMPLATE,
  REACT_DEMO_PROJECT_TEMPLATE,
  PREACT_STARTER_PROJECT_TEMPLATE,
  SVELTE_STARTER_PROJECT_TEMPLATE,
  VUE_STARTER_PROJECT_TEMPLATE,
  PYTHON_STARTER_PROJECT_TEMPLATE,
  LUA_STARTER_PROJECT_TEMPLATE,
  BUILT_IN_TEMPLATES,
  createProjectFromTemplate,
  type BuiltInTemplateMetadata,
} from '@/lib/vfs/templates';
import { provisionBackendFeatures } from '@/lib/vfs/provision-backend-features';
import { serializeBriefToPrompt, serializeSpec, serializeTranscript } from './brief-serializer';

const TEMPLATE_MAP = {
  'blank': BAREBONES_PROJECT_TEMPLATE,
  'handlebars-starter': HANDLEBARS_STARTER_PROJECT_TEMPLATE,
  'demo': DEMO_PROJECT_TEMPLATE,
  'contact-landing': CONTACT_LANDING_PROJECT_TEMPLATE,
  'blog': BLOG_PROJECT_TEMPLATE,
  'react-starter': REACT_STARTER_PROJECT_TEMPLATE,
  'react-demo': REACT_DEMO_PROJECT_TEMPLATE,
  'preact-starter': PREACT_STARTER_PROJECT_TEMPLATE,
  'svelte-starter': SVELTE_STARTER_PROJECT_TEMPLATE,
  'vue-starter': VUE_STARTER_PROJECT_TEMPLATE,
  'python-starter': PYTHON_STARTER_PROJECT_TEMPLATE,
  'lua-starter': LUA_STARTER_PROJECT_TEMPLATE,
} as const;

export interface CreateFromBriefOptions {
  brief: ProjectBrief;
  spec?: SpecSection[];
  /** Conversation messages for .DESIGN-CONVERSATION.md. */
  conversation?: Array<{ role: string; content: string }>;
}

/**
 * Creates a VFS project from a finalized ProjectBrief.
 *
 * Writes:
 * - Template files (from chosen template)
 * - .PROMPT.md — terse brief appended to template's domain prompt, with .DESIGN.md directive
 * - .DESIGN.md — substantive context (only if spec sections exist)
 * - .DESIGN-CONVERSATION.md — raw setup transcript (always)
 */
export async function createProjectFromBrief(options: CreateFromBriefOptions): Promise<Project> {
  const { brief, spec = [], conversation = [] } = options;
  await vfs.init();

  const name = (brief.name ?? 'Untitled Project').trim().slice(0, 50) || 'Untitled Project';
  const runtime = brief.runtime ?? 'static';
  const templateId: string = brief.template ?? 'blank';
  const hasSpec = spec.length > 0;

  // 1. Create bare project
  const project = await vfs.createProject(name);

  // 2. Set runtime in project settings
  const finalProject: Project = {
    ...project,
    settings: { ...project.settings, runtime },
  };
  await vfs.updateProject(finalProject);

  // 3. Apply template
  const template = TEMPLATE_MAP[templateId as keyof typeof TEMPLATE_MAP] ?? BAREBONES_PROJECT_TEMPLATE;
  await createProjectFromTemplate(vfs, finalProject.id, template, template.assets);

  // 4. Append brief to .PROMPT.md (template already wrote platform constraints)
  const briefContent = serializeBriefToPrompt(brief, hasSpec);
  const promptExists = await vfs.fileExists(finalProject.id, '/.PROMPT.md');
  if (promptExists) {
    const existing = await vfs.readFile(finalProject.id, '/.PROMPT.md');
    const existingContent = typeof existing.content === 'string' ? existing.content : '';
    await vfs.updateFile(finalProject.id, '/.PROMPT.md', existingContent + '\n\n' + briefContent);
  } else {
    await vfs.createFile(finalProject.id, '/.PROMPT.md', briefContent);
  }

  // 5. Write .DESIGN.md if there's substantive content
  if (hasSpec) {
    const specContent = serializeSpec(spec);
    await vfs.createFile(finalProject.id, '/.DESIGN.md', specContent);
  }

  // 6. Write .DESIGN-CONVERSATION.md (always — reference artifact)
  if (conversation.length > 0) {
    const transcriptContent = serializeTranscript(conversation);
    await vfs.createFile(finalProject.id, '/.DESIGN-CONVERSATION.md', transcriptContent);
  }

  // 7. Provision backend features if the template has them
  const builtInMeta = BUILT_IN_TEMPLATES.find(t => t.id === templateId) as BuiltInTemplateMetadata | undefined;
  if (builtInMeta?.backendFeatures) {
    await provisionBackendFeatures(finalProject.id, builtInMeta.backendFeatures);
  }

  return finalProject;
}

import type { Project } from '@/lib/vfs/types';
import type { ProjectBrief, SpecSection } from './types';
import { vfs } from '@/lib/vfs';
import { createProjectFromTemplate, getBuiltInTemplateDefinition } from '@/lib/vfs/templates';
import { provisionBackendFeatures } from '@/lib/vfs/provision-backend-features';
import { seedPromptSuggestions } from '@/lib/vfs/prompt-suggestions';
import { serializeBriefToPrompt, serializeSpec, serializeTranscript } from './brief-serializer';

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

  // A brief is persisted, so its template id can outlive the template. Falling back to blank keeps
  // a stale brief creating a project rather than failing. Resolved before the project is created:
  // the files are a lazily imported chunk, and a failure afterwards would strand an empty project.
  const definition =
    getBuiltInTemplateDefinition(templateId) ?? getBuiltInTemplateDefinition('blank');
  const template = await definition?.loadProjectTemplate();

  // 1. Create bare project
  const project = await vfs.createProject(name);

  // 2. Set runtime in project settings
  const finalProject: Project = {
    ...project,
    settings: {
      ...project.settings,
      runtime,
      promptSuggestions: seedPromptSuggestions(definition?.promptSuggestions),
    },
  };
  await vfs.updateProject(finalProject);

  // 3. Apply template
  if (template) {
    await createProjectFromTemplate(vfs, finalProject.id, template, template.assets);
  }

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
  if (template?.backendFeatures) {
    await provisionBackendFeatures(finalProject.id, template.backendFeatures);
  }

  return finalProject;
}

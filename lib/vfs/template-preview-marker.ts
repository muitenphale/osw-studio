/**
 * How a throwaway template-preview project is recognised.
 *
 * A leaf module with no imports, because both the VFS core and the template layer need it and
 * neither should have to pull in the other. See `templates/preview-project.ts` for what creates
 * these and why.
 */

/**
 * Marks a project as scratch. An id prefix rather than a name or a settings flag so that finding
 * one needs no per-project read: the ids are already in hand from `listProjects`.
 */
export const TEMPLATE_PREVIEW_ID_PREFIX = 'tplpreview-';

export function isTemplatePreviewProject(projectId: string): boolean {
  return projectId.startsWith(TEMPLATE_PREVIEW_ID_PREFIX);
}

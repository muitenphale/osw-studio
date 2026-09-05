import { redirect } from 'next/navigation';

/**
 * Mail moved into Settings, where it is scoped to the workspace in the path. Kept as a redirect so
 * links and bookmarks to the old top-level page still land on it.
 */
export default async function WorkspaceMail(
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  redirect(`/w/${workspaceId}/settings?settings=mail`);
}

import { redirect } from 'next/navigation';

export default async function WorkspaceRoot(
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  redirect(`/w/${workspaceId}/projects`);
}

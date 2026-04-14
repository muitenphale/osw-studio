import { PageWrapper } from '@/components/page-wrapper';

export default async function WorkspaceSkills(
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  return <PageWrapper view="skills" workspaceId={workspaceId} />;
}

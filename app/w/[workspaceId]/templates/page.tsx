import { PageWrapper } from '@/components/page-wrapper';

export default async function WorkspaceTemplates(
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  return <PageWrapper view="templates" workspaceId={workspaceId} />;
}

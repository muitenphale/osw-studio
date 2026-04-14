import { PageWrapper } from '@/components/page-wrapper';

export default async function WorkspaceDocs(
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  return <PageWrapper view="docs" workspaceId={workspaceId} />;
}

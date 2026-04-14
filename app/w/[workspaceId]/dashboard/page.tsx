import { PageWrapper } from '@/components/page-wrapper';

export default async function WorkspaceDashboard(
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  return <PageWrapper view="dashboard" workspaceId={workspaceId} />;
}

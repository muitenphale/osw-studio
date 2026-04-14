import { PageWrapper } from '@/components/page-wrapper';

export default async function WorkspaceDeployments(
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  return <PageWrapper view="deployments" workspaceId={workspaceId} />;
}

import { PageWrapper } from '@/components/page-wrapper';

export default async function WorkspaceSettings(
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  return <PageWrapper view="settings" workspaceId={workspaceId} />;
}

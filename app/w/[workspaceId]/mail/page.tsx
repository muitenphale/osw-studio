import { PageWrapper } from '@/components/page-wrapper';

export default async function WorkspaceMail(
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  return <PageWrapper view="mail" workspaceId={workspaceId} />;
}

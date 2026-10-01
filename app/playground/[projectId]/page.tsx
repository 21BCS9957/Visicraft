import { PlaygroundWorkspace } from '@/components/playground/PlaygroundWorkspace';

// The session lives in the browser, so the workspace loads its data there.
export default async function PlaygroundProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <PlaygroundWorkspace projectId={projectId} />;
}

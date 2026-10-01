import { CanvasPage } from '@/components/playground/canvas/CanvasPage';

export default async function PlaygroundCanvasPage({ params }: { params: Promise<{ projectId: string; itemId: string }> }) {
  const { projectId, itemId } = await params;
  return <CanvasPage projectId={projectId} itemId={itemId} />;
}

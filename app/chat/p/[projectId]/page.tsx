import type { Metadata } from 'next';
import { ChatApp } from '@/components/chat/ChatApp';

export const metadata: Metadata = {
  title: 'Chat project · Visicraft',
};

/** /chat/p/<id>: a Chat project, its instructions and its chats. */
export default async function ChatProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ChatApp initialProjectId={projectId} />;
}

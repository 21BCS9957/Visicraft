import type { Metadata } from 'next';
import { ChatApp } from '@/components/chat/ChatApp';

export const metadata: Metadata = {
  title: 'Chat · Visicraft',
};

/** /chat/<id>: one saved chat. */
export default async function ChatThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  return <ChatApp initialThreadId={threadId} />;
}

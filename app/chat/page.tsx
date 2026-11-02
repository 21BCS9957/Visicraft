import type { Metadata } from 'next';
import { ChatApp } from '@/components/chat/ChatApp';

export const metadata: Metadata = {
  title: 'Chat · Visicraft',
};

/** /chat: a new image chat (ChatGPT-style, OpenAI GPT Image). */
export default function ChatPage() {
  return <ChatApp />;
}

import type { Metadata } from 'next';
import { CreatePage } from '@/components/video-create/CreatePage';

export const metadata: Metadata = {
  title: 'Create video · Visicraft',
};

/** /playground/create: Higgsfield-style video making (prompt and images → Seedance or Veo). */
export default function PlaygroundCreatePage() {
  return <CreatePage />;
}

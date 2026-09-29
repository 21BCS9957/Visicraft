import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Playground · Visicraft',
  description: 'Projects that keep your product references and brief; paste many prompts and get one image each.',
};

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return children;
}

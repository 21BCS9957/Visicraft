import type { Metadata } from 'next';
import { CreativesPage } from '@/components/playground/creatives/CreativesPage';

export const metadata: Metadata = {
  title: 'Creatives · Visicraft',
  description: 'Everything you have made in the Playground and the Video Studio, filed by client.',
};

export default function Creatives() {
  return <CreativesPage />;
}

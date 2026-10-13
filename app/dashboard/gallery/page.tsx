import type { Metadata } from 'next';
import { GalleryPage } from '@/components/dashboard/Gallery';

export const metadata: Metadata = {
  title: 'Gallery · GoGrowth dashboard',
};

/** dashboard.<domain>/gallery (proxy.ts rewrites it here). */
export default function DashboardGalleryPage() {
  return <GalleryPage />;
}

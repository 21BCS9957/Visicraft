import { HeroSection } from '@/components/ui/hero-section';
import CreativeProcess from '@/components/sections/CreativeProcess';

export default function Home() {
  return (
    <>
      <HeroSection />
      <CreativeProcess />
    </>
  );
}

// Enable static generation for faster loading
export const dynamic = 'force-static';
export const revalidate = 3600; // Revalidate every hour

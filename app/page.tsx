import { HeroSection } from '@/components/ui/hero-section';

export default function Home() {
  return (
    <>
      <HeroSection />
    </>
  );
}

// Enable static generation for faster loading
export const dynamic = 'force-static';
export const revalidate = 3600; // Revalidate every hour

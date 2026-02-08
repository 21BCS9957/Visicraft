'use client';

import Link from 'next/link';
import { Sparkles, Upload, Zap, Download } from 'lucide-react';
import { Button } from './button';
import { memo } from 'react';

const MarqueeContent = memo(() => (
  <div className="relative bg-gradient-to-r from-[#8b7355] via-[#a08968] to-[#8b7355] py-3 overflow-hidden border-y border-[#c8b4a0]/30 rounded-lg mt-12">
    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
    <div 
      className="relative flex whitespace-nowrap gap-16"
      style={{
        animation: 'marquee 25s linear infinite',
        width: 'max-content',
        willChange: 'transform'
      }}
    >
      {[...Array(6)].map((_, i) => (
        <span key={i} className="text-white font-light text-sm tracking-widest flex items-center gap-16">
          INDIA'S FASTEST GROWING AI PLATFORM
          <span className="text-white/60">•</span>
          10,000+ CREATORS TRUST VISICRAFT
          <span className="text-white/60">•</span>
          GENERATE STUNNING VISUALS IN SECONDS
          <span className="text-white/60">•</span>
        </span>
      ))}
    </div>
  </div>
));

MarqueeContent.displayName = 'MarqueeContent';

const FeatureCard = memo(({ icon: Icon, title, desc, delay }: { icon: any, title: string, desc: string, delay: number }) => (
  <div
    className="p-8 rounded-lg border border-white/10 bg-[#1a1a1a] hover:border-[#8b7355]/30 transition-all opacity-0 animate-word-appear group"
    style={{
      animationDelay: `${delay}s`,
      animationFillMode: 'forwards',
    }}
  >
    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#8b7355]/20 to-[#6b5545]/20 flex items-center justify-center mb-4 border border-[#8b7355]/30">
      <Icon className="w-6 h-6 text-[#c8b4a0]" />
    </div>
    <h3 className="text-white font-light text-xl mb-2 tracking-wide">
      {title}
    </h3>
    <p className="text-gray-400 text-sm font-light">
      {desc}
    </p>
  </div>
));

FeatureCard.displayName = 'FeatureCard';

export function HeroSection() {

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
      {/* Visible Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.08] animate-grid-draw"
        style={{
          backgroundImage: `
            linear-gradient(to right, #c8b4a0 1px, transparent 1px),
            linear-gradient(to bottom, #c8b4a0 1px, transparent 1px)
          `,
          backgroundSize: '4rem 4rem',
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a]/50 to-[#0a0a0a]" />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-20 flex flex-col items-center justify-center min-h-screen">
        <div className="text-center space-y-8 max-w-5xl">
          {/* Animated Title with spacing */}
          <h1 className="text-6xl md:text-8xl font-light text-white tracking-wider leading-relaxed">
            <span
              className="inline-block animate-word-appear opacity-0"
              style={{
                animationDelay: '0s',
                animationFillMode: 'forwards',
              }}
            >
              CREATE STUNNING VISUALS
            </span>
            <br className="my-6" />
            <span
              className="inline-block animate-word-appear opacity-0"
              style={{
                animationDelay: '0.3s',
                animationFillMode: 'forwards',
              }}
            >
              WITH VISICRAFT
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-gray-400 font-light max-w-2xl mx-auto mt-12">
            Transform ordinary images into eye-catching thumbnails for YouTube, Amazon, and social media
          </p>

          {/* CTA Button */}
          <div className="pt-8">
            <Link href="/workflow">
              <Button
                size="lg"
                className="bg-gradient-to-r from-[#8b7355] to-[#6b5545] hover:shadow-lg hover:shadow-[#8b7355]/20 text-white font-light text-lg px-8 py-6 tracking-wide transition-all rounded-lg"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Start Creating
              </Button>
            </Link>
          </div>

          {/* Marquee Ribbon */}
          <MarqueeContent />

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-20">
            <FeatureCard 
              icon={Upload}
              title="Upload Images"
              desc="Add your source images and reference style"
              delay={0.8}
            />
            <FeatureCard 
              icon={Zap}
              title="AI Generation"
              desc="Let AI create stunning thumbnails"
              delay={0.95}
            />
            <FeatureCard 
              icon={Download}
              title="Download"
              desc="Get your thumbnails instantly"
              delay={1.1}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

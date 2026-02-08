'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Button } from './button';

export function HeroSection() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const words = ['AI-Powered', 'YouTube', 'Thumbnail', 'Generator'];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#1a1d18] via-black to-[#2a2e26]">
      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #c8b4a0 1px, transparent 1px),
            linear-gradient(to bottom, #c8b4a0 1px, transparent 1px)
          `,
          backgroundSize: '4rem 4rem',
        }}
      />

      {/* Gradient Mouse Effect */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(200, 180, 160, 0.1), transparent 40%)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-20 flex flex-col items-center justify-center min-h-screen">
        <div className="text-center space-y-8 max-w-4xl">
          {/* Animated Title */}
          <h1 className="text-5xl md:text-7xl font-extralight text-[#f8f7f5] tracking-[0.2em] uppercase">
            {words.map((word, index) => (
              <span
                key={word}
                className="inline-block animate-word-appear opacity-0"
                style={{
                  animationDelay: `${index * 0.2}s`,
                  animationFillMode: 'forwards',
                }}
              >
                {word}{' '}
              </span>
            ))}
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-[#c8b4a0] font-light max-w-2xl mx-auto">
            Transform your images into stunning YouTube thumbnails with the power of AI
          </p>

          {/* CTA Button */}
          <div className="pt-8">
            <Link href="/generate">
              <Button
                size="lg"
                className="bg-gradient-to-r from-[#6b5545] to-[#8a7060] hover:from-[#8a7060] hover:to-[#6b5545] text-[#f8f7f5] font-light text-lg px-8 py-6 tracking-wide"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Start Creating
              </Button>
            </Link>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-16">
            {[
              { title: 'Upload Images', desc: 'Add your source images and reference style' },
              { title: 'AI Generation', desc: 'Let AI create stunning thumbnails' },
              { title: 'Download', desc: 'Get your thumbnails instantly' },
            ].map((feature, index) => (
              <div
                key={feature.title}
                className="p-6 rounded-lg border border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26] opacity-0 animate-word-appear"
                style={{
                  animationDelay: `${1 + index * 0.2}s`,
                  animationFillMode: 'forwards',
                }}
              >
                <h3 className="text-[#f8f7f5] font-light text-lg mb-2 tracking-wide">
                  {feature.title}
                </h3>
                <p className="text-[#c8b4a0]/80 text-sm">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Link from 'next/link';

// Register GSAP plugins
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export function AnimatedWorkflow() {
  const sectionRef = useRef<HTMLElement>(null);
  const line1Ref = useRef<SVGPathElement>(null);
  const line2Ref = useRef<SVGPathElement>(null);
  const [activeNode, setActiveNode] = useState<number>(0);

  useEffect(() => {
    if (!sectionRef.current || typeof window === 'undefined') return;

    // Add delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const ctx = gsap.context(() => {
        const line1 = line1Ref.current;
        const line2 = line2Ref.current;
        const container = document.querySelector('.animation-wrapper > div');

        if (!line1 || !line2 || !container) {
          console.log('Elements not found');
          return;
        }

        console.log('Initializing line animations');

        // Get container dimensions
        const rect = container.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        // Calculate absolute positions (updated for better spacing)
        // Node 1: right: 8%, top: 5%
        const node1X = width * 0.85;
        const node1Y = height * 0.15;

        // Node 2: left: 8%, top: 50%
        const node2X = width * 0.15;
        const node2Y = height * 0.50;

        // Node 3: right: 8%, bottom: 2% (= top: 98%)
        const node3X = width * 0.85;
        const node3Y = height * 0.90;

        // Create paths with absolute coordinates
        const path1 = `M ${node1X} ${node1Y} Q ${(node1X + node2X) / 2} ${node1Y}, ${node2X} ${node2Y}`;
        const path2 = `M ${node2X} ${node2Y} Q ${(node2X + node3X) / 2} ${(node2Y + node3Y) / 2}, ${node3X} ${node3Y}`;

        line1.setAttribute('d', path1);
        line2.setAttribute('d', path2);

        // Get line lengths for animation
        const line1Length = line1.getTotalLength();
        const line2Length = line2.getTotalLength();

        console.log('Line 1 length:', line1Length);
        console.log('Line 2 length:', line2Length);

        if (line1Length === 0 || line2Length === 0) {
          console.error('Line lengths are 0, cannot animate');
          return;
        }

        // Set initial state - lines hidden
        gsap.set(line1, {
          strokeDasharray: line1Length,
          strokeDashoffset: line1Length,
          opacity: 1,
        });

        gsap.set(line2, {
          strokeDasharray: line2Length,
          strokeDashoffset: line2Length,
          opacity: 1,
        });

        // Create master timeline with longer scroll distance
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: '.animation-wrapper',
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1.5,
            pin: false,
            markers: false,
            onUpdate: (self) => {
              const progress = self.progress;
              
              // Update active node based on scroll progress with clearer phases
              if (progress < 0.25) {
                setActiveNode(1);
              } else if (progress < 0.65) {
                setActiveNode(2);
              } else {
                setActiveNode(3);
              }
            },
          },
        });

        // Phase 1: Draw line 1 (Source → Generate) - 0% to 35%
        tl.to(line1, {
          strokeDashoffset: 0,
          duration: 0.35,
          ease: 'power2.inOut',
        });

        // Phase 2: Pause at Generate - 35% to 45%
        tl.to({}, { duration: 0.1 });

        // Phase 3: Draw line 2 (Generate → Output) - 45% to 80%
        tl.to(line2, {
          strokeDashoffset: 0,
          duration: 0.35,
          ease: 'power2.inOut',
        });

        // Phase 4: Final pause at Output - 80% to 100%
        tl.to({}, { duration: 0.2 });

        console.log('Timeline created successfully');

        // Update paths on resize
        const handleResize = () => {
          const rect = container.getBoundingClientRect();
          const width = rect.width;
          const height = rect.height;

          const node1X = width * 0.85;
          const node1Y = height * 0.15;
          const node2X = width * 0.15;
          const node2Y = height * 0.50;
          const node3X = width * 0.85;
          const node3Y = height * 0.90;

          const path1 = `M ${node1X} ${node1Y} Q ${(node1X + node2X) / 2} ${node1Y}, ${node2X} ${node2Y}`;
          const path2 = `M ${node2X} ${node2Y} Q ${(node2X + node3X) / 2} ${(node2Y + node3Y) / 2}, ${node3X} ${node3Y}`;

          line1.setAttribute('d', path1);
          line2.setAttribute('d', path2);
        };

        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
        };
      }, sectionRef);

      return () => ctx.revert();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <section ref={sectionRef} className="workflow-section relative bg-[#0a0a0a] overflow-hidden">
      {/* Background Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Section Header */}
      <div className="relative z-10 pt-24 pb-12 text-center px-6">
        <h2 className="text-3xl md:text-5xl font-light text-white mb-4">
          How It Works
        </h2>
        <p className="text-lg md:text-xl font-light text-gray-400 max-w-2xl mx-auto">
          Watch the workflow come to life as you scroll
        </p>
      </div>

      {/* Main Animation Container - Increased height for more scroll distance */}
      <div className="animation-wrapper relative py-32 min-h-[200vh]">
        <div className="relative w-full max-w-7xl mx-auto px-4 md:px-8" style={{ height: '800px' }}>
          {/* Connection Lines SVG */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 5 }}
          >
            <defs>
              <linearGradient id="connection-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b7355" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#c8b4a0" stopOpacity="0.6" />
              </linearGradient>
              
              {/* Animated gradient for active state */}
              <linearGradient id="active-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b7355" stopOpacity="1">
                  <animate attributeName="stop-color" values="#8b7355;#c8b4a0;#8b7355" dur="2s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stopColor="#c8b4a0" stopOpacity="1">
                  <animate attributeName="stop-color" values="#c8b4a0;#8b7355;#c8b4a0" dur="2s" repeatCount="indefinite" />
                </stop>
              </linearGradient>

              {/* Glow filter */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Line 1: Source (Right) → Generate (Left) - Path set dynamically */}
            <path
              id="line-1-path"
              ref={line1Ref}
              d=""
              stroke="url(#connection-gradient)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              filter="url(#glow)"
              opacity="1"
            />

            {/* Line 2: Generate (Left) → Output (Right Bottom) - Path set dynamically */}
            <path
              id="line-2-path"
              ref={line2Ref}
              d=""
              stroke="url(#connection-gradient)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              filter="url(#glow)"
              opacity="1"
            />

            {/* Animated particles along lines - will be updated dynamically */}
            {activeNode >= 2 && line1Ref.current && (
              <circle r="4" fill="#c8b4a0" filter="url(#glow)">
                <animateMotion dur="2s" repeatCount="indefinite">
                  <mpath href="#line-1-path" />
                </animateMotion>
              </circle>
            )}
            
            {activeNode >= 3 && line2Ref.current && (
              <circle r="4" fill="#c8b4a0" filter="url(#glow)">
                <animateMotion dur="2s" repeatCount="indefinite">
                  <mpath href="#line-2-path" />
                </animateMotion>
              </circle>
            )}
          </svg>

          {/* NODE 1: Source Image (Top Right) */}
          <div
            className="absolute"
            style={{
              right: '8%',
              top: '5%',
              zIndex: 10,
            }}
          >
            <div
              className={`
                relative w-[160px] h-[160px] md:w-[200px] md:h-[200px] 
                rounded-2xl bg-[#1a1a1a] border-2 transition-all duration-500
                ${activeNode >= 1 ? 'border-[#8b7355] shadow-lg shadow-[#8b7355]/30' : 'border-[#2a2a2a]'}
              `}
            >
              {/* Loading ring */}
              {activeNode === 1 && (
                <div className="absolute inset-0 rounded-2xl">
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="48%"
                      fill="none"
                      stroke="url(#active-gradient)"
                      strokeWidth="3"
                      strokeDasharray="628"
                      strokeDashoffset="0"
                      className="animate-spin-slow"
                      style={{ transformOrigin: 'center' }}
                    />
                  </svg>
                </div>
              )}

              {/* Content */}
              <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                <div
                  className={`
                    w-12 h-12 md:w-14 md:h-14 rounded-xl 
                    bg-gradient-to-br from-[#8b7355]/20 to-[#6b5545]/20 
                    flex items-center justify-center transition-all duration-500
                    ${activeNode >= 1 ? 'scale-110' : 'scale-100'}
                  `}
                >
                  <svg
                    className={`w-6 h-6 md:w-7 md:h-7 transition-colors duration-500 ${
                      activeNode >= 1 ? 'text-[#c8b4a0]' : 'text-[#8b7355]'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 256 256"
                  >
                    <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM156,88a12,12,0,1,1-12,12A12,12,0,0,1,156,88Zm60,112H40V160.69l46.34-46.35a8,8,0,0,1,11.32,0h0L165,181.66a8,8,0,0,0,11.32-11.32l-17.66-17.65L173,138.34a8,8,0,0,1,11.31,0L216,170.07V200Z" />
                  </svg>
                </div>
                <span
                  className={`text-xs md:text-sm font-light transition-colors duration-500 ${
                    activeNode >= 1 ? 'text-[#c8b4a0]' : 'text-gray-500'
                  }`}
                >
                  Source Image
                </span>
                
                {/* Status indicator */}
                {activeNode === 1 && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#8b7355] rounded-full">
                    <span className="text-xs text-white font-light">Uploading...</span>
                  </div>
                )}
                {activeNode > 1 && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* NODE 2: AI Generate (Left Center) */}
          <div
            className="absolute"
            style={{
              left: '8%',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
            }}
          >
            <div
              className={`
                relative w-[160px] h-[160px] md:w-[200px] md:h-[200px] 
                rounded-2xl bg-[#1a1a1a] border-2 transition-all duration-500
                ${activeNode >= 2 ? 'border-[#8b7355] shadow-lg shadow-[#8b7355]/30' : 'border-[#2a2a2a]'}
              `}
            >
              {/* Loading ring */}
              {activeNode === 2 && (
                <div className="absolute inset-0 rounded-2xl">
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="48%"
                      fill="none"
                      stroke="url(#active-gradient)"
                      strokeWidth="3"
                      strokeDasharray="628"
                      strokeDashoffset="157"
                      className="animate-spin-slow"
                      style={{ transformOrigin: 'center' }}
                    >
                      <animate attributeName="stroke-dashoffset" from="628" to="0" dur="2s" repeatCount="indefinite" />
                    </circle>
                  </svg>
                </div>
              )}

              {/* Content */}
              <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                <div
                  className={`
                    w-12 h-12 md:w-14 md:h-14 rounded-xl 
                    bg-gradient-to-br from-[#8b7355]/20 to-[#6b5545]/20 
                    flex items-center justify-center transition-all duration-500
                    ${activeNode >= 2 ? 'scale-110 animate-pulse' : 'scale-100'}
                  `}
                >
                  <svg
                    className={`w-6 h-6 md:w-7 md:h-7 transition-colors duration-500 ${
                      activeNode >= 2 ? 'text-[#c8b4a0]' : 'text-[#8b7355]'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 256 256"
                  >
                    <path d="M248,152a8,8,0,0,1-8,8H224v16a8,8,0,0,1-16,0V160H192a8,8,0,0,1,0-16h16V128a8,8,0,0,1,16,0v16h16A8,8,0,0,1,248,152ZM56,72H72V88a8,8,0,0,0,16,0V72h16a8,8,0,0,0,0-16H88V40a8,8,0,0,0-16,0V56H56a8,8,0,0,0,0,16ZM184,192h-8v-8a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0v-8h8a8,8,0,0,0,0-16ZM152,80a12,12,0,1,0-12,12A12,12,0,0,0,152,80Zm-12,84a12,12,0,1,0,12,12A12,12,0,0,0,140,164Z" />
                  </svg>
                </div>
                <span
                  className={`text-xs md:text-sm font-light transition-colors duration-500 ${
                    activeNode >= 2 ? 'text-[#c8b4a0]' : 'text-gray-500'
                  }`}
                >
                  AI Generate
                </span>
                
                {/* Status indicator */}
                {activeNode === 2 && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#8b7355] rounded-full">
                    <span className="text-xs text-white font-light">Processing...</span>
                  </div>
                )}
                {activeNode > 2 && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* NODE 3: AI Result (Bottom Right) */}
          <div
            className="absolute"
            style={{
              right: '8%',
              bottom: '2%',
              zIndex: 10,
            }}
          >
            <div
              className={`
                relative w-[160px] h-[160px] md:w-[200px] md:h-[200px] 
                rounded-2xl bg-[#1a1a1a] border-2 transition-all duration-500
                ${activeNode >= 3 ? 'border-[#8b7355] shadow-lg shadow-[#8b7355]/30' : 'border-[#2a2a2a]'}
              `}
            >
              {/* Success glow */}
              {activeNode === 3 && (
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#8b7355]/20 to-[#6b5545]/20 animate-pulse" />
              )}

              {/* Content */}
              <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                <div
                  className={`
                    w-12 h-12 md:w-14 md:h-14 rounded-xl 
                    bg-gradient-to-br from-[#8b7355]/20 to-[#6b5545]/20 
                    flex items-center justify-center transition-all duration-500
                    ${activeNode >= 3 ? 'scale-110' : 'scale-100'}
                  `}
                >
                  <svg
                    className={`w-6 h-6 md:w-7 md:h-7 transition-colors duration-500 ${
                      activeNode >= 3 ? 'text-[#c8b4a0] animate-spin-slow' : 'text-[#8b7355]'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 256 256"
                  >
                    <path d="M197.58,129.06,146,110l-19.06-51.58a15.92,15.92,0,0,0-29.88,0L78,110,26.42,129.06a15.92,15.92,0,0,0,0,29.88L78,178l19.06,51.58a15.92,15.92,0,0,0,29.88,0L146,178l51.58-19.06a15.92,15.92,0,0,0,0-29.88ZM137.08,164.88a8,8,0,0,0-4.96,4.96L112,223.75,91.88,169.84a8,8,0,0,0-4.96-4.96L32.25,144l53.67-20.12a8,8,0,0,0,4.96-4.96L112,32.25l20.12,53.67a8,8,0,0,0,4.96,4.96L190.75,144ZM144,40a8,8,0,0,1,8-8h16V16a8,8,0,0,1,16,0V32h16a8,8,0,0,1,0,16H184V64a8,8,0,0,1-16,0V48H152A8,8,0,0,1,144,40Z" />
                  </svg>
                </div>
                <span
                  className={`text-xs md:text-sm font-light transition-colors duration-500 ${
                    activeNode >= 3 ? 'text-[#c8b4a0]' : 'text-gray-500'
                  }`}
                >
                  AI Result
                </span>
                
                {/* Status indicator */}
                {activeNode === 3 && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 rounded-full">
                    <span className="text-xs text-white font-light">Complete!</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Center Text Overlay with Progress Indicator */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none px-6 max-w-2xl">
            <h3 className="text-2xl md:text-3xl font-light text-white/80 mb-2">
              From Concept to Creation
            </h3>
            <p className="text-sm md:text-base font-light text-gray-500 mb-6">
              Intelligent AI workflows that bring your vision to life
            </p>
            
            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mt-8">
              <div className={`flex items-center gap-2 transition-all duration-500 ${activeNode >= 1 ? 'opacity-100' : 'opacity-30'}`}>
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                  activeNode >= 1 ? 'border-[#8b7355] bg-[#8b7355] text-white' : 'border-gray-600 text-gray-600'
                }`}>
                  {activeNode > 1 ? '✓' : '1'}
                </div>
                <span className="text-xs text-gray-400 hidden md:inline">Upload</span>
              </div>
              
              <div className={`h-0.5 w-12 transition-all duration-500 ${
                activeNode >= 2 ? 'bg-[#8b7355]' : 'bg-gray-700'
              }`} />
              
              <div className={`flex items-center gap-2 transition-all duration-500 ${activeNode >= 2 ? 'opacity-100' : 'opacity-30'}`}>
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                  activeNode >= 2 ? 'border-[#8b7355] bg-[#8b7355] text-white' : 'border-gray-600 text-gray-600'
                }`}>
                  {activeNode > 2 ? '✓' : '2'}
                </div>
                <span className="text-xs text-gray-400 hidden md:inline">Generate</span>
              </div>
              
              <div className={`h-0.5 w-12 transition-all duration-500 ${
                activeNode >= 3 ? 'bg-[#8b7355]' : 'bg-gray-700'
              }`} />
              
              <div className={`flex items-center gap-2 transition-all duration-500 ${activeNode >= 3 ? 'opacity-100' : 'opacity-30'}`}>
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                  activeNode >= 3 ? 'border-[#8b7355] bg-[#8b7355] text-white' : 'border-gray-600 text-gray-600'
                }`}>
                  {activeNode >= 3 ? '✓' : '3'}
                </div>
                <span className="text-xs text-gray-400 hidden md:inline">Complete</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="relative z-10 pb-24 flex items-center justify-center">
        <Link
          href="/workflow"
          className="px-8 py-3 rounded-lg bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white text-sm font-light tracking-wide hover:shadow-lg hover:shadow-[#8b7355]/30 transition-all hover:scale-105"
        >
          Start Creating
        </Link>
      </div>

      <style jsx>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }

        @media (max-width: 768px) {
          /* Adjust positions for mobile to prevent stacking */
          .animation-wrapper > div > div:nth-child(2) {
            /* Node 1 - Source */
            right: 5% !important;
            top: 10% !important;
            transform: none !important;
          }
          
          .animation-wrapper > div > div:nth-child(3) {
            /* Node 2 - Generate */
            left: 5% !important;
            top: 45% !important;
            transform: none !important;
          }
          
          .animation-wrapper > div > div:nth-child(4) {
            /* Node 3 - Output */
            right: 5% !important;
            bottom: 5% !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-spin-slow,
          .animate-pulse {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

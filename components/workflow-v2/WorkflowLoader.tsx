'use client';

import { useEffect, useRef, useState } from 'react';

export function WorkflowLoader() {
  const emitterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!emitterRef.current) return;
    
    // Clear previous just in case
    emitterRef.current.innerHTML = '';
    
    const particleCount = 60;
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'absolute bg-white rounded-full opacity-0 blur-[0.5px]';
        
        // Randomize particle behavior
        const duration = 3 + Math.random() * 4;
        const delay = Math.random() * -7;
        const size = 1 + Math.random() * 2;
        
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = '50%';
        particle.style.top = '50%';
        particle.style.animation = `swirl ${duration}s linear infinite`;
        particle.style.animationDelay = `${delay}s`;
        
        emitterRef.current.appendChild(particle);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-40 bg-[#0a0a0a] text-white m-0 p-0 overflow-hidden select-none">
      <style dangerouslySetInnerHTML={{ __html: `
        .obsidian-texture {
            background-color: #0a0a0a;
            background-image: 
                radial-gradient(circle at 50% 50%, #171717 0%, #0a0a0a 100%),
                url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
            background-blend-mode: overlay;
        }
        @keyframes swirl {
            0% { transform: rotate(0deg) translateX(150px) rotate(0deg) scale(0) translateZ(0); opacity: 0; }
            20% { opacity: 0.8; background: #f59e0b; }
            50% { transform: rotate(180deg) translateX(40px) rotate(-180deg) scale(1.5) translateZ(50px); opacity: 1; background: #ffffff; box-shadow: 0 0 10px rgba(245, 158, 11, 0.5); }
            80% { opacity: 0.8; }
            100% { transform: rotate(360deg) translateX(0px) rotate(-360deg) scale(0) translateZ(-100px); opacity: 0; }
        }
        @keyframes corePulse {
            0%, 100% { transform: scale(1); opacity: 0.3; }
            50% { transform: scale(1.5); opacity: 0.7; }
        }
        @keyframes textDepth {
            from { letter-spacing: 0.4em; opacity: 0.9; transform: translateY(0); }
            to { letter-spacing: 0.55em; opacity: 1; transform: translateY(-2px); }
        }
        @keyframes reveal {
            from { opacity: 0; transform: translateY(30px); filter: blur(15px); }
            to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes loading-bar-minimal {
            0% { transform: translateX(-100%) scaleX(0.1); }
            50% { transform: translateX(0%) scaleX(1); }
            100% { transform: translateX(100%) scaleX(0.1); }
        }
      `}} />
      <main className="obsidian-texture min-h-screen w-full flex flex-col items-center justify-center overflow-hidden">
        {/* Granular Particle Animation */}
        <div className="relative w-[400px] h-[400px] flex items-center justify-center mb-12" style={{ perspective: '1000px' }}>
          <div className="absolute w-[80px] h-[80px] rounded-full blur-[15px]" style={{ background: 'radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, transparent 70%)', animation: 'corePulse 4s ease-in-out infinite' }}></div>
          <div className="relative w-full h-full" style={{ transformStyle: 'preserve-3d' }} ref={emitterRef}></div>
        </div>

        {/* Branding Typography */}
        <div className="text-center space-y-10" style={{ animation: 'reveal 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
          <h1 className="font-extrabold text-white uppercase" style={{ textShadow: '0 0 30px rgba(255,255,255,0.3)', animation: 'textDepth 4s ease-in-out infinite alternate', fontSize: '4rem', fontFamily: 'Manrope, sans-serif' }}>
              WORKFLOW
          </h1>
          <div className="flex flex-col items-center gap-8">
            <p className="text-[11px] uppercase text-[#6b7280]/50 font-medium" style={{ letterSpacing: '0.7em', fontFamily: 'Inter, sans-serif' }}>
                Initializing your workspace environment
            </p>
            {/* Refined Kinetic Loader */}
            <div className="w-64 h-[1px] bg-white/5 relative overflow-hidden rounded-full">
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, transparent, rgba(245,158,11,0.4), transparent)', animation: 'loading-bar-minimal 4s infinite ease-in-out' }}></div>
            </div>
          </div>
        </div>

        {/* Interface Telemetry */}
        <div className="absolute bottom-10 left-10 opacity-20 group cursor-default">
          <p className="text-[9px] uppercase text-[#6b7280] flex items-center gap-2" style={{ letterSpacing: '0.4em', fontFamily: 'Inter, sans-serif' }}>
            <span className="w-1 h-1 bg-[#f59e0b] rounded-full animate-pulse"></span>
            Quantum Synthesis: <span className="text-white">Active</span>
          </p>
        </div>
        <div className="absolute top-10 right-10 opacity-20">
          <p className="text-[9px] uppercase text-[#6b7280]" style={{ letterSpacing: '0.4em', fontFamily: 'Inter, sans-serif' }}>
            GRANULAR_ENGINE // <span className="text-[#f59e0b]/80">STABLE</span>
          </p>
        </div>
        
        {/* Ambient Vignette */}
        <div className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.5) 100%)' }}></div>
      </main>
    </div>
  );
}

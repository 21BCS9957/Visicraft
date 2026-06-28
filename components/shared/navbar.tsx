'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, User, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';

export function Navbar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { credits } = useCredits();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);

  // GSAP spinning animation for logo on hover
  useEffect(() => {
    if (logoRef.current) {
      const logo = logoRef.current;
      
      const handleMouseEnter = () => {
        // Reset rotation to 0 first, then animate to 360
        gsap.set(logo, { rotation: 0 });
        gsap.to(logo, {
          rotation: 360,
          duration: 0.6,
          ease: "power2.out"
        });
      };

      logo.addEventListener('mouseenter', handleMouseEnter);
      
      return () => {
        logo.removeEventListener('mouseenter', handleMouseEnter);
      };
    }
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  const links = [
    { href: '/', label: 'Home' },
    { href: '/workflow', label: 'Workflow' },
    { href: '/generate', label: 'Generate' },
    { href: '/pricing', label: 'Pricing' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#08080a]/90 backdrop-blur-2xl">
      <div className="mx-auto w-full max-w-[1840px] px-5 sm:px-8">
        <div className="relative flex h-20 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            {/* Logo Image */}
            <div className="relative">
              <img 
                ref={logoRef}
                src="/new-section/logo.png" 
                alt="Visicraft Logo" 
                className="h-9 w-9 cursor-pointer object-contain sm:h-10 sm:w-10"
              />
            </div>
            <span className="text-base font-light tracking-wide text-white sm:text-xl">
              Visicraft
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex lg:gap-12">
            {links.map((item) => {
              const isActive = pathname === item.href;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    text-base font-light transition-colors duration-200
                    ${isActive 
                      ? 'text-white' 
                      : 'text-[#a6a6ad] hover:text-white'
                    }
                  `}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* User Profile / Auth */}
          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <>
                {/* Credits Display */}
                <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 sm:flex">
                  <Sparkles className="h-4 w-4 text-[#fff05a]" />
                  <span className="text-xs sm:text-sm font-light text-white">{credits}</span>
                  <span className="hidden text-xs text-[#a6a6ad] lg:inline">credits</span>
                </div>

                {/* Profile Menu */}
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/10 text-xs font-light text-white transition-transform hover:scale-105 sm:text-sm"
                  >
                    {user.user_metadata?.avatar_url ? (
                      <img 
                        src={user.user_metadata.avatar_url} 
                        alt="Profile" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      user.email?.[0].toUpperCase() || <User className="w-5 h-5" />
                    )}
                  </button>

                  <AnimatePresence>
                    {showUserMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-64 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl overflow-hidden"
                      >
                        {/* User Info */}
                        <div className="p-4 border-b border-white/10">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#8b7355] to-[#6b5545] flex items-center justify-center text-white font-light overflow-hidden border-2 border-[#8b7355]/30">
                              {user.user_metadata?.avatar_url ? (
                                <img 
                                  src={user.user_metadata.avatar_url} 
                                  alt="Profile" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                user.email?.[0].toUpperCase() || <User className="w-6 h-6" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white font-light truncate">{user.user_metadata?.full_name || user.email}</p>
                              <p className="text-xs text-gray-400 mt-0.5 truncate">{user.email}</p>
                            </div>
                          </div>
                        </div>

                        {/* Credits Info */}
                        <div className="p-4 bg-gradient-to-r from-[#8b7355]/10 to-[#6b5545]/10 border-b border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-5 h-5 text-[#c8b4a0]" />
                              <span className="text-sm text-gray-300">Credits</span>
                            </div>
                            <span className="text-2xl font-light text-white">{credits}</span>
                          </div>
                          <Link
                            href="/pricing"
                            className="mt-3 block text-center text-xs text-[#c8b4a0] hover:text-white transition-colors"
                            onClick={() => setShowUserMenu(false)}
                          >
                            Get more credits →
                          </Link>
                        </div>

                        {/* Sign Out */}
                        <button
                          onClick={() => {
                            signOut();
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden text-base font-light text-[#d8d8de] transition-colors hover:text-white sm:inline-flex"
                >
                  Log in
                </Link>
                <Link
                  href="/login"
                  className="rounded-full bg-[#f4f4f5] px-5 py-2 text-sm font-light text-black transition-colors hover:bg-white sm:px-6 sm:text-base"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

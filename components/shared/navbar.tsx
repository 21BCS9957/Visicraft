'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, User, Sparkles, Users } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { adminApi } from '@/lib/admin/client';

export function Navbar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { credits } = useCredits();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  // The GoGrowth admin gets a way into the team's workspaces (the server checks every request).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    adminApi.me().then((result) => live && setIsAdmin(result.admin)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user?.id]);

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

  // Full-screen tools draw their own top bar: a Playground project (and its Canvas) and the
  // Video Studio. The Playground hub and the Library keep the navbar.
  const fullScreen = pathname?.startsWith('/workflow')
    // Inside an image project (and its Canvas) or a video project; the hubs and the Library keep it.
    || /^\/playground\/(video\/[^/]+|[0-9a-f-]{8,}|preview)(\/|$)/i.test(pathname ?? '');
  if (fullScreen) {
    return null;
  }

  const links = [
    { href: '/', label: 'Home' },
    { href: '/playground', label: 'Playground' },
    { href: '/workflow', label: 'Workflow' },
    { href: '/generate', label: 'Generate' },
    { href: '/pricing', label: 'Pricing' },
  ];

  return (
    <nav className="fixed left-0 right-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
      <div className="mx-auto w-full max-w-[1840px]">
        <div className="relative flex h-16 items-center justify-between rounded-full border border-white/12 bg-[#101014]/52 px-4 shadow-[0_18px_70px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.10)] backdrop-blur-2xl backdrop-saturate-150 sm:h-[72px] sm:px-6">
          <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(115deg,rgba(255,255,255,0.12),rgba(255,255,255,0.025)_42%,rgba(255,240,90,0.055))]" />
          {/* Logo */}
          <Link href="/" className="group relative z-10 flex items-center gap-2">
            {/* Logo Image */}
            <div className="relative">
              <img 
                ref={logoRef}
                src="/brand/gogrowth-mark.png" 
                alt="" 
                className="h-9 w-9 cursor-pointer object-contain sm:h-10 sm:w-10"
              />
            </div>
            <img src="/brand/gogrowth-wordmark.png" alt="GoGrowth" className="h-[18px] w-auto object-contain sm:h-[21px]" />
          </Link>

          {/* Navigation Links */}
          <div className="absolute left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/8 bg-white/[0.035] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:flex">
            {links.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(`${item.href}/`));
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    rounded-full px-4 py-2 text-sm font-light transition-all duration-200 lg:px-5
                    ${isActive 
                      ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' 
                      : 'text-[#b9b9c0] hover:bg-white/7 hover:text-white'
                    }
                  `}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* User Profile / Auth */}
          <div className="relative z-10 flex items-center gap-2 sm:gap-3">
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
                        className="absolute right-0 top-full mt-3 w-64 overflow-hidden rounded-2xl border border-white/12 bg-[#151519]/88 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
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

                        {isAdmin && user && (
                          <Link
                            href="/admin/team"
                            onClick={() => setShowUserMenu(false)}
                            className="flex w-full items-center gap-3 border-b border-white/10 px-4 py-3 text-left text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                          >
                            <Users className="h-4 w-4" />
                            Team workspaces
                          </Link>
                        )}

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
                  className="rounded-full bg-[#f4f4f5] px-5 py-2 text-sm font-light text-black shadow-[0_10px_34px_rgba(255,255,255,0.08)] transition-colors hover:bg-white sm:px-6 sm:text-base"
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

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, User, Sparkles } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { credits, loading: creditsLoading } = useCredits();
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
    { href: '/', label: 'Home', icon: 'ph:house-fill' },
    { href: '/generate', label: 'Generate', icon: 'ph:magic-wand-fill' },
    { href: '/pricing', label: 'Pricing', icon: 'ph:currency-inr' },
  ];

  const handleSignOut = useCallback(async () => {
    await signOut();
    setShowUserMenu(false);
  }, [signOut]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1 sm:gap-1.5 group">
            {/* Logo Image */}
            <div className="relative">
              <img 
                ref={logoRef}
                src="/new-section/logo.png" 
                alt="Visicraft Logo" 
                className="w-9 h-9 sm:w-11 sm:h-11 object-contain cursor-pointer"
              />
            </div>
            <span className="text-white font-light text-base sm:text-xl tracking-wider">
              Visicraft
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            {/* Home Link */}
            <Link
              href="/"
              className={`
                flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-light tracking-wide
                transition-all duration-200
                ${pathname === '/' 
                  ? 'text-white bg-white/10' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
              `}
            >
              <Icon icon="ph:house-fill" width={14} height={14} className="sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Home</span>
            </Link>

            <Link
              href="/workflow"
              className={`
                flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-light tracking-wide
                transition-all duration-200
                ${pathname === '/workflow'
                  ? 'text-white bg-white/10'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
              `}
            >
              <Icon icon="ph:flow-arrow-fill" width={14} height={14} className="sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Workflow</span>
            </Link>

            {/* Other Links */}
            {links.slice(1).map((item) => {
              const isActive = pathname === item.href;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-light tracking-wide
                    transition-all duration-200
                    ${isActive 
                      ? 'text-white bg-white/10' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }
                  `}
                >
                  <Icon icon={item.icon} width={14} height={14} className="sm:w-4 sm:h-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* User Profile / Auth */}
          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <>
                {/* Credits Display */}
                <div className="hidden sm:flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-lg bg-gradient-to-r from-[#8b7355]/20 to-[#6b5545]/20 border border-[#8b7355]/30">
                  <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#c8b4a0]" />
                  <span className="text-xs sm:text-sm font-light text-white">{credits}</span>
                  <span className="text-[10px] sm:text-xs text-gray-400 hidden lg:inline">credits</span>
                </div>

                {/* Profile Menu */}
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#8b7355] to-[#6b5545] flex items-center justify-center text-white font-light text-xs sm:text-sm hover:scale-110 transition-transform overflow-hidden border-2 border-[#8b7355]/30"
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
              <Link
                href="/login"
                className="px-3 sm:px-4 lg:px-6 py-1.5 sm:py-2 rounded-lg bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white text-xs sm:text-sm font-light tracking-wide hover:shadow-lg hover:shadow-[#8b7355]/20 transition-all"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

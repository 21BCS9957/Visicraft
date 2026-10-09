'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Crown, Grid3x3, LogOut, Sparkles, User } from 'lucide-react';
import { BackgroundVariant } from 'reactflow';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';

interface TopbarProps {
  onNewWorkflow?: () => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  gridVariant?: BackgroundVariant;
  onChangeGridVariant?: (variant: BackgroundVariant) => void;
  onOrganizeNodes?: () => void;
  onOpenOnboarding?: () => void;
}

export function Topbar({ 
  showGrid = true, 
  onToggleGrid,
  gridVariant = BackgroundVariant.Dots,
  onChangeGridVariant,
}: TopbarProps) {
  const { user, signOut } = useAuth();
  const { credits } = useCredits();
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setShowAccountMenu(false);
      }
    };

    if (showAccountMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountMenu]);

  return (
    <div className="relative z-20 flex h-[76px] items-center justify-between px-7 pt-3 md:px-10">
      <div className="pointer-events-none absolute inset-x-3 top-3 h-16 rounded-full border border-white/10 bg-[#101014]/58 shadow-[0_18px_70px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl md:inset-x-5" />
      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
        <Link
          href="/"
          className="relative z-10 flex flex-shrink-0 items-center rounded-full px-2 py-1 text-white transition-colors hover:bg-white/7"
          title="Back to home"
        >
          <img src="/brand/gogrowth-mark.png" alt="GoGrowth" className="h-7 w-7 object-contain" />
        </Link>
        
        <input
          type="text"
          defaultValue={isMobile ? "Workflow" : "YouTube Thumbnail Workflow"}
          className="relative z-10 w-full max-w-[120px] rounded-full border border-transparent bg-transparent px-2 py-1 text-xs text-white outline-none transition-all placeholder:text-white/35 focus:max-w-[160px] focus:border-white/10 focus:bg-white/[0.04] md:max-w-[240px] md:text-sm md:focus:max-w-[320px]"
        />
      </div>

      <div className="relative z-10 flex flex-shrink-0 items-center gap-1 md:gap-2">
        {/* Grid Toggle with Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowGridMenu(!showGridMenu)}
            className={`flex items-center gap-1 rounded-full px-2 py-2 text-xs transition-colors md:gap-2 md:px-3 md:text-sm ${
              showGrid ? 'bg-white/10 text-white' : 'text-white/52 hover:bg-white/7 hover:text-white'
            }`}
            title="Grid Settings"
          >
            <Grid3x3 className="w-3 h-3 md:w-4 md:h-4" />
            {!isMobile && 'Grid'}
          </button>
          
          {showGridMenu && (
            <div className="absolute right-0 top-full z-50 mt-3 w-52 rounded-2xl border border-white/10 bg-[#151519]/92 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
              <button
                onClick={() => {
                  onToggleGrid?.();
                  setShowGridMenu(false);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/8"
              >
                <span>Show Grid</span>
                {showGrid && <Check className="w-4 h-4 text-[#fff05a]" />}
              </button>
              
              <div className="my-2 border-t border-white/10" />
              
              <div className="px-3 py-1 text-xs text-white/42">Grid Style</div>
              
              <button
                onClick={() => {
                  onChangeGridVariant?.(BackgroundVariant.Dots);
                  setShowGridMenu(false);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/8"
              >
                <span>Dots</span>
                {gridVariant === BackgroundVariant.Dots && <Check className="w-4 h-4 text-[#fff05a]" />}
              </button>
              
              <button
                onClick={() => {
                  onChangeGridVariant?.(BackgroundVariant.Lines);
                  setShowGridMenu(false);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/8"
              >
                <span>Lines</span>
                {gridVariant === BackgroundVariant.Lines && <Check className="w-4 h-4 text-[#fff05a]" />}
              </button>
              
              <button
                onClick={() => {
                  onChangeGridVariant?.(BackgroundVariant.Cross);
                  setShowGridMenu(false);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/8"
              >
                <span>Cross</span>
                {gridVariant === BackgroundVariant.Cross && <Check className="w-4 h-4 text-[#fff05a]" />}
              </button>
            </div>
          )}
        </div>

        <Link 
          href="/pricing"
          className="flex items-center gap-2 rounded-full bg-[#fff05a] px-3 py-2 text-sm font-medium text-black shadow-[0_12px_34px_rgba(255,240,90,0.12)] transition-colors hover:bg-white"
        >
          <Crown className="w-4 h-4" />
          Upgrade
        </Link>

        <div ref={accountMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setShowAccountMenu((value) => !value)}
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/12 bg-white/[0.075] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-white/12"
            title="Account"
          >
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="Account"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <User className="h-4 w-4" />
            )}
          </button>

          {showAccountMenu && (
            <div className="absolute right-0 top-full z-50 mt-3 w-72 overflow-hidden rounded-[24px] border border-white/10 bg-[#151519]/94 p-3 shadow-[0_24px_90px_rgba(0,0,0,0.50),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl">
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/12 bg-white/10 text-white">
                    {user?.user_metadata?.avatar_url ? (
                      <img
                        src={user.user_metadata.avatar_url}
                        alt="Account"
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {user?.user_metadata?.full_name || user?.email || 'Guest'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-white/42">
                      {user?.email || 'Sign in to save workflow runs'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#fff05a]/18 bg-[#fff05a]/10 px-3 py-3">
                  <div className="flex items-center gap-2 text-sm text-white/78">
                    <Sparkles className="h-4 w-4 text-[#fff05a]" />
                    Tokens left
                  </div>
                  <span className="text-lg font-semibold text-white">{user ? credits : 0}</span>
                </div>
              </div>

              <div className="mt-2 grid gap-2">
                <Link
                  href="/pricing"
                  onClick={() => setShowAccountMenu(false)}
                  className="rounded-full bg-[#fff05a] px-4 py-2.5 text-center text-sm font-medium text-black transition-colors hover:bg-white"
                >
                  Add more tokens
                </Link>
                {user ? (
                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      setShowAccountMenu(false);
                    }}
                    className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm text-white/58 transition-colors hover:bg-white/8 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                ) : (
                  <Link
                    href="/login?redirectTo=/workflow"
                    onClick={() => setShowAccountMenu(false)}
                    className="rounded-full px-4 py-2.5 text-center text-sm text-white/58 transition-colors hover:bg-white/8 hover:text-white"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

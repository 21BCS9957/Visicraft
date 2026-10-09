'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase/client';

interface CreditsContextType {
  credits: number;
  loading: boolean;
  refreshCredits: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextType>({
  credits: 0,
  loading: true,
  refreshCredits: async () => {},
});

export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const refreshCredits = useCallback(async () => {
    if (!userId) {
      if (!authLoading) {
        setCredits(0);
        setLoading(false);
      }
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('⚠️ Skipping credits refresh while offline');
      setLoading(false);
      return;
    }

    try {
      console.log('🔄 Fetching credits for user:', userId);
      
      // Fetch user credits from database
      const { data, error } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.log('⚠️ Credits fetch error:', error.code, error.message);
        
        // No credits row yet: the sign-up trigger creates it (credits are only ever written by the server).
        if (error.code === 'PGRST116') {
          setCredits(0);
        } else {
          console.error('❌ Unexpected error fetching credits:', error);
        }
      } else if (data) {
        console.log('✅ Credits fetched successfully:', data.credits);
        setCredits(data.credits);
      }
    } catch (error) {
      console.error('❌ Error in refreshCredits:', error);
    } finally {
      setLoading(false);
    }
  }, [authLoading, userId]);

  // Only refetch when user ID changes, not on every auth state change (e.g. TOKEN_REFRESHED)
  // which would cause repeated "Fetching credits" logs during long operations like image gen
  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    // Also re-read the balance when the tab comes back into view (e.g. after paying in another tab).
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshCredits();
    };
    window.addEventListener('online', refreshCredits);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', refreshCredits);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshCredits, userId]);

  // Live balance: the database pushes every change to this user's credits row (charges and
  // refunds from any flow, purchases), so the number updates without a page refresh.
  // Needs user_credits in the supabase_realtime publication (supabase/migrations/202609300002_live_credits.sql).
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`credits:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_credits', filter: `user_id=eq.${userId}` },
        (payload) => {
          const next = (payload.new as { credits?: unknown } | null)?.credits;
          if (typeof next === 'number') setCredits(next);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <CreditsContext.Provider value={{ credits, loading, refreshCredits }}>
      {children}
    </CreditsContext.Provider>
  );
}

export const useCredits = () => {
  const context = useContext(CreditsContext);
  if (!context) {
    throw new Error('useCredits must be used within CreditsProvider');
  }
  return context;
};

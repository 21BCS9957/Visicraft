'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase/client';

interface CreditsContextType {
  credits: number;
  loading: boolean;
  refreshCredits: () => Promise<void>;
  deductCredits: (amount: number) => Promise<boolean>;
  addCredits: (amount: number) => Promise<boolean>;
}

const CreditsContext = createContext<CreditsContextType>({
  credits: 0,
  loading: true,
  refreshCredits: async () => {},
  deductCredits: async () => false,
  addCredits: async () => false,
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
        
        // If user doesn't exist in credits table, create with 100 free credits
        if (error.code === 'PGRST116') {
          console.log('🎁 Creating new user credits entry with 100 free credits...');
          
          const { data: newData, error: insertError } = await supabase
            .from('user_credits')
            .insert({
              user_id: userId,
              credits: 100,
            })
            .select()
            .single();

          if (insertError) {
            console.error('❌ Failed to create credits:', insertError);
          } else if (newData) {
            console.log('✅ Credits created successfully:', newData.credits);
            setCredits(newData.credits);
          }
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

  const deductCredits = async (amount: number): Promise<boolean> => {
    if (!user) {
      console.error('❌ Cannot deduct credits: No user logged in');
      return false;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', user.id)
        .single();

      if (fetchError || data == null) {
        console.error('❌ Failed to fetch credits for deduction', fetchError);
        return false;
      }

      const currentCredits = Number(data.credits) || 0;
      if (currentCredits < amount) {
        console.error('❌ Cannot deduct credits: Insufficient balance', { need: amount, have: currentCredits });
        return false;
      }

      const newCredits = currentCredits - amount;
      console.log('💳 Deducting credits:', { amount, oldBalance: currentCredits, newBalance: newCredits });

      const { error } = await supabase
        .from('user_credits')
        .update({ credits: newCredits })
        .eq('user_id', user.id);

      if (!error) {
        setCredits(newCredits);
        return true;
      }
      console.error('❌ Failed to deduct credits:', error);
      return false;
    } catch (error) {
      console.error('❌ Error deducting credits:', error);
      return false;
    }
  };

  const addCredits = async (amount: number): Promise<boolean> => {
    if (!user) {
      console.error('❌ Cannot add credits: No user logged in');
      return false;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', user.id)
        .single();

      if (fetchError || data == null) {
        console.error('❌ Failed to fetch credits for refund', fetchError);
        return false;
      }

      const currentCredits = Number(data.credits) || 0;
      const newCredits = currentCredits + amount;
      console.log('💰 Refunding credits:', { amount, oldBalance: currentCredits, newBalance: newCredits });

      const { error } = await supabase
        .from('user_credits')
        .update({ credits: newCredits })
        .eq('user_id', user.id);

      if (!error) {
        setCredits(newCredits);
        return true;
      }
      console.error('❌ Failed to add credits:', error);
      return false;
    } catch (error) {
      console.error('❌ Error adding credits:', error);
      return false;
    }
  };

  // Only refetch when user ID changes, not on every auth state change (e.g. TOKEN_REFRESHED)
  // which would cause repeated "Fetching credits" logs during long operations like image gen
  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    window.addEventListener('online', refreshCredits);
    return () => window.removeEventListener('online', refreshCredits);
  }, [refreshCredits, userId]);

  return (
    <CreditsContext.Provider value={{ credits, loading, refreshCredits, deductCredits, addCredits }}>
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

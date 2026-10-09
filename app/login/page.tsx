'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';
import { signInWithGoogle } from '@/lib/supabase/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from '@/lib/toast';

function LoginContent() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
      toast.success('Redirecting to Google...');
      
      // If there's a redirect parameter, we'll handle it after auth
      if (redirectTo) {
        sessionStorage.setItem('redirectAfterLogin', redirectTo);
      }
    } catch (error) {
      console.error('Sign in error:', error);
      toast.error('Failed to sign in. Please try again.');
      setLoading(false);
    }
  };

  // Handle redirect after successful login
  useEffect(() => {
    const redirect = sessionStorage.getItem('redirectAfterLogin');
    if (redirect) {
      sessionStorage.removeItem('redirectAfterLogin');
      router.push(redirect);
    }
  }, [router]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
      <div
        className="absolute inset-0 opacity-[0.028]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #ffffff 1px, transparent 1px),
            linear-gradient(to bottom, #ffffff 1px, transparent 1px)
          `,
          backgroundSize: '4rem 4rem',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_36%),linear-gradient(to_bottom,transparent,#08080a_78%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1280px] items-center px-5 py-28 sm:px-8">
        <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.72fr)] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="hidden lg:block"
          >
            <p className="text-xs font-light uppercase tracking-[0.28em] text-white/36">
              Your creative workspace
            </p>
            <h1 className="mt-4 max-w-3xl text-[clamp(3.8rem,6.4vw,7.2rem)] font-light leading-[0.94] text-[#f4f4f5]">
              Sign in and keep your product assets moving.
            </h1>
            <p className="mt-6 max-w-xl text-lg font-light leading-relaxed text-[#a6a6ad]">
              Save generations, manage credits, and turn product links into reusable campaign visuals.
            </p>
            <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
              {['Product links', 'Creative sets', 'Saved exports'].map((item) => (
                <div key={item} className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl">
                  <Sparkles className="mb-5 h-4 w-4 text-[#fff05a]" />
                  <p className="text-sm font-light text-white/72">{item}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="mx-auto w-full max-w-[520px]">
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative overflow-hidden rounded-[32px] border border-white/12 bg-[#151519]/74 p-5 shadow-[0_34px_120px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:p-8"
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),transparent_40%),radial-gradient(circle_at_76%_12%,rgba(255,240,90,0.12),transparent_28%)]" />
              <div className="relative z-10">
                <div className="mb-8 flex items-center justify-between">
                  <div>
                    <img
                      src="/brand/gogrowth-logo.png"
                      alt="GoGrowth"
                      className="h-9 w-auto object-contain"
                    />
                    <p className="mt-1.5 text-xs font-light text-white/42">AI creative studio</p>
                  </div>
                  <span className="rounded-full border border-[#fff05a]/24 bg-[#fff05a]/10 px-3 py-1 text-xs font-light text-[#fff05a]">
                    Secure
                  </span>
                </div>

                <div className="mb-8">
                  <p className="text-xs font-light uppercase tracking-[0.24em] text-white/36">Welcome back</p>
                  <h2 className="mt-3 text-4xl font-light leading-none text-[#f4f4f5] sm:text-5xl">
                    Continue creating.
                  </h2>
                  <p className="mt-4 text-sm font-light leading-relaxed text-white/52 sm:text-base">
                    Sign in to access your workflow editor, credits, saved generations, and product campaigns.
                  </p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="inline-flex h-[52px] w-full items-center justify-center gap-3 rounded-full bg-[#f4f4f5] px-5 text-base font-medium text-black shadow-[0_18px_48px_rgba(255,255,255,0.10)] transition-colors hover:bg-[#fff05a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </motion.button>

                <div className="my-7 flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-xs font-light text-white/34">Protected by Supabase Auth</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <div className="grid gap-2.5 text-sm font-light text-white/58">
                  {[
                    'Access the workflow editor',
                    'Generate product images and videos',
                    'Save and manage your campaigns',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#fff05a]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <p className="mt-6 text-center text-xs font-light leading-relaxed text-white/32">
                  By signing in, you agree to our Terms of Service and Privacy Policy.
                </p>
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-5 text-center text-sm font-light text-white/42"
            >
              New to Visicraft? <span className="text-[#fff05a]">Get started for free</span>
            </motion.p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

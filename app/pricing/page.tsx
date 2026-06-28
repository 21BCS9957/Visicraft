'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import toast from '@/lib/toast';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    Razorpay: any;
  }
}

type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

const pricingTiers = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for beginners and hobbyists',
    icon: 'ph:lightning-fill',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderColor: '#667eea',
    monthly: 499,
    quarterly: 424,
    yearly: 399,
    credits: 1000,
    creditCost: 0.50, // ₹0.50 per credit
    features: {
      included: [
        '1,000 credits/month',
        'Gemini 2 Flash model',
        '1080p resolution (30 credits)',
        'YouTube thumbnails',
        'Visual workflow canvas',
        'Watermark-free exports',
        'Email support',
        '~33 generations/month',
      ],
      excluded: [
        'Banana Pro models',
        '2K/4K resolution',
        'Amazon creatives',
        'Priority support',
      ],
    },
    popular: false,
    cta: 'Get Started',
  },
  {
    id: 'creator',
    name: 'Creator',
    description: 'For active content creators',
    icon: 'ph:sparkle-fill',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    borderColor: '#f5576c',
    badge: 'MOST POPULAR',
    badgeColor: '#ff4d6d',
    monthly: 999,
    quarterly: 849,
    yearly: 799,
    credits: 2500,
    creditCost: 0.40, // ₹0.40 per credit
    features: {
      included: [
        '2,500 credits/month',
        'All Gemini models',
        'Banana Pro 2K (50 credits)',
        'Banana Pro 4K (70 credits)',
        'YouTube + Amazon creatives',
        'Meta ads creatives',
        '2K resolution support',
        'Priority generation queue',
        'Priority workflow runs',
        'Live chat support',
        '~50 Banana Pro 2K generations',
      ],
      excluded: [
        'API access',
        'Team collaboration',
        'Custom workflows',
      ],
    },
    popular: true,
    cta: 'Start Creating',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For agencies and power users',
    icon: 'ph:crown-fill',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    borderColor: '#00f2fe',
    monthly: 1999,
    quarterly: 1699,
    yearly: 1599,
    credits: 6000,
    creditCost: 0.33, // ₹0.33 per credit
    features: {
      included: [
        '6,000 credits/month',
        'All AI models unlocked',
        'Banana Pro 2K & 4K',
        '4K resolution support',
        'Unlimited canvas projects',
        'Instant generation (no queue)',
        'API access & webhooks',
        'Batch processing (50 images)',
        'Brand kit (logos, colors)',
        'Team collaboration (3 seats)',
        'Priority support',
        'Custom workflows',
        '~120 Banana Pro 2K generations',
      ],
      excluded: [
        'Unlimited generations',
        'White-label options',
      ],
    },
    popular: false,
    cta: 'Go Pro',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Custom solutions for large teams',
    icon: 'ph:buildings-fill',
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    borderColor: '#fee140',
    monthly: null,
    quarterly: null,
    yearly: null,
    credits: 'Custom',
    creditCost: 'Negotiable',
    features: {
      included: [
        'Custom credit allocation',
        'Volume discounts available',
        'Dedicated account manager',
        'Custom AI model training',
        'White-label platform',
        '99.9% SLA guarantee',
        'Unlimited team seats',
        'SSO & advanced security',
        'Custom integrations',
        'On-premise deployment option',
        '24/7 phone support',
        'Custom billing cycles',
        'Direct support at support@visicraft.in',
      ],
      excluded: [],
    },
    popular: false,
    cta: 'Email Sales',
  },
];

const billingOptions = {
  monthly: { label: 'Monthly', discount: null },
  quarterly: { label: 'Quarterly', discount: '-15%' },
  yearly: { label: 'Yearly', discount: '-20%' },
};

const SUPPORT_EMAIL = 'support@visicraft.in';

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [hoveredTier, setHoveredTier] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const { user } = useAuth();
  const { refreshCredits } = useCredits();
  const router = useRouter();

  const handlePayment = async (tier: typeof pricingTiers[0]) => {
    // Enterprise should be reachable without forcing a login first.
    if (tier.id === 'enterprise') {
      const subject = encodeURIComponent('Enterprise plan inquiry');
      const body = encodeURIComponent(
        'Hi Visicraft team,\n\nI am interested in a custom Enterprise plan. Please share details for team pricing, usage, and onboarding.\n\nThanks,'
      );
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
      toast.success('Opening email for enterprise sales...');
      return;
    }

    // Check if user is logged in
    if (!user) {
      toast.error('Please sign in to purchase a plan');
      router.push('/login?redirectTo=/pricing');
      return;
    }

    const pricePerMonth = tier[billingCycle];
    if (!pricePerMonth) return;

    // Calculate total amount based on billing cycle
    let totalAmount = pricePerMonth;
    let months = 1;
    
    if (billingCycle === 'quarterly') {
      months = 3;
      totalAmount = pricePerMonth * 3;
    } else if (billingCycle === 'yearly') {
      months = 12;
      totalAmount = pricePerMonth * 12;
    }

    // Calculate total credits
    const totalCredits = typeof tier.credits === 'number' ? tier.credits * months : 0;

    setProcessingPayment(tier.id);

    try {
      // Create order on backend
      const orderResponse = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalAmount,
          planName: tier.name,
          billingCycle,
          credits: totalCredits,
          planId: tier.id,
          userId: user.id,
        }),
      });

      if (!orderResponse.ok) {
        throw new Error('Failed to create order');
      }

      const { orderId, amount: orderAmount } = await orderResponse.json();

      // Load Razorpay script if not already loaded
      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }

      // Initialize Razorpay
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
        amount: orderAmount,
        currency: 'INR',
        name: 'Visicraft',
        description: `${tier.name} Plan - ${billingCycle} (${totalCredits.toLocaleString()} credits)`,
        order_id: orderId,
        prefill: {
          email: user.email || '',
          name: user.user_metadata?.name || '',
          contact: user.user_metadata?.phone || '',
        },
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
        },
        theme: {
          color: '#8b5cf6',
        },
        handler: async function (response: any) {
          try {
            console.log('💳 Payment completed, verifying...', response);
            
            // Verify payment on backend
            const verifyResponse = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                planName: tier.name,
                planId: tier.id,
                amount: totalAmount,
                credits: totalCredits,
                billingCycle,
                userId: user.id,
              }),
            });

            const verifyData = await verifyResponse.json();
            console.log('📋 Verification response:', verifyData);

            if (verifyData.success) {
              // Refresh credits immediately to show updated balance
              await refreshCredits();
              
              toast.success(`Payment successful! ${totalCredits.toLocaleString()} credits added to your account.`);
              
              // Redirect to dashboard or workflow
              setTimeout(() => {
                router.push('/workflow');
              }, 2000);
            } else {
              console.error('❌ Verification failed:', verifyData);
              toast.error(`Payment verification failed: ${verifyData.error || 'Unknown error'}`);
            }
          } catch (error: any) {
            console.error('❌ Payment verification error:', error);
            toast.error(`Payment verification failed: ${error.message || 'Network error'}`);
          } finally {
            setProcessingPayment(null);
          }
        },
        modal: {
          ondismiss: function () {
            setProcessingPayment(null);
            toast.error('Payment cancelled');
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Failed to initiate payment');
      setProcessingPayment(null);
    }
  };

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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_36%),linear-gradient(to_bottom,transparent,#08080a_74%)]" />

      <div className="relative z-10 mx-auto w-full max-w-[1840px] px-5 pb-16 pt-28 sm:px-8 sm:pb-24 sm:pt-32">
        <div className="mx-auto flex max-w-[1760px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
          >
            <p className="text-xs font-light uppercase tracking-[0.28em] text-white/36 sm:text-sm">
              Pricing built for creative volume
            </p>
            <h1 className="mt-3 text-[clamp(2.35rem,5vw,5.2rem)] font-light leading-[0.98] tracking-normal text-[#f4f4f5]">
              Plans that scale with your campaigns.
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-light leading-relaxed text-[#a6a6ad] sm:text-base">
              Pick credits, generate product visuals, and upgrade when your creative volume grows.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="w-full max-w-xl lg:max-w-[520px]"
          >
            <div className="grid w-full grid-cols-3 rounded-full border border-white/12 bg-[#151519]/64 p-1.5 shadow-[0_18px_70px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
              {(Object.keys(billingOptions) as BillingCycle[]).map((cycle) => (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => setBillingCycle(cycle)}
                  className={`relative min-h-11 rounded-full px-3 text-sm font-light transition-colors ${
                    billingCycle === cycle ? 'text-black' : 'text-white/58 hover:text-white'
                  }`}
                >
                  {billingCycle === cycle && (
                    <motion.div
                      layoutId="billing-bg"
                      className="absolute inset-0 rounded-full bg-[#f4f4f5] shadow-[0_10px_34px_rgba(255,255,255,0.12)]"
                      transition={{ type: 'spring', bounce: 0.18, duration: 0.55 }}
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
                    {billingOptions[cycle].label}
                    {billingOptions[cycle].discount && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        billingCycle === cycle ? 'bg-black/10 text-black/70' : 'bg-[#fff05a]/12 text-[#fff05a]'
                      }`}>
                        {billingOptions[cycle].discount}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:mt-9 sm:grid-cols-2 lg:grid-cols-4">
          {pricingTiers.map((tier, index) => {
            const isEnterprise = tier.id === 'enterprise';
            const isHovered = hoveredTier === tier.id;

            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 + 0.16 }}
                onMouseEnter={() => setHoveredTier(tier.id)}
                onMouseLeave={() => setHoveredTier(null)}
                className={`relative flex ${tier.popular ? 'lg:-translate-y-4' : ''}`}
              >
                {tier.badge && (
                  <div className="absolute left-5 top-5 z-20 rounded-full bg-[#fff05a] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-black">
                    {tier.badge}
                  </div>
                )}

                <div
                  className={`relative flex min-h-[720px] w-full flex-col overflow-hidden rounded-[28px] border p-5 transition-all duration-300 sm:p-6 ${
                    tier.popular
                      ? 'border-[#fff05a]/40 bg-[#181816]/78 shadow-[0_34px_110px_rgba(255,240,90,0.10)]'
                      : 'border-white/10 bg-[#151519]/72 shadow-[0_28px_90px_rgba(0,0,0,0.34)]'
                  }`}
                  style={{
                    borderColor: isHovered
                      ? tier.popular
                        ? 'rgba(255, 240, 90, 0.58)'
                        : 'rgba(255,255,255,0.22)'
                      : undefined,
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(255,240,90,0.10),transparent_24%)]" />

                  <div className="relative z-10">
                    <div className="mb-6 flex items-start justify-between gap-4 pt-8">
                      <div>
                        <h3 className="text-3xl font-light leading-none text-white">{tier.name}</h3>
                        <p className="mt-3 min-h-[42px] text-sm font-light leading-relaxed text-white/50">
                          {tier.description}
                        </p>
                      </div>
                      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border ${
                        tier.popular ? 'border-[#fff05a]/28 bg-[#fff05a]/14' : 'border-white/10 bg-white/6'
                      }`}>
                        <Icon icon={tier.icon} width={22} height={22} className={tier.popular ? 'text-[#fff05a]' : 'text-white/74'} />
                      </div>
                    </div>

                    <div className="mb-6">
                      {tier.monthly !== null ? (
                        <>
                          <div className="flex items-end gap-2">
                            <span className="text-[clamp(2.35rem,3vw,3.35rem)] font-light leading-none text-white">
                              ₹{tier[billingCycle]?.toLocaleString('en-IN')}
                            </span>
                            <span className="pb-1.5 text-sm font-light text-white/44">/mo</span>
                          </div>
                          <p className="mt-2 text-xs font-light text-white/38">
                            {billingCycle === 'monthly'
                              ? 'Billed monthly'
                              : `Billed ${billingCycle === 'quarterly' ? 'quarterly' : 'annually'}`
                            }
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="text-[clamp(2.35rem,3vw,3.35rem)] font-light leading-none text-white">
                            Custom
                          </div>
                          <a
                            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Enterprise plan inquiry')}`}
                            className="mt-2 inline-flex break-all text-sm font-light text-[#fff05a] transition-colors hover:text-white"
                          >
                            {SUPPORT_EMAIL}
                          </a>
                        </>
                      )}
                    </div>

                    <div className="mb-6 rounded-[18px] border border-white/10 bg-black/22 p-4">
                      <div className="flex items-center gap-2">
                        <Icon icon="ph:sparkle-fill" width={16} height={16} className="text-[#fff05a]" />
                        <span className="text-sm font-light text-white">
                          {typeof tier.credits === 'number'
                            ? `${tier.credits.toLocaleString()} credits/month`
                            : `${tier.credits} usage`
                          }
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-light text-white/42">
                        {typeof tier.creditCost === 'number'
                          ? `₹${tier.creditCost.toFixed(2)} per credit`
                          : 'Volume pricing and custom billing available'
                        }
                      </p>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.015 }}
                      whileTap={{ scale: 0.985 }}
                      type="button"
                      onClick={() => handlePayment(tier)}
                      disabled={processingPayment === tier.id}
                      className={`mb-7 inline-flex h-12 w-full items-center justify-center rounded-full text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                        tier.popular
                          ? 'bg-[#fff05a] text-black shadow-[0_18px_48px_rgba(255,240,90,0.16)] hover:bg-white'
                          : isEnterprise
                            ? 'border border-[#fff05a]/28 bg-[#fff05a]/10 text-[#fff05a] hover:bg-[#fff05a] hover:text-black'
                            : 'border border-white/12 bg-white/6 text-white hover:border-white/28 hover:bg-white/10'
                      }`}
                    >
                      {processingPayment === tier.id ? 'Processing...' : tier.cta}
                    </motion.button>
                  </div>

                  <div className="relative z-10 flex-1">
                    <div className="space-y-2.5">
                      {tier.features.included.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-sm">
                          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#fff05a]" />
                          <span className="font-light leading-relaxed text-white/72">{feature}</span>
                        </div>
                      ))}
                      {tier.features.excluded.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-sm opacity-42">
                          <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-white/24" />
                          <span className="font-light leading-relaxed text-white/34">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mx-auto mt-12 flex max-w-4xl flex-col items-center gap-4 rounded-[28px] border border-white/10 bg-white/[0.035] p-5 text-center shadow-[0_24px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:mt-16 sm:flex-row sm:justify-between sm:p-6 sm:text-left"
        >
          <div>
            <p className="text-base font-light text-white">Need help choosing?</p>
            <p className="mt-1 text-sm font-light text-white/48">
              All plans include watermark-free exports, secure payments, and creator-ready outputs.
            </p>
          </div>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex h-11 flex-shrink-0 items-center justify-center rounded-full border border-white/12 bg-white px-5 text-sm font-medium text-black transition-colors hover:bg-[#fff05a]"
          >
            Email support
          </a>
        </motion.div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import toast from 'react-hot-toast';
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
        'Basic templates',
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
        'Meta ads templates',
        '2K resolution support',
        'Priority generation queue',
        'Premium templates',
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
        'Unlimited templates',
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
      ],
      excluded: [],
    },
    popular: false,
    cta: 'Contact Sales',
  },
];

const billingOptions = {
  monthly: { label: 'Monthly', discount: null },
  quarterly: { label: 'Quarterly', discount: '-15%' },
  yearly: { label: 'Yearly', discount: '-20%' },
};

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [hoveredTier, setHoveredTier] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const { user } = useAuth();
  const { refreshCredits } = useCredits();
  const router = useRouter();

  const handlePayment = async (tier: typeof pricingTiers[0]) => {
    // Check if user is logged in
    if (!user) {
      toast.error('Please sign in to purchase a plan');
      router.push('/login?redirectTo=/pricing');
      return;
    }

    // Handle enterprise plan
    if (tier.id === 'enterprise') {
      toast.success('Redirecting to contact sales...');
      // You can add a contact form or email link here
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
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl md:text-7xl font-light text-white tracking-wider mb-4">
            CHOOSE YOUR<br/>CREATIVE POWER
          </h1>
          <p className="text-lg text-gray-400 font-light max-w-2xl mx-auto">
            Generate stunning visuals for YouTube, Amazon, and social media with AI
          </p>
        </motion.div>

        {/* Billing Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex justify-center mb-16"
        >
          <div className="inline-flex bg-[#1a1a1a] p-1.5 rounded-lg border border-white/10">
            {(Object.keys(billingOptions) as BillingCycle[]).map((cycle) => (
              <button
                key={cycle}
                onClick={() => setBillingCycle(cycle)}
                className={`
                  relative px-6 py-2 rounded-lg text-sm font-light tracking-wide transition-all
                  ${billingCycle === cycle
                    ? 'text-white'
                    : 'text-gray-400 hover:text-gray-300'
                  }
                `}
              >
                {billingCycle === cycle && (
                  <motion.div
                    layoutId="billing-bg"
                    className="absolute inset-0 bg-white/10 rounded-lg"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10">
                  {billingOptions[cycle].label}
                </span>
                {billingOptions[cycle].discount && (
                  <span className="ml-2 text-xs bg-[#8b7355]/20 text-[#c8b4a0] px-2 py-0.5 rounded-full">
                    {billingOptions[cycle].discount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pricingTiers.map((tier, index) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 + 0.2 }}
              onMouseEnter={() => setHoveredTier(tier.id)}
              onMouseLeave={() => setHoveredTier(null)}
              className={`
                relative rounded-lg overflow-hidden
                ${tier.popular ? 'md:scale-105' : ''}
              `}
            >
              {/* Popular Badge */}
              {tier.badge && (
                <div className="absolute top-4 right-4 z-20 px-3 py-1 rounded-lg text-xs font-light tracking-wide bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white">
                  {tier.badge}
                </div>
              )}

              {/* Card Content */}
              <div
                className="relative bg-[#1a1a1a] border rounded-lg p-6 h-full flex flex-col transition-all duration-300"
                style={{
                  borderColor: hoveredTier === tier.id ? 'rgba(139, 115, 85, 0.3)' : 'rgba(255,255,255,0.1)',
                }}
              >
                {/* Icon & Name */}
                <div className="mb-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#8b7355]/20 to-[#6b5545]/20 flex items-center justify-center mb-3 border border-[#8b7355]/30">
                    <Icon icon={tier.icon} width={24} height={24} className="text-[#c8b4a0]" />
                  </div>
                  <h3 className="text-2xl font-light text-white mb-1">{tier.name}</h3>
                  <p className="text-sm text-gray-400 font-light">{tier.description}</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  {tier.monthly !== null ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-light text-white">
                          ₹{tier[billingCycle]?.toLocaleString('en-IN')}
                        </span>
                        <span className="text-gray-400 font-light">/month</span>
                      </div>
                      {billingCycle !== 'monthly' && (
                        <p className="text-xs text-gray-500 mt-1 font-light">
                          Billed {billingCycle === 'quarterly' ? 'quarterly' : 'annually'}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="text-3xl font-light text-white">Custom</div>
                  )}
                </div>

                {/* Credits */}
                <div className="mb-6 p-3 rounded-lg bg-[#8b7355]/10 border border-[#8b7355]/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon icon="ph:sparkle-fill" width={16} height={16} className="text-[#c8b4a0]" />
                    <span className="font-light text-white">
                      {typeof tier.credits === 'number'
                        ? `${tier.credits.toLocaleString()} credits/month`
                        : tier.credits
                      }
                    </span>
                  </div>
                  {typeof tier.creditCost === 'number' && (
                    <p className="text-xs text-gray-400 ml-6 font-light">
                      ₹{tier.creditCost.toFixed(2)} per credit
                    </p>
                  )}
                </div>

                {/* CTA Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handlePayment(tier)}
                  disabled={processingPayment === tier.id}
                  className={`
                    w-full py-3 rounded-lg font-light tracking-wide mb-6 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                    ${tier.popular 
                      ? 'bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white hover:shadow-lg hover:shadow-[#8b7355]/20' 
                      : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                    }
                  `}
                >
                  {processingPayment === tier.id ? 'Processing...' : tier.cta}
                </motion.button>

                {/* Features */}
                <div className="flex-1">
                  <div className="space-y-3">
                    {tier.features.included.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#c8b4a0]" />
                        <span className="text-gray-300 font-light">{feature}</span>
                      </div>
                    ))}
                    {tier.features.excluded.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm opacity-40">
                        <X className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-600" />
                        <span className="text-gray-500 font-light">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-20 text-center"
        >
          <p className="text-gray-400 text-sm font-light">
            All plans include watermark-free exports •
            Cancel anytime •
            14-day money-back guarantee
          </p>
        </motion.div>
      </div>
    </div>
  );
}

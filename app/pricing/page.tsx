'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  X,
  Zap,
  Crown,
  Rocket,
  Building2,
  Sparkles
} from 'lucide-react';

type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

const pricingTiers = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for beginners exploring AI creativity',
    icon: Zap,
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderColor: '#667eea',
    monthly: 999,
    quarterly: 849,
    yearly: 799,
    credits: 100,
    features: {
      included: [
        'YouTube thumbnail generation',
        'Basic template library',
        '1080p resolution',
        'Standard generation speed',
        'Email support',
        'Watermark-free exports',
      ],
      excluded: [
        'Amazon creatives',
        'Meta ads templates',
        'Batch processing',
        'API access',
      ],
    },
    popular: false,
    cta: 'Get Started',
  },
  {
    id: 'creator',
    name: 'Creator',
    description: 'For active creators leveling up their content',
    icon: Sparkles,
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    borderColor: '#f5576c',
    badge: 'MOST POPULAR',
    badgeColor: '#ff4d6d',
    monthly: 2499,
    quarterly: 2124,
    yearly: 1999,
    credits: 500,
    features: {
      included: [
        'Everything in Starter',
        'Amazon product creatives',
        'Meta ads templates',
        '2K resolution output',
        'Priority generation queue',
        'Batch processing (10 images)',
        'Premium template library',
        'Live chat support',
        'Export presets',
      ],
      excluded: [
        'API access',
        'Team collaboration',
        'Brand kit',
      ],
    },
    popular: true,
    cta: 'Start Creating',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Maximum power for agencies & power users',
    icon: Crown,
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    borderColor: '#00f2fe',
    monthly: 5999,
    quarterly: 5099,
    yearly: 4799,
    credits: 2000,
    features: {
      included: [
        'Everything in Creator',
        'Unlimited template access',
        '4K resolution output',
        'Instant generation (no queue)',
        'Advanced editing suite',
        'API access & webhooks',
        'Brand kit (logos, colors, fonts)',
        'Team collaboration (3 seats)',
        'Priority support',
        'Custom workflows',
        'Analytics dashboard',
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
    description: 'Custom solutions for large organizations',
    icon: Building2,
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    borderColor: '#fee140',
    monthly: null,
    quarterly: null,
    yearly: null,
    credits: 'Unlimited*',
    features: {
      included: [
        'Everything in Pro',
        'Unlimited generations*',
        'Dedicated account manager',
        'Custom AI model training',
        'White-label platform',
        '99.9% SLA guarantee',
        'Unlimited team seats',
        'SSO & advanced security',
        'Custom integrations',
        'On-premise deployment option',
        '24/7 phone support',
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

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"
          animate={{
            x: [0, -100, 0],
            y: [0, -50, 0],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl md:text-7xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Choose Your Creative Power
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
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
          <div className="inline-flex bg-[#1a1a1a] p-1.5 rounded-full border border-white/10">
            {(Object.keys(billingOptions) as BillingCycle[]).map((cycle) => (
              <button
                key={cycle}
                onClick={() => setBillingCycle(cycle)}
                className={`
                  relative px-6 py-2 rounded-full text-sm font-medium transition-all
                  ${billingCycle === cycle
                    ? 'text-white'
                    : 'text-gray-400 hover:text-gray-300'
                  }
                `}
              >
                {billingCycle === cycle && (
                  <motion.div
                    layoutId="billing-bg"
                    className="absolute inset-0 bg-white/10 rounded-full"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10">
                  {billingOptions[cycle].label}
                </span>
                {billingOptions[cycle].discount && (
                  <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
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
                relative rounded-2xl overflow-hidden
                ${tier.popular ? 'md:scale-105' : ''}
              `}
            >
              {/* Popular Badge */}
              {tier.badge && (
                <div
                  className="absolute top-4 right-4 z-20 px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    background: tier.badgeColor,
                    boxShadow: `0 0 20px ${tier.badgeColor}40`
                  }}
                >
                  {tier.badge}
                </div>
              )}

              {/* Animated Border */}
              <motion.div
                className="absolute inset-0 rounded-2xl opacity-0"
                animate={{
                  opacity: hoveredTier === tier.id ? 1 : 0,
                }}
                style={{
                  background: tier.gradient,
                  filter: 'blur(20px)',
                }}
              />

              {/* Card Content */}
              <div
                className="relative bg-[#0a0a0a]/90 backdrop-blur-xl border rounded-2xl p-6 h-full flex flex-col"
                style={{
                  borderColor: hoveredTier === tier.id ? tier.borderColor : 'rgba(255,255,255,0.1)',
                }}
              >
                {/* Icon & Name */}
                <div className="mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: tier.gradient }}
                  >
                    <tier.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-1">{tier.name}</h3>
                  <p className="text-sm text-gray-400">{tier.description}</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  {tier.monthly !== null ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold">
                          ₹{tier[billingCycle]?.toLocaleString('en-IN')}
                        </span>
                        <span className="text-gray-400">/month</span>
                      </div>
                      {billingCycle !== 'monthly' && (
                        <p className="text-xs text-gray-500 mt-1">
                          Billed {billingCycle === 'quarterly' ? 'quarterly' : 'annually'}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="text-3xl font-bold">Custom</div>
                  )}
                </div>

                {/* Credits */}
                <div
                  className="mb-6 p-3 rounded-lg flex items-center gap-2"
                  style={{
                    background: `${tier.gradient}15`,
                    border: `1px solid ${tier.borderColor}30`
                  }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: tier.borderColor }} />
                  <span className="font-semibold">
                    {typeof tier.credits === 'number'
                      ? `${tier.credits.toLocaleString()} credits/month`
                      : tier.credits
                    }
                  </span>
                </div>

                {/* CTA Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 rounded-xl font-semibold mb-6 transition-all"
                  style={{
                    background: tier.popular ? tier.gradient : 'transparent',
                    border: tier.popular ? 'none' : `2px solid ${tier.borderColor}40`,
                    color: tier.popular ? 'white' : tier.borderColor,
                  }}
                >
                  {tier.cta}
                </motion.button>

                {/* Features */}
                <div className="flex-1">
                  <div className="space-y-3">
                    {tier.features.included.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: tier.borderColor }} />
                        <span className="text-gray-300">{feature}</span>
                      </div>
                    ))}
                    {tier.features.excluded.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm opacity-40">
                        <X className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-600" />
                        <span className="text-gray-500">{feature}</span>
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
          <p className="text-gray-400 text-sm">
            All plans include watermark-free exports •
            Cancel anytime •
            14-day money-back guarantee
          </p>
        </motion.div>
      </div>
    </div>
  );
}

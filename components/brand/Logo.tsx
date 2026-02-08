'use client';

import React from 'react';
import { Icon } from '@iconify/react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface LogoProps {
  variant?: 'full' | 'icon' | 'wordmark';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
}

export function Logo({ variant = 'full', size = 'md', href = '/' }: LogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-lg', padding: 'p-1.5' },
    md: { icon: 32, text: 'text-2xl', padding: 'p-2' },
    lg: { icon: 48, text: 'text-4xl', padding: 'p-3' },
  };

  const content = (
    <div className="flex items-center gap-3">
      {(variant === 'full' || variant === 'icon') && (
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative"
        >
          {/* Gradient glow background */}
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 rounded-xl blur-md opacity-50" />
          
          {/* Icon container */}
          <div className={`relative bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 ${sizes[size].padding} rounded-xl`}>
            <Icon 
              icon="ph:lightning-fill"
              width={sizes[size].icon}
              height={sizes[size].icon}
              className="text-white"
            />
          </div>
        </motion.div>
      )}

      {(variant === 'full' || variant === 'wordmark') && (
        <span className={`
          font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 
          bg-clip-text text-transparent ${sizes[size].text}
        `}>
          Visicraft
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block">
        {content}
      </Link>
    );
  }

  return content;
}

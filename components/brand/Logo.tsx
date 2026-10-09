'use client';

import React from 'react';
import Link from 'next/link';

interface LogoProps {
  variant?: 'full' | 'icon' | 'wordmark';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
}

/** The GoGrowth logo: the hexagon mark with the wordmark, the mark alone, or the wordmark alone. */
export function Logo({ variant = 'full', size = 'md', href = '/' }: LogoProps) {
  const height = { sm: 24, md: 32, lg: 48 }[size];

  const content = variant === 'icon' ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/gogrowth-mark.png" alt="GoGrowth" style={{ height, width: height }} className="object-contain" />
  ) : variant === 'wordmark' ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/gogrowth-wordmark.png" alt="GoGrowth" style={{ height: Math.round(height * 0.6) }} className="w-auto object-contain" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/gogrowth-logo.png" alt="GoGrowth" style={{ height }} className="w-auto object-contain" />
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

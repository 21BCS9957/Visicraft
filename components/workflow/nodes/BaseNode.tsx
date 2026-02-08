'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BaseNodeProps {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
  gradient: string;
  status?: 'idle' | 'processing' | 'complete' | 'error';
  selected?: boolean;
}

export function BaseNode({
  children,
  icon: Icon,
  title,
  gradient,
  status = 'idle',
  selected = false,
}: BaseNodeProps) {
  const statusColors = {
    idle: 'border-gray-700',
    processing: 'border-amber-500 shadow-amber-500/50',
    complete: 'border-green-500 shadow-green-500/50',
    error: 'border-red-500 shadow-red-500/50',
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.02 }}
      className={cn(
        'relative rounded-xl border-2 bg-[#1a1a1a] backdrop-blur-sm',
        'min-w-[280px] shadow-2xl transition-all duration-200',
        statusColors[status],
        selected && 'ring-2 ring-violet-500 ring-offset-2 ring-offset-[#0a0a0a]'
      )}
    >
      {/* Gradient header */}
      <div
        className="rounded-t-lg p-4 flex items-center gap-3"
        style={{ background: gradient }}
      >
        <Icon className="w-5 h-5 text-white" />
        <span className="font-semibold text-white text-sm">{title}</span>
        
        {/* Status indicator */}
        {status === 'processing' && (
          <motion.div
            className="ml-auto w-2 h-2 rounded-full bg-white"
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        )}
        {status === 'complete' && (
          <div className="ml-auto w-2 h-2 rounded-full bg-green-400" />
        )}
        {status === 'error' && (
          <div className="ml-auto w-2 h-2 rounded-full bg-red-400" />
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {children}
      </div>

      {/* Glow effect on hover */}
      <div className="absolute inset-0 rounded-xl opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
        <div
          className="absolute inset-0 rounded-xl blur-xl"
          style={{ background: gradient, opacity: 0.2 }}
        />
      </div>
    </motion.div>
  );
}

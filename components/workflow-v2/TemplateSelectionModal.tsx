'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@iconify/react';
import { X } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  gradient: string;
}

const templates: Template[] = [
  {
    id: 'custom',
    name: 'Blank Canvas',
    description: 'Start from scratch and build your own workflow',
    icon: 'ph:lightning-fill',
    category: 'custom',
    gradient: 'from-gray-600 to-gray-800',
  },
  {
    id: 'youtube-thumbnail',
    name: 'YouTube Thumbnail',
    description: 'Optimized workflow for creating viral YouTube thumbnails',
    icon: 'lucide:youtube',
    category: 'youtube',
    gradient: 'from-red-500 to-rose-600',
  },
  {
    id: 'product-showcase',
    name: 'Product Showcase',
    description: 'Professional product images for e-commerce platforms',
    icon: 'lucide:shopping-bag',
    category: 'product',
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'amazon-creative',
    name: 'Amazon Creative',
    description: 'Eye-catching product images for Amazon listings',
    icon: 'lucide:package',
    category: 'ecommerce',
    gradient: 'from-orange-500 to-amber-600',
  },
  {
    id: 'shopify-creative',
    name: 'Shopify Creative',
    description: 'Stunning product visuals for Shopify stores',
    icon: 'lucide:shopping-cart',
    category: 'ecommerce',
    gradient: 'from-green-500 to-emerald-600',
  },
  {
    id: 'meta-ads',
    name: 'Meta Ads',
    description: 'High-converting ad creatives for Facebook & Instagram',
    icon: 'lucide:megaphone',
    category: 'advertising',
    gradient: 'from-blue-600 to-purple-600',
  },
  {
    id: 'viral-thumbnail-factory',
    name: 'Viral Thumbnail Factory',
    description: 'Create attention-grabbing thumbnails that drive clicks',
    icon: 'lucide:zap',
    category: 'youtube',
    gradient: 'from-pink-500 to-rose-600',
  },
  {
    id: 'brand-universe-explorer',
    name: 'Brand Universe Explorer',
    description: 'Explore and create consistent brand visuals',
    icon: 'lucide:sparkles',
    category: 'branding',
    gradient: 'from-violet-500 to-purple-600',
  },
];

interface TemplateSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
}

export default function TemplateSelectionModal({
  isOpen,
  onClose,
  onSelectTemplate,
}: TemplateSelectionModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (templateId: string) => {
    setSelectedId(templateId);
    // Animate selection
    setTimeout(() => {
      onSelectTemplate(templateId);
      onClose();
    }, 300);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-[#2a2a2a] flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">
                  Choose Your Workflow
                </h2>
                <p className="text-gray-400 text-sm">
                  Start with a template or create from scratch
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Templates Grid */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template, index) => (
                  <motion.button
                    key={template.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleSelect(template.id)}
                    className={`
                      relative group text-left p-6 rounded-xl border-2 transition-all
                      ${selectedId === template.id
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-[#2a2a2a] hover:border-[#3a3a3a] bg-[#1a1a1a]'
                      }
                    `}
                  >
                    {/* Icon */}
                    <div className={`
                      w-12 h-12 rounded-xl mb-4 flex items-center justify-center
                      bg-gradient-to-br ${template.gradient}
                    `}>
                      <Icon
                        icon={template.icon}
                        className="w-6 h-6 text-white"
                      />
                    </div>

                    {/* Content */}
                    <h3 className="text-white font-semibold mb-2">
                      {template.name}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      {template.description}
                    </p>

                    {/* Hover Effect */}
                    <div className={`
                      absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity
                      bg-gradient-to-br ${template.gradient} blur-xl -z-10
                    `} />
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

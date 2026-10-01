'use client';

import Link from 'next/link';
import { Clapperboard, FolderHeart, Images } from 'lucide-react';
import { cx } from './ui';

const TABS = [
  { id: 'images', href: '/playground', label: 'Images', icon: Images },
  { id: 'videos', href: '/playground/video', label: 'Videos', icon: Clapperboard },
  { id: 'library', href: '/playground/library', label: 'Library', icon: FolderHeart },
] as const;

/** Images · Videos · Library, on the Playground's own pages. */
export function PlaygroundTabs({ active, preview = false }: { active: (typeof TABS)[number]['id']; preview?: boolean }) {
  return (
    <nav className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1" aria-label="Playground sections">
      {TABS.map(({ id, href, label, icon: Icon }) => (
        <Link
          key={id}
          href={`${href}${preview ? '?previewPlayground=1' : ''}`}
          aria-current={active === id ? 'page' : undefined}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors',
            active === id ? 'bg-white/12 text-white' : 'text-white/55 hover:text-white'
          )}
        >
          <Icon className="h-4 w-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}

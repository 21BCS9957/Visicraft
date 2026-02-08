'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ImageIcon, History, Home, Workflow, IndianRupee } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/workflow', label: 'Workflow', icon: Workflow },
    { href: '/generate', label: 'Generate', icon: ImageIcon },
    { href: '/history', label: 'History', icon: History },
    { href: '/pricing', label: 'Pricing', icon: IndianRupee },
  ];

  return (
    <nav className="border-b border-[#c8b4a0]/20 bg-[#1a1d18]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center space-x-2">
            <ImageIcon className="h-6 w-6 text-[#c8b4a0]" />
            <span className="text-[#f8f7f5] font-light text-lg tracking-wide">
              Thumbnail Generator
            </span>
          </Link>

          <div className="flex items-center space-x-1">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors
                    ${isActive 
                      ? 'bg-[#c8b4a0]/10 text-[#c8b4a0]' 
                      : 'text-[#f8f7f5]/60 hover:text-[#f8f7f5] hover:bg-[#c8b4a0]/5'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-light">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

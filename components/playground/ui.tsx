'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Popover as PopoverPrimitive, Switch as SwitchPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';

/** Small building blocks of the Playground, in the app's dark glass style. */

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'plain' | 'solid' | 'danger' }>(
  function IconButton({ label, tone = 'plain', className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cx(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-40',
          tone === 'solid' && 'bg-black/55 text-white backdrop-blur-md hover:bg-black/75',
          tone === 'plain' && 'text-white/60 hover:bg-white/10 hover:text-white',
          tone === 'danger' && 'text-white/60 hover:bg-red-500/15 hover:text-red-300',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

export function Chip({ active, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'border-[#fff05a]/50 bg-[#fff05a]/12 text-[#fff05a]'
          : 'border-white/10 bg-white/[0.04] text-white/75 hover:border-white/20 hover:bg-white/[0.08] hover:text-white',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Popover({ trigger, children, align = 'start', side = 'top', className }: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          side={side}
          sideOffset={10}
          collisionPadding={12}
          className={cx(
            'z-[90] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#141418]/95 p-2 text-sm text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            className
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export const PopoverClose = PopoverPrimitive.Close;

export function Toggle({ checked, onCheckedChange, label, disabled }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="relative h-[18px] w-8 shrink-0 rounded-full border border-white/15 bg-white/10 transition-colors data-[state=checked]:border-[#fff05a]/60 data-[state=checked]:bg-[#fff05a]/80 disabled:opacity-40"
    >
      <SwitchPrimitive.Thumb className="block h-3 w-3 translate-x-[2px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-black" />
    </SwitchPrimitive.Root>
  );
}

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-[95] max-w-xs rounded-lg border border-white/10 bg-[#141418] px-2.5 py-1.5 text-xs text-white/85 shadow-xl"
          >
            {text}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/** "3 min ago", "2 h ago", "4 days ago". */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  const days = Math.round(seconds / 86_400);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** "9:16" → "9 / 16" for CSS aspect-ratio. */
export function cssRatio(ratio: string): string {
  const [w, h] = ratio.split(':').map(Number);
  return w && h ? `${w} / ${h}` : '1 / 1';
}

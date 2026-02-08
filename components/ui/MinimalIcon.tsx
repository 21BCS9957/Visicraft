import { Icon } from '@iconify/react';

interface MinimalIconProps {
  name: string;
  size?: number;
  className?: string;
  gradient?: boolean;
}

export function MinimalIcon({
  name,
  size = 24,
  className = '',
  gradient = false
}: MinimalIconProps) {
  if (gradient) {
    return (
      <div className="relative inline-block">
        <Icon 
          icon={name}
          width={size}
          height={size}
          className={`text-transparent bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 bg-clip-text ${className}`}
        />
      </div>
    );
  }

  return (
    <Icon 
      icon={name}
      width={size}
      height={size}
      className={className}
    />
  );
}

import type { HTMLAttributes, ReactNode } from 'react';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  solid?: boolean;
  padded?: boolean;
  children: ReactNode;
}

export function Panel({ solid = false, padded = true, className = '', children, ...rest }: PanelProps) {
  return (
    <div className={`${solid ? 'glass-solid' : 'glass'} ${padded ? 'p-5' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`font-display text-label uppercase text-muted ${className}`}>{children}</div>;
}

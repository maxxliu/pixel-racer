'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 font-display font-bold uppercase tracking-wider rounded-lg transition-transform duration-150 select-none active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none';
const variants: Record<Variant, string> = {
  primary: 'bg-coral text-ink hover:bg-[#ff7466] shadow-[0_6px_0_#b8352a] active:shadow-[0_2px_0_#b8352a] active:translate-y-[3px]',
  secondary: 'bg-cream/10 text-cream border border-cream/25 hover:bg-cream/18 hover:border-cream/45',
  ghost: 'text-cream/80 hover:text-cream hover:bg-cream/8',
  danger: 'bg-transparent text-coral border border-coral/50 hover:bg-coral/10',
};
const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-2',
  md: 'text-sm px-5 py-3',
  lg: 'text-base px-7 py-4',
};

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra = ''): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', className = '', children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

interface LinkButtonProps {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
}

export function LinkButton({ href, variant = 'secondary', size = 'md', className = '', children, prefetch }: LinkButtonProps) {
  return (
    <Link href={href} prefetch={prefetch} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

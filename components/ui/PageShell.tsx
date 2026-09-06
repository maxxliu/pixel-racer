import Link from 'next/link';
import type { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`font-display text-lg font-bold italic tracking-tight ${className}`} aria-label="Pixel Racer home">
      <span className="text-coral">PIXEL</span>
      <span className="text-cream">RACER</span>
    </Link>
  );
}

export function PageShell({ title, subtitle, back, actions, children, wide = false }: PageShellProps) {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-8">
      <div className={`mx-auto ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <Wordmark />
            {back && (
              <Link href={back.href} className="text-sm text-muted hover:text-cream">
                ← {back.label}
              </Link>
            )}
          </div>
          <nav className="flex items-center gap-2 text-sm">{actions}</nav>
        </header>
        <div className="mb-8">
          <h1 className="text-display-l italic">{title}</h1>
          {subtitle && <p className="mt-2 max-w-xl text-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}

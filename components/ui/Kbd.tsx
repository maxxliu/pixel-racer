import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6em] items-center justify-center rounded-md border border-cream/30 bg-cream/10 px-1.5 py-0.5 font-display text-[0.7em] font-bold uppercase text-cream shadow-[0_2px_0_rgba(0,0,0,0.4)]">
      {children}
    </kbd>
  );
}

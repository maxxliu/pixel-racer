'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  children: ReactNode;
  width?: string;
  /** Solid backdrop hides the scene (pause), translucent keeps it visible. */
  dim?: 'light' | 'heavy';
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, width = 'max-w-md', dim = 'heavy' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const first = el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstEl = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 anim-fade-in ${dim === 'heavy' ? 'bg-ink/85' : 'bg-ink/50'} backdrop-blur-sm`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`glass-solid w-full ${width} p-6 anim-slide-up`}>
        <h2 className="mb-5 text-display-m italic">{title}</h2>
        {children}
      </div>
    </div>
  );
}

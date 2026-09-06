'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface SaveTrackDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, author: string) => Promise<void>;
  saving: boolean;
  error: string | null;
}

export default function SaveTrackDialog({ open, onClose, onSave, saving, error }: SaveTrackDialogProps) {
  const [name, setName] = useState('');
  const [author, setAuthor] = useState(() => {
    try { return localStorage.getItem('pixel-racer-name') ?? ''; } catch { return ''; }
  });
  const valid = name.trim().length > 0 && author.trim().length > 0;
  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title="Save track">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid && !saving) void onSave(name.trim(), author.trim()); }}>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Track name</span>
          <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Sunset Sprint" disabled={saving} />
          <span className="mt-1 block text-right text-[11px] text-muted hud-num">{name.length}/60</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-muted">Your name</span>
          <input className="input" value={author} maxLength={30} onChange={(e) => setAuthor(e.target.value)} placeholder="Driver" disabled={saving} />
        </label>
        {error && <p className="text-sm text-coral">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

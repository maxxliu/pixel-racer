'use client';

import { useState } from 'react';

interface SaveTrackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, authorName: string) => Promise<void>;
  isSaving?: boolean;
  error?: string | null;
}

export default function SaveTrackDialog({
  isOpen,
  onClose,
  onSave,
  isSaving = false,
  error = null
}: SaveTrackDialogProps) {
  const [trackName, setTrackName] = useState('');
  const [authorName, setAuthorName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackName.trim() || !authorName.trim()) return;
    await onSave(trackName.trim(), authorName.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="pixel-panel max-w-md w-full">
        <h2 className="text-xl font-pixel text-white mb-4">Save Track</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-pixel-body text-pixel-gray mb-1">
              Track Name
            </label>
            <input
              type="text"
              value={trackName}
              onChange={(e) => setTrackName(e.target.value)}
              maxLength={50}
              className="w-full bg-pixel-black border-2 border-pixel-gray text-white px-3 py-2 font-pixel-body focus:border-pixel-red outline-none"
              placeholder="My Awesome Track"
              disabled={isSaving}
            />
            <p className="text-xs text-pixel-gray mt-1">{trackName.length}/50</p>
          </div>

          <div>
            <label className="block text-sm font-pixel-body text-pixel-gray mb-1">
              Author Name
            </label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              maxLength={30}
              className="w-full bg-pixel-black border-2 border-pixel-gray text-white px-3 py-2 font-pixel-body focus:border-pixel-red outline-none"
              placeholder="Your Name"
              disabled={isSaving}
            />
            <p className="text-xs text-pixel-gray mt-1">{authorName.length}/30</p>
          </div>

          {error && (
            <p className="text-red-400 text-sm font-pixel-body">{error}</p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="pixel-btn"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="pixel-btn pixel-btn-primary"
              disabled={isSaving || !trackName.trim() || !authorName.trim()}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

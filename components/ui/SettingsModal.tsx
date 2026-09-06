'use client';

import { Modal } from './Modal';
import { Button } from './Button';
import { Label } from './Panel';
import { useSettings, type GameSettings } from '@/lib/settings';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Some settings only apply to the next race; show a hint when in-game. */
  inGame?: boolean;
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-ink/60 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-md px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider transition-colors ${
            value === o.value ? 'bg-coral text-ink' : 'text-muted hover:text-cream'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-20 text-sm text-muted">{label}</span>
      <input
        type="range" min={0} max={1} step={0.05} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-coral"
        aria-label={label}
      />
      <span className="w-10 text-right font-display text-xs text-cream hud-num">{Math.round(value * 100)}</span>
    </label>
  );
}

export function SettingsModal({ open, onClose, inGame = false }: SettingsModalProps) {
  const [s, update] = useSettings();
  const set = (patch: Partial<GameSettings>) => update(patch);
  return (
    <Modal open={open} onClose={onClose} title="Settings" width="max-w-lg">
      <div className="space-y-5">
        <div>
          <Label className="mb-2">Race</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-sm text-muted">Laps</div>
              <Segmented value={s.laps} options={[1, 2, 3, 5].map((v) => ({ value: v, label: String(v) }))} onChange={(v) => set({ laps: v })} />
            </div>
            <div>
              <div className="mb-1 text-sm text-muted">Opponents</div>
              <Segmented value={s.aiCount} options={[1, 2, 3, 5].map((v) => ({ value: v, label: String(v) }))} onChange={(v) => set({ aiCount: v })} />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 text-sm text-muted">AI difficulty</div>
              <Segmented value={s.difficulty} options={[{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }]} onChange={(v) => set({ difficulty: v })} />
            </div>
          </div>
          {inGame && <p className="mt-2 text-xs text-muted">Race settings apply to the next race.</p>}
        </div>

        <div>
          <Label className="mb-2">Display</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-sm text-muted">Quality</div>
              <Segmented value={s.quality} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Med' }, { value: 'high', label: 'High' }]} onChange={(v) => set({ quality: v })} />
            </div>
            <div>
              <div className="mb-1 text-sm text-muted">Camera</div>
              <Segmented value={s.cameraMode} options={[{ value: 'chase', label: 'Chase' }, { value: 'far', label: 'Far' }, { value: 'hood', label: 'Hood' }]} onChange={(v) => set({ cameraMode: v })} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-coral" checked={s.speedLines} onChange={(e) => set({ speedLines: e.target.checked })} /> Speed lines</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-coral" checked={s.haptics} onChange={(e) => set({ haptics: e.target.checked })} /> Vibration</label>
          </div>
        </div>

        <div>
          <Label className="mb-2">Audio</Label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-coral" checked={!s.audio.muted} onChange={(e) => set({ audio: { ...s.audio, muted: !e.target.checked } })} /> Sound on</label>
            <Slider label="Master" value={s.audio.master} onChange={(v) => set({ audio: { ...s.audio, master: v } })} />
            <Slider label="Engine" value={s.audio.engine} onChange={(v) => set({ audio: { ...s.audio, engine: v } })} />
            <Slider label="Effects" value={s.audio.sfx} onChange={(v) => set({ audio: { ...s.audio, sfx: v } })} />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

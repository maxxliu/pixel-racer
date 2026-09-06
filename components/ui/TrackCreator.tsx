'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DrawingCanvas from './DrawingCanvas';
import SaveTrackDialog from '@/components/tracks/SaveTrackDialog';
import { PageShell } from '@/components/ui/PageShell';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Panel';
import type { Point2D } from '@/lib/track/TrackGeometryUtils';
import type { TrackWaypoint } from '@/lib/game/types';
import { processDrawingToWaypoints } from '@/lib/track/PathProcessor';
import { validateTrack, type ValidationResult } from '@/lib/track/TrackValidator';
import { generateTrack, generateOvalTrack } from '@/lib/track/ProceduralTrackGenerator';
import { TrackSpline, validateWaypoints } from '@/lib/game/TrackSpline';
import { formatTrackLength } from '@/lib/utils/format';
import { getDifficultyColor } from '@/lib/game/TrackSerializer';

type Mode = 'draw' | 'generate';
type GenDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

function startFor(waypoints: TrackWaypoint[]) {
  try {
    const s = new TrackSpline(waypoints).start;
    return { x: s.x, z: s.z, rotation: s.rotation };
  } catch {
    return { x: waypoints[0].x, z: waypoints[0].z, rotation: 0 };
  }
}

export default function TrackCreator() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('draw');
  const [strokes, setStrokes] = useState<Point2D[][]>([]);
  const [waypoints, setWaypoints] = useState<TrackWaypoint[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [genDifficulty, setGenDifficulty] = useState<GenDifficulty>('medium');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const rawPoints = useMemo(() => strokes.flat(), [strokes]);

  const applyWaypoints = useCallback((wps: TrackWaypoint[]) => {
    const v = validateTrack(wps.map((w) => ({ x: w.x, z: w.z })), wps.map((w) => w.width));
    const splineErr = validateWaypoints(wps);
    if (splineErr && v.isValid) {
      v.isValid = false;
      v.errors.push({ type: 'invalid_geometry', message: splineErr });
    }
    setWaypoints(wps);
    setValidation(v);
  }, []);

  const handleStrokes = useCallback((s: Point2D[][]) => {
    setStrokes(s);
    setWaypoints([]);
    setValidation(null);
  }, []);

  const undo = () => handleStrokes(strokes.slice(0, -1));
  const clear = () => handleStrokes([]);

  const process = useCallback(async () => {
    if (rawPoints.length < 10) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      applyWaypoints(processDrawingToWaypoints(rawPoints));
    } catch {
      setValidation({ isValid: false, errors: [{ type: 'invalid_geometry', message: 'Could not build a track from that drawing.' }], warnings: [], stats: { length: 0, pointCount: rawPoints.length, turnCount: 0, avgWidth: 0, minWidth: 0, difficulty: 'easy', bounds: { width: 0, height: 0 }, isClosed: false } });
    } finally {
      setBusy(false);
    }
  }, [rawPoints, applyWaypoints]);

  const generate = useCallback(async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const generated = generateTrack({ difficulty: genDifficulty, worldSize: 200, maxAttempts: 15 });
      applyWaypoints(generated && generated.length > 0 ? generated : generateOvalTrack(200));
    } finally {
      setBusy(false);
    }
  }, [genDifficulty, applyWaypoints]);

  const play = (raceMode: 'time-trial' | 'race') => {
    if (!validation?.isValid || waypoints.length === 0) return;
    sessionStorage.setItem('customTrack', JSON.stringify({ waypoints, startPosition: startFor(waypoints), name: 'Custom track' }));
    router.push(`/play?mode=${raceMode}&custom=true`);
  };

  const save = async (name: string, author: string) => {
    if (!validation?.isValid || waypoints.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      try { localStorage.setItem('pixel-racer-name', author); } catch { /* ignore */ }
      const res = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, author_name: author, waypoints, start_position: startFor(waypoints) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) throw new Error('Publishing needs a database connection. You can still play the track locally.');
      if (!res.ok) throw new Error(data.error || `Could not publish (${res.status})`);
      router.push(`/tracks/${data.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not publish');
    } finally {
      setSaving(false);
    }
  };

  const bounds = useMemo(() => {
    if (waypoints.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const w of waypoints) { minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x); minZ = Math.min(minZ, w.z); maxZ = Math.max(maxZ, w.z); }
    const pad = 20;
    return `${minX - pad} ${minZ - pad} ${maxX - minX + pad * 2} ${maxZ - minZ + pad * 2}`;
  }, [waypoints]);

  return (
    <PageShell title="Create a track" subtitle="Draw a closed loop or generate one, then race it. Publish it to the library to get a leaderboard." back={{ href: '/', label: 'Menu' }}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex gap-1 rounded-lg bg-ink/60 p-1 w-fit" role="tablist">
            {(['draw', 'generate'] as Mode[]).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)}
                className={`rounded-md px-4 py-2 font-display text-xs font-bold uppercase tracking-wider ${mode === m ? 'bg-coral text-ink' : 'text-muted hover:text-cream'}`}>
                {m}
              </button>
            ))}
          </div>

          {mode === 'draw' ? (
            <>
              <DrawingCanvas strokes={strokes} onStrokesChange={handleStrokes} disabled={busy} />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={undo} disabled={busy || strokes.length === 0}>Undo stroke</Button>
                <Button onClick={clear} disabled={busy || strokes.length === 0}>Clear</Button>
                <Button variant="primary" onClick={() => void process()} disabled={busy || rawPoints.length < 10}>{busy ? 'Building…' : 'Build track'}</Button>
              </div>
            </>
          ) : (
            <div className="glass p-5">
              <Label className="mb-2">Difficulty</Label>
              <div className="mb-4 flex gap-1 rounded-lg bg-ink/60 p-1 w-fit">
                {(['easy', 'medium', 'hard', 'expert'] as GenDifficulty[]).map((d) => (
                  <button key={d} type="button" onClick={() => setGenDifficulty(d)} aria-pressed={genDifficulty === d}
                    className={`rounded-md px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider ${genDifficulty === d ? 'bg-coral text-ink' : 'text-muted hover:text-cream'}`}>
                    {d}
                  </button>
                ))}
              </div>
              <Button variant="primary" onClick={() => void generate()} disabled={busy}>{busy ? 'Generating…' : 'Generate track'}</Button>
              {waypoints.length > 0 && bounds && (
                <svg viewBox={bounds} className="mx-auto mt-5 aspect-square w-full max-w-sm rounded-lg bg-ink/50">
                  <path d={`M ${waypoints[0].x} ${waypoints[0].z} ${waypoints.slice(1).map((w) => `L ${w.x} ${w.z}`).join(' ')} Z`} fill="none" stroke="#3a3548" strokeWidth={12} strokeLinejoin="round" />
                  <path d={`M ${waypoints[0].x} ${waypoints[0].z} ${waypoints.slice(1).map((w) => `L ${w.x} ${w.z}`).join(' ')} Z`} fill="none" stroke="#fff7ef" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.6} />
                  <circle cx={waypoints[0].x} cy={waypoints[0].z} r={5} fill="#c8ff3d" />
                </svg>
              )}
            </div>
          )}

          {validation?.isValid && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" size="lg" onClick={() => play('time-trial')}>Time trial</Button>
              <Button size="lg" onClick={() => play('race')}>Race vs AI</Button>
              <Button size="lg" onClick={() => { setSaveError(null); setSaveOpen(true); }}>Publish</Button>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="glass p-5">
            <Label className="mb-3">Track info</Label>
            {!validation && rawPoints.length === 0 && <p className="text-sm text-muted">{mode === 'draw' ? 'Draw a loop to see stats.' : 'Generate a track to see stats.'}</p>}
            {!validation && rawPoints.length > 0 && <p className="text-sm text-muted">Press <b className="text-cream">Build track</b> to smooth and validate your drawing.</p>}
            {validation && (
              <div className="space-y-3">
                <div className={`inline-block rounded-md px-2 py-1 font-display text-xs font-bold uppercase tracking-wider ${validation.isValid ? 'bg-lime text-ink' : 'bg-coral text-ink'}`}>
                  {validation.isValid ? 'Ready to race' : 'Needs work'}
                </div>
                {validation.errors.length > 0 && (
                  <ul className="space-y-1 text-sm text-coral">{validation.errors.map((e, i) => <li key={i}>• {e.message}</li>)}</ul>
                )}
                {validation.warnings.length > 0 && (
                  <ul className="space-y-1 text-sm text-sun">{validation.warnings.map((w, i) => <li key={i}>• {w.message}</li>)}</ul>
                )}
                {validation.isValid && (
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-muted">Length</dt><dd className="font-display text-lg font-bold hud-num">{formatTrackLength(validation.stats.length)}</dd></div>
                    <div><dt className="text-muted">Turns</dt><dd className="font-display text-lg font-bold hud-num">{validation.stats.turnCount}</dd></div>
                    <div><dt className="text-muted">Difficulty</dt><dd className="font-display text-lg font-bold uppercase" style={{ color: getDifficultyColor(validation.stats.difficulty) }}>{validation.stats.difficulty}</dd></div>
                    <div><dt className="text-muted">Avg width</dt><dd className="font-display text-lg font-bold hud-num">{Math.round(validation.stats.avgWidth)} m</dd></div>
                  </dl>
                )}
              </div>
            )}
          </div>
          <div className="glass p-5 text-sm text-muted">
            <Label className="mb-2">Tips</Label>
            <ul className="space-y-1">
              <li>• Finish near where you started; small gaps close automatically.</li>
              <li>• Don&apos;t cross your own line.</li>
              <li>• Mix long straights with a hairpin or two.</li>
              <li>• Keep it at least 200 m long.</li>
            </ul>
          </div>
        </aside>
      </div>

      <SaveTrackDialog open={saveOpen} onClose={() => setSaveOpen(false)} onSave={save} saving={saving} error={saveError} />
    </PageShell>
  );
}

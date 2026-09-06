'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button, LinkButton } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { SettingsModal } from '@/components/ui/SettingsModal';
import { formatTime } from '@/lib/utils/format';
import { getScores, type ScoreEntry } from '@/lib/scores';

const RacingBackground = dynamic(() => import('@/components/home/RacingBackground'), { ssr: false });

interface GlobalEntry {
  id: string;
  playerName: string;
  timeMs: number;
  gameMode: string;
  trackName: string;
}

const MODES = [
  { href: '/play?mode=time-trial', title: 'Time Trial', blurb: 'Just you, the sunset, and the clock. Chase gold.', accent: 'from-sun to-coral', hint: 'Solo' },
  { href: '/play?mode=race', title: 'Race vs AI', blurb: 'Three laps against a pack that bumps back.', accent: 'from-coral to-pink', hint: 'Grid start' },
  { href: '/create-track', title: 'Create Track', blurb: 'Draw a loop or generate one. Race it in seconds.', accent: 'from-lime to-sky', hint: 'Editor' },
  { href: '/tracks', title: 'Track Library', blurb: 'Community circuits with their own leaderboards.', accent: 'from-sky to-[#b38cff]', hint: 'Browse' },
];

export default function Home() {
  const [online, setOnline] = useState<GlobalEntry[] | null>(null);
  const [local, setLocal] = useState<(ScoreEntry & { rank: number })[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setLocal(getScores('time-trial').slice(0, 5));
    const ctrl = new AbortController();
    fetch('/api/leaderboard/global?limit=8', { signal: ctrl.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as GlobalEntry[]) : []))
      .then(setOnline)
      .catch(() => setOnline([]));
    return () => ctrl.abort();
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <RacingBackground />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/30 via-transparent to-ink/80" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="font-display text-sm font-bold uppercase tracking-[0.3em] text-cream/80">Sunset circuit</div>
          <div className="flex items-center gap-2">
            <Link href="/leaderboard" className="font-display text-xs font-bold uppercase tracking-wider text-cream/80 hover:text-cream">High scores</Link>
            <Button size="sm" onClick={() => setSettingsOpen(true)}>Settings</Button>
          </div>
        </header>

        <section className="mt-[12vh] sm:mt-[16vh]">
          <h1 className="text-display-xl italic drop-shadow-[0_8px_0_rgba(15,10,30,0.55)]">
            <span className="text-coral">PIXEL</span>
            <span className="text-cream">RACER</span>
          </h1>
          <p className="mt-3 max-w-md text-base text-cream/85 sm:text-lg">
            Drift, boost and chase the best lap through a low-poly sunset. Built for the browser.
          </p>
          <div className="mt-3 hidden items-center gap-3 text-xs text-cream/70 sm:flex">
            <span><Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd> drive</span>
            <span><Kbd>Space</Kbd> drift</span>
            <span><Kbd>Esc</Kbd> pause</span>
          </div>
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((m, i) => (
            <Link key={m.href} href={m.href} className="group glass relative overflow-hidden p-5 transition-transform hover:-translate-y-1 anim-slide-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${m.accent}`} />
              <div className="text-label uppercase text-muted">{m.hint}</div>
              <div className="mt-1 text-display-m italic text-cream">{m.title}</div>
              <p className="mt-2 text-sm text-cream/75">{m.blurb}</p>
              <div className="mt-4 font-display text-xs font-bold uppercase tracking-wider text-lime opacity-0 transition-opacity group-hover:opacity-100">Go →</div>
            </Link>
          ))}
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="glass p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-display-m italic">Your best</h2>
              <Link href="/leaderboard" className="text-xs uppercase tracking-wider text-muted hover:text-cream">All scores</Link>
            </div>
            {local.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No local times yet. Run a time trial to set one.</p>
            ) : (
              <ol className="mt-3 space-y-1 text-sm">
                {local.map((s) => (
                  <li key={`${s.playerName}-${s.time}-${s.date}`} className="flex justify-between">
                    <span><span className="mr-2 text-muted hud-num">{s.rank}.</span>{s.playerName}</span>
                    <span className="hud-num text-sun">{formatTime(s.time)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="glass p-5">
            <h2 className="text-display-m italic">World records</h2>
            {online === null ? (
              <p className="mt-3 text-sm text-muted">Loading…</p>
            ) : online.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No online records yet. Post a time on a library track.</p>
            ) : (
              <ol className="mt-3 space-y-1 text-sm">
                {online.map((e, i) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="truncate"><span className="mr-2 text-muted hud-num">{i + 1}.</span>{e.playerName} <span className="text-muted">· {e.trackName}</span></span>
                    <span className="shrink-0 hud-num text-sun">{formatTime(e.timeMs)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-8 text-xs text-cream/60">
          <span>© {new Date().getFullYear()} Pixel Racer</span>
          <LinkButton href="/play?mode=time-trial" variant="primary" size="sm">Quick race</LinkButton>
        </footer>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

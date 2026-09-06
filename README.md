# Pixel Racer

A sunset arcade racer for the browser. Drift, boost, and chase the best lap on the built-in circuit or on tracks you draw yourself.

## Play

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Throttle / reverse | `W` `S` or arrows | RT / LT | GAS / BRAKE |
| Steer | `A` `D` or arrows | Left stick | Drag on the left half |
| Drift (hold, release for boost) | `Space` | RB / LB | DRIFT |
| Hard brake | `Shift` | X | — |
| Camera | `C` | Y | — |
| Respawn at last checkpoint | `R` | B | ↻ |
| Pause | `Esc` | Start | ⏸ |
| Mute | `M` | — | — |

Longer drifts charge bigger boosts (blue → orange → purple sparks). Press the throttle right as the lights go green for a perfect start. Every checkpoint must be passed in order for a lap to count.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

`?laps=N` on `/play` overrides the lap count in development builds only. In development, `window.__pixelRacer` exposes the running game and `setAutopilot(true)` lets the AI drive the player car for testing.

### Layout

- `lib/game/` — simulation core: `TrackSpline` (sampled centreline, walls, gates), `ArcadeCar` (physics), `RaceDirector` (countdown, laps, positions), `ai/AIDriver`, and the three.js layer (`Engine`, `Environment`, `TrackMeshBuilder`, `CarMesh`, `Effects`, `CameraRig`).
- `lib/audio/` — fully synthesized Web Audio engine (no assets).
- `lib/track/` — drawing pipeline: path processing, curvature analysis, validation, procedural generation, server-side thumbnails.
- `components/` — React UI. The HUD reads hot values from `GameStore` at render rate without re-rendering React.
- `app/api/` — track library and leaderboard routes (Supabase). All inputs are validated in `lib/api/validate.ts`.

### Online features (optional)

The track library and online leaderboards need a Supabase project. Copy `.env.example` to `.env.local`, fill in the two public keys, and apply the migrations in `supabase/migrations/` (or run `node scripts/run-migration.js` with `POSTGRES_URL` set). Without them the game still runs; library pages explain that publishing is unavailable.

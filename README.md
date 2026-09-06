# Pixel Racer

A sunset arcade racer for the browser. Drift, boost, and chase the best lap on the built-in Sunset Circuit or on tracks you draw yourself. Everything runs client-side: tracks and best times are saved in your browser, and there is no backend.

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

Longer drifts charge bigger boosts (blue → orange → purple sparks). Press the throttle right as the lights go green for a perfect start. Every checkpoint must be passed in order for a lap to count. Laps, opponents, difficulty, quality, camera and audio live in Settings.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

In development, `?laps=N` on `/play` overrides the lap count, and `window.__pixelRacer` exposes the running game (`setAutopilot(true)` lets the AI drive the player car).

## Layout

- `lib/game/` — simulation: `TrackSpline` (sampled centreline, walls, checkpoint gates), `ArcadeCar` (physics), `RaceDirector` (countdown, laps, positions), `ai/AIDriver`, and the three.js layer (`Engine`, `Environment`, `TrackMeshBuilder`, `CarMesh`, `Effects`, `CameraRig`).
- `lib/audio/` — synthesized Web Audio engine, no assets.
- `lib/track/` — drawing pipeline: path processing, curvature analysis, validation, procedural generation, thumbnails.
- `lib/tracks.ts`, `lib/scores.ts`, `lib/settings.ts` — browser storage for tracks, results and settings.
- `components/` — React UI. The HUD reads hot values from `GameStore` at render rate without re-rendering React.
- `__tests__/` — behavioural Jest tests for the simulation, track geometry, race logic, input and storage.

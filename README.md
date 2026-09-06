# Pixel Racer

A sunset arcade racer for the browser. Drift, boost, and chase the best lap on the built-in Sunset Circuit or on tracks you draw yourself, or outrun a rival down an endless road for the highest score. Everything runs client-side: tracks and best times are saved in your browser, and there is no backend.

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

### Endless Chase

An endless, procedurally streamed road with a rival on your tail. Cones, blocks, oil and boost pads arrive in patterns that always leave a lane; the road tightens and the patterns thicken the further you go. Score is metres travelled times a multiplier that grows every three clean patterns and every close call (passing an obstacle within a metre at speed), and resets the moment you touch anything, walls included. Every touch also costs speed and makes the rival surge. Drive clean and it falls back; slip twice and it is on your door. When it draws level you are caught, and `Space` starts the next run. The rival gauge (bottom left) shows the gap in metres.

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

- `lib/game/` — simulation: `Road` (what a car needs from any road), `TrackSpline` (closed loop: sampled centreline, walls, checkpoint gates), `ArcadeCar` (physics), `RaceDirector` (countdown, laps, positions), `ai/AIDriver`, and the three.js layer (`Engine`, `Environment`, `SkyKit`, `TrackMeshBuilder`, `CarMesh`, `Effects`, `CameraRig`).
- `lib/game/endless/` — the endless mode: `SegmentGenerator` and `StreamTrack` (a forward-only road generated in chunks and kept as a sliding window), `ObstacleField` (patterns, fairness rules, collisions, near misses), `Pursuer` (the rival's gap model), `EndlessDirector` (score, combo, milestones, capture), `EndlessGame` (orchestration) and the streaming renderers (`StreamRoadMesh`, `StreamEnvironment`, `ObstacleMeshes`). All knobs live in `tuning.ts`.
- `lib/audio/` — synthesized Web Audio engine, no assets.
- `lib/track/` — drawing pipeline: path processing, curvature analysis, validation, procedural generation, thumbnails.
- `lib/tracks.ts`, `lib/scores.ts`, `lib/settings.ts` — browser storage for tracks, results and settings.
- `components/` — React UI. The HUD reads hot values from `GameStore` at render rate without re-rendering React.
- `__tests__/` — behavioural Jest tests for the simulation, track geometry, race logic, input and storage.

# Retro Racing Background - Implementation Plan

## Research Summary

Based on research from:
- [Jake Gordon's JavaScript Racer Tutorial](https://jakesgordon.com/writing/javascript-racer-v1-straight/)
- [Lou's Pseudo 3D Page](http://www.extentofthejam.com/pseudo/)
- [Animated Retrowave CSS Techniques](https://gist.github.com/gg8765407/9716276c13df88ca667684fe50b21be5)

## Key Principles for Good Pseudo-3D Roads

### 1. Proper Perspective Projection
- Use the formula: `scale = d / z` where d is projection distance, z is depth
- Objects closer to camera are larger, farther objects are smaller
- Road width narrows toward the horizon

### 2. Alternating Stripe Colors (Rumble Strips)
- Segments should alternate between light/dark colors
- Creates visual rhythm and sense of speed
- Prevents strobing artifacts

### 3. Depth Cues
- Road edge lines converging at vanishing point
- Roadside objects (barriers, poles) scaling smaller as they recede
- Objects should spawn at horizon and grow as they approach

### 4. Color Palette (Synthwave/Retro)
- Sky: Deep purple (#1a1a2e) to pink (#3d1a4d) gradient
- Horizon glow: Warm orange/pink
- Road: Dark asphalt with colored edge lines
- Neon accents: Cyan, magenta, yellow

### 5. Animation Techniques
- Road lines moving toward viewer (translateY animation)
- Use `perspective` and `rotateX(60-70deg)` for 3D grid effect
- Barriers/poles spawning at horizon and zooming past

## Implementation Approach

### Option A: Canvas-Based (Best quality, more code)
- Use HTML5 Canvas for proper per-pixel control
- Render road segments with proper projection math
- Animate roadside objects with scaling

### Option B: CSS-Only (Simpler, good enough)
- Use CSS transforms with perspective
- Repeating gradient for road stripes
- Animated translateY for motion
- Pseudo-elements for roadside objects

**Decision: Use CSS approach with Canvas fallback consideration**

## Component Structure

```
RacingBackground
├── Sky Layer (gradient + stars)
├── Sun/Horizon Glow
├── Road Surface (CSS 3D transformed grid)
├── Road Markings (animated stripes)
├── Roadside Elements (barriers that zoom past)
└── Car (SVG, positioned at bottom)
```

## CSS Techniques to Use

1. **Road Grid**:
   ```css
   background: repeating-linear-gradient(
     to bottom,
     #333 0px, #333 2px,
     #444 2px, #444 40px
   );
   transform: perspective(500px) rotateX(60deg);
   animation: scroll 1s linear infinite;
   ```

2. **Roadside Barriers**:
   - Use multiple pseudo-elements or generated divs
   - Each barrier starts small at top, scales up as it moves down
   - Use keyframe animation with scale + translateY

3. **Depth-based scaling**:
   - Elements at horizon: scale(0.1)
   - Elements at bottom: scale(1)
   - Animate scale from 0.1 to 1 as translateY increases

## Color Scheme

```css
--sky-top: #0a0a12;
--sky-mid: #1a1a2e;
--sky-horizon: #2d1f3d;
--sun-glow: rgba(255, 100, 50, 0.3);
--road-dark: #1a1a1a;
--road-light: #2a2a2a;
--road-stripe: #fbbf24;
--road-edge: #dc2626;
--barrier-color: #dc2626;
--barrier-stripe: #ffffff;
```

## Animation Timing

- Road scroll: 0.8s per cycle (fast)
- Barrier pass: 2s from horizon to bottom
- Car bob: 0.1s subtle bounce
- Stars twinkle: 2-4s random

## Barriers/Obstacles Design

Generate 6-8 barriers on each side that:
1. Start at horizon (top of road area) with scale ~0.1
2. Move down (toward viewer) while scaling up
3. When reaching bottom, reset to top
4. Stagger timing so barriers are evenly distributed

## Implementation Steps

1. Create sky gradient with proper colors
2. Add subtle star field (CSS or SVG dots)
3. Create road surface with perspective transform
4. Add animated road stripes (repeating gradient + translateY)
5. Add road edge lines (red/white)
6. Create barrier elements with zoom animation
7. Position car SVG at bottom center
8. Add subtle glow/vignette effects
9. Test and tune animation speeds

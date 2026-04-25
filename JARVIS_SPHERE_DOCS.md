# JarvisSphere Component Documentation

## Overview

`JarvisSphere` is a premium, futuristic AI core animation component designed for the JARVIS application. It creates a holographic neural core with animated orbital rings, data particles, glowing lines, and state-driven visual effects.

## Features

- **Premium Glassmorphism Design** - Translucent, layered glow effects
- **State Management** - Responds to `idle`, `thinking`, `success`, and `error` states
- **Accent Colors** - Supports cyan, blue, violet, and amber color schemes
- **Performance Optimized** - SVG-based with Framer Motion for smooth 60fps animations
- **Accessibility** - Full support for `prefers-reduced-motion` media query
- **Interactive** - Hover effects increase animation speed and glow intensity
- **HUD Elements** - Holographic status displays and micro-dot clusters

## Component Props

```typescript
interface JarvisSphereProps {
  state?: 'idle' | 'thinking' | 'success' | 'error';  // Default: 'idle'
  size?: number;                                        // Default: 240px
  accent?: 'cyan' | 'blue' | 'violet' | 'amber';      // Default: 'cyan'
  className?: string;                                   // Additional Tailwind classes
}
```

## Usage

### Basic Usage

```tsx
import JarvisSphere from '@/components/JarvisSphere';

function MyComponent() {
  return <JarvisSphere state="idle" size={240} accent="cyan" />;
}
```

### With State Management

```tsx
import { useState } from 'react';
import JarvisSphere from '@/components/JarvisSphere';

function AIPanel() {
  const [isProcessing, setIsProcessing] = useState(false);

  const sphereState = isProcessing ? 'thinking' : 'idle';

  return (
    <div className="flex flex-col items-center gap-4">
      <JarvisSphere state={sphereState} size={280} accent="cyan" />
      <button
        onClick={() => setIsProcessing(!isProcessing)}
        className="px-4 py-2 bg-cyan-500 rounded"
      >
        {isProcessing ? 'Stop' : 'Start'}
      </button>
    </div>
  );
}
```

### Integrated Hero Example

See `src/components/AIAssistant.tsx` for a complete standalone demo:

```tsx
import AIAssistant from '@/components/AIAssistant';

function App() {
  return <AIAssistant />;
}
```

## Animation States

### `idle`
- Calm, slow rotation
- Low glow opacity (0.5)
- 8 data particles orbiting
- Subtle pulsing
- Suitable for standby mode

### `thinking`
- Faster rotation and animations
- Higher glow opacity (0.9)
- 24 data particles orbiting
- Increased core pulse
- Indicates active processing

### `success`
- Slower, ceremonial animation
- Medium glow (0.7)
- Reduced particle speed (0.5x)
- Expanded rotation duration
- Indicates completion

### `error`
- Alert-style animation
- Red/amber accent (or keeps color)
- Moderate speed (1.2x)
- Pulsing glow
- Indicates warning/failure

## Accent Colors

| Accent | Glow Color | Use Case |
|--------|-----------|----------|
| `cyan` | #00ffff | Default, primary actions |
| `blue` | #00bbff | Secondary/safe actions |
| `violet` | #bf00ff | Premium/special modes |
| `amber` | #ffaa00 | Warnings/alerts |

## Animation Features

### Core Sphere
- Central radial gradient with glowing halo
- Pulsing expansion every 2 seconds
- Opacity varies by state

### Latitude & Longitude Lines
- 6 latitude rings wrapping the sphere
- 8 longitude lines through center
- Rotating in opposite directions for visual interest
- Opacity animations staggered by index

### Orbital Rings
- 3 independent rings at different radii
- Each rotates on different axis and speed:
  - Ring 1: 8s (fast, 60px radius, 20° tilt)
  - Ring 2: -6s (reverse, 75px radius, -35° tilt)
  - Ring 3: 10s (medium, 90px radius, horizontal)
- Speed increases during `thinking` state

### Data Particles
- Travel along orbital paths with smooth trails
- 16 particles in `idle`, 24 in `thinking`
- Each has 3-layer trailing effect for motion blur
- Pulsing size (2.5px → 3.5px)

### Micro-Dots
- 8 floating clusters around sphere perimeter
- Pulse independently with connection lines to center
- Create holographic "data" impression

### Scanlines & Shimmer
- Subtle horizontal shimmer across sphere
- 2.5s animation cycle
- Low opacity (0.05-0.15) for premium feel
- Adds analog/retro aesthetic

### HUD Label
- Status text: `◆ IDLE`, `⟳ PROCESSING`, `✓ READY`, or `✗ ERROR`
- Glowing text with monospace font
- Pulsing opacity

## Responsive Sizing

```tsx
// Small (embedded)
<JarvisSphere size={140} />

// Medium (dashboard)
<JarvisSphere size={240} />

// Large (hero/full-screen)
<JarvisSphere size={320} />
```

## Styling with Tailwind

The component uses inline SVG styles, but you can wrap it with Tailwind utilities:

```tsx
<div className="flex items-center justify-center p-8 rounded-2xl bg-gradient-to-br from-slate-950 to-blue-950">
  <JarvisSphere 
    state="thinking" 
    size={280} 
    accent="cyan"
    className="drop-shadow-2xl"
  />
</div>
```

### CSS Classes for Enhancement

Add these to your stylesheets for additional effects:

```css
/* Glow effects by color */
.sphere-glow-cyan { /* Cyan glow halo */ }
.sphere-glow-blue { /* Blue glow halo */ }
.sphere-glow-violet { /* Violet glow halo */ }
.sphere-glow-amber { /* Amber glow halo */ }

/* Animations */
.core-pulse { /* Pulsing core effect */ }
.holographic { /* Holographic color shift */ }
.scanline-shimmer { /* Scanline effect */ }
.orbital-ring-slow { /* Slow ring rotation */ }
.orbital-ring-medium { /* Medium ring rotation */ }
.orbital-ring-fast { /* Fast ring rotation */ }
```

## Performance Considerations

- **60fps on modern devices** - Uses GPU-accelerated transforms
- **Reduced motion support** - Animations disabled for accessibility
- **SVG-based** - Renders efficiently without heavy 3D engines
- **Memoized particles** - Particle paths calculated once, reused
- **Frame budget** - Animations are optimized for Electron apps

## Hover Behavior

Hovering over the sphere increases:
- Animation speed (idling duration: 8s → 4s)
- Glow intensity (+40% opacity)
- Particle density (in `thinking` state: 24 → 28 particles)
- Overall responsiveness

Hover effects are disabled on touch devices and with `prefers-reduced-motion`.

## Browser Compatibility

- ✅ Chrome/Chromium (best support)
- ✅ Firefox
- ✅ Safari 12+
- ✅ Edge 79+
- ✅ Electron (native Chromium)

## Accessibility

- Full support for `prefers-reduced-motion: reduce`
- Animations disabled when motion preference is set
- ARIA-compatible (rendering semantic SVG)
- High contrast glow visible on dark backgrounds

## Example: Full Dashboard Integration

```tsx
import { useState } from 'react';
import JarvisSphere from '@/components/JarvisSphere';

export default function Dashboard() {
  const [state, setState] = useState<'idle' | 'thinking' | 'success' | 'error'>('idle');

  const startProcessing = async () => {
    setState('thinking');
    await new Promise(resolve => setTimeout(resolve, 3000));
    setState('success');
    setTimeout(() => setState('idle'), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
      <div className="text-center">
        <JarvisSphere 
          state={state} 
          size={300} 
          accent="cyan"
          className="drop-shadow-2xl mb-8 mx-auto"
        />
        <h1 className="text-3xl font-bold text-cyan-400 mb-4">JARVIS</h1>
        <p className="text-cyan-300/70 mb-6">AI Session Orchestrator</p>
        <button
          onClick={startProcessing}
          disabled={state === 'thinking'}
          className="px-6 py-3 bg-cyan-500 text-black rounded-lg font-bold hover:bg-cyan-400 disabled:opacity-50"
        >
          {state === 'thinking' ? 'Processing...' : 'Start Command'}
        </button>
      </div>
    </div>
  );
}
```

## Troubleshooting

**Animations not running?**
- Check if `prefers-reduced-motion` is enabled
- Verify Framer Motion is installed
- Check browser DevTools for animation performance

**Glow not showing?**
- Ensure background is dark enough for contrast
- Check SVG filters are not being blocked by CSP
- Verify CSS is compiled (run `npm run build`)

**Performance issues?**
- Reduce particle count by using smaller `size` prop
- Disable animations in performance-critical sections
- Use state transitions instead of continuous effects

## License

Part of the JARVIS project, licensed under MIT.

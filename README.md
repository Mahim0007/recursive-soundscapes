# Recursive Soundscapes

**D Lydian Fractal Tree · Procedural Ambient Music & Visualization**

An interactive creative-coding web application built for **Solo Hackathon · Creative Coding · Epoch 1**. Every branch of a recursive binary fractal tree is traversed and mapped in real time to harmonic notes, stereo space, ambient reverb, and luminous Canvas 2D visuals — and can be recorded and downloaded directly from the browser.

---

## How Recursion Becomes Music & Visuals

The core generator (`generateFractalTree` in `src/recursion.ts`) recursively splits each branch into left and right child branches until reaching the configured recursion depth (`2^depth - 1` total branches, `2^(depth - 1)` base-case leaves). During playback, each step is transformed by `mapStepToMusic`:

| Recursive Property | Musical Mapping | Visual Mapping |
| :--- | :--- | :--- |
| **Recursion Depth (`depth`)** | Climbs registers across the **D Lydian** scale (`D3`–`F#5`) while softening velocity | Shifts branch color from indigo-slate trunk to aurora teal and lavender |
| **Horizontal Position (`x2`)** | Stereo pan (`-0.85` left to `+0.85` right) | Left–right canopy symmetry & sway |
| **Branch Length (`length`)** | Note duration (`0.55s`–`1.80s`) | Stroke thickness & branch reach |
| **Canopy Distance (`distance`)** | Lowpass filter cutoff (`950 Hz`–`3050 Hz`) & reverb wet mix (`0.42`–`0.78`) | Radial expansion from the trunk origin |
| **Base-Case Leaves (`isBaseCase`)** | High bell chimes (`F#5`–`E6`) & soft D Lydian pad chords (`D`, `E`, `A`, `Bm`) | Luminous pink leaf blooms & expanding water ripples |
| **Cycle Completion** | Brief 4-step breathing pause before looping | Full canopy silhouette remains visible before restarting |

---

## Interactive Parameters

Adjusting any slider in the **Shape & Sound** panel updates the tree geometry immediately and shapes the next steps seamlessly:

| Parameter | Range | Default | Effect |
| :--- | :--- | :--- | :--- |
| **Recursion Depth** | `3` – `8` levels | `6` (`63` branches) | Controls tree complexity, total steps, and upper harmonic registers |
| **Branching Angle** | `12°` – `65°` | `28°` | Widens canopy spread and stereo width |
| **Branch Scale** | `0.58` – `0.82` | `0.74` | Scales child branch length and note sustain |
| **Sway / Asymmetry** | `-20°` – `+20°` | `+4°` | Tilts left/right growth bias and stereo balance |
| **Tempo** | `30` – `100` BPM | `52` BPM | Sets step pacing (`60000 / (tempo * 2)` ms per branch) |
| **Volume** | `0%` – `100%` | `78%` | Master output gain (with `-2 dB` limiter protection) |

---

## Audio Engine & Export

`AmbientAudioEngine` (`src/audioEngine.ts`) synthesizes all sound procedurally using **Tone.js**:

```text
Voice Pool (12 desktop / 8 mobile sine & triangle synths)
  └─► Panner ─► Lowpass Filter ─► Feedback Delay (4n.) ─┐
Chime PolySynth ────────────────────────────────────────┼─► Reverb ─► Master Gain ─► Limiter (-2 dB) ─┬─► Destination
Pad PolySynth ──────────────────────────────────────────┘                                             └─► Tone.Recorder
```

- **Pause-aware recording & export:** Playback is captured via `Tone.Recorder` (`MediaRecorder` API) and exported via the **Download** button (`.webm`, `.ogg`, or `.m4a` depending on browser codec support).
- **Controls & shortcuts:** Play/Pause (`Space` on desktop), Stop, Download, and Reset Defaults.

---

## Accessibility & Mobile Support

- **Accessibility:** Supports `prefers-reduced-motion`, `aria-live="polite"` playback status updates, `aria-valuetext` slider readouts, and keyboard focus indicators.
- **Mobile optimizations:** Uses `100dvh` safe-area layout, a thumb-friendly bottom-sheet control panel, larger coarse-pointer slider thumbs (`22px`), `overscroll-behavior: none`, cached offscreen Canvas backdrop gradients, depth-batched branch rendering, visibility-based animation pausing, and tuned voice pool / reverb decay for mobile devices.

---

## Getting Started

### Prerequisites
- **Node.js** (with `node --test` support for running the TypeScript unit tests)
- **npm**

### Install & Run

```bash
# Install dependencies
npm install

# Start development server (default: http://localhost:5173)
npm run dev
```

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server |
| `npm run build` | Type-checks (`tsc --noEmit`) and builds production assets into `dist/` |
| `npm run preview` | Serves the production `dist/` build locally |
| `npm test` | Runs the unit test suite (`node --test src/recursion.test.ts`) |

---

## Tech Stack

- **UI & Build:** React 19, TypeScript 5.8, Vite 8, Tailwind CSS v4
- **Procedural Audio:** Tone.js 15 (Web Audio API + `MediaRecorder`)
- **Visualization:** HTML5 Canvas 2D

---

## Project Structure

```text
├── index.html                        # Entry HTML, viewport & inline SVG favicon
├── package.json                      # Scripts and dependencies
├── tsconfig.json                     # TypeScript configuration
├── vite.config.ts                    # Vite & Tailwind CSS plugin config
└── src/
    ├── main.tsx                      # React root mount
    ├── App.tsx                       # Playback scheduler, recording state, transport UI
    ├── index.css                     # Tailwind import & touch-friendly slider styles
    ├── recursion.ts                  # Fractal tree generator & D Lydian music mapper
    ├── recursion.test.ts             # Unit tests for tree geometry, clamping & D Lydian scale
    ├── audioEngine.ts                # Tone.js synth pool, effects chain & recorder
    └── components/
        ├── CanvasVisualizer.tsx      # Real-time Canvas 2D fractal & ripple renderer
        └── ControlPanel.tsx          # Responsive parameter drawer / bottom sheet
```

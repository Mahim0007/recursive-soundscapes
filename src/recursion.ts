export interface RecursionParams {
  depth: number;
  angle: number;
  scale: number;
  asymmetry: number;
  tempo: number;
  volume: number;
}

export const DEFAULT_PARAMS: RecursionParams = {
  depth: 6,
  angle: 28,
  scale: 0.74,
  asymmetry: 4,
  tempo: 52,
  volume: 0.78,
};

export interface BranchStep {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;
  maxDepth: number;
  isBaseCase: boolean;
  length: number;
  angleDeg: number;
  pan: number;
  distance: number;
  side: -1 | 0 | 1;
  pathBit: number;
}

export interface MusicalEvent {
  note: string;
  durationSec: number;
  velocity: number;
  pan: number;
  reverbWet: number;
  filterHz: number;
  chimeNote: string | null;
  chord: readonly string[] | null;
}

const DEPTH_REGISTERS: readonly (readonly [string, string])[] = [
  ["D3", "A2"],
  ["A3", "E4"],
  ["D4", "F#4"],
  ["E4", "A4"],
  ["F#4", "B4"],
  ["A4", "C#5"],
  ["B4", "E5"],
  ["D5", "F#5"],
];

const CHIME_NOTES = ["F#5", "A5", "B5", "C#6", "E6"] as const;

const AMBIENT_CHORDS: readonly (readonly string[])[] = [
  ["D3", "A3", "F#4"],
  ["E3", "B3", "G#4"],
  ["A3", "E4", "C#5"],
  ["B2", "F#3", "D4"],
];

export function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function clampParams(params: RecursionParams): RecursionParams {
  return {
    depth: Math.round(clamp(params.depth, 3, 8, DEFAULT_PARAMS.depth)),
    angle: clamp(params.angle, 12, 65, DEFAULT_PARAMS.angle),
    scale: clamp(params.scale, 0.58, 0.82, DEFAULT_PARAMS.scale),
    asymmetry: clamp(params.asymmetry, -20, 20, DEFAULT_PARAMS.asymmetry),
    tempo: Math.round(clamp(params.tempo, 30, 100, DEFAULT_PARAMS.tempo)),
    volume: clamp(params.volume, 0, 1, DEFAULT_PARAMS.volume),
  };
}

export function stepIntervalMs(tempo: number): number {
  const safeTempo = clamp(tempo, 30, 100, DEFAULT_PARAMS.tempo);
  return Math.round(60000 / (safeTempo * 2));
}

export function generateFractalTree(rawParams: RecursionParams): BranchStep[] {
  const params = clampParams(rawParams);
  const maxDepth = params.depth - 1;
  const spreadRad = (params.angle * Math.PI) / 180;
  const swayRad = (params.asymmetry * Math.PI) / 180;
  const steps: BranchStep[] = [];

  function recurse(
    x1: number,
    y1: number,
    angleRad: number,
    length: number,
    depth: number,
    side: -1 | 0 | 1,
    pathBit: number
  ): void {
    const x2 = x1 + Math.sin(angleRad) * length;
    const y2 = y1 + Math.cos(angleRad) * length;
    const isBaseCase = depth === maxDepth;

    steps.push({
      id: steps.length,
      x1,
      y1,
      x2,
      y2,
      depth,
      maxDepth,
      isBaseCase,
      length,
      angleDeg: (angleRad * 180) / Math.PI,
      pan: 0,
      distance: 0,
      side,
      pathBit,
    });

    if (isBaseCase) return;

    const nextLen = length * params.scale;
    recurse(x2, y2, angleRad - spreadRad + swayRad, nextLen, depth + 1, -1, pathBit * 2);
    recurse(x2, y2, angleRad + spreadRad + swayRad, nextLen, depth + 1, 1, pathBit * 2 + 1);
  }

  recurse(0, 0, 0, 1, 0, 0, 0);

  let maxAbsX = 0.001;
  let maxDist = 0.001;
  for (const step of steps) {
    maxAbsX = Math.max(maxAbsX, Math.abs(step.x2));
    maxDist = Math.max(maxDist, Math.hypot(step.x2, step.y2));
  }

  for (const step of steps) {
    step.pan = clamp((step.x2 / maxAbsX) * 0.85, -0.85, 0.85, 0);
    step.distance = clamp(Math.hypot(step.x2, step.y2) / maxDist, 0, 1, 0);
  }

  return steps;
}

export function mapStepToMusic(step: BranchStep, rawParams: RecursionParams): MusicalEvent {
  const params = clampParams(rawParams);
  const regIndex = Math.min(step.depth, DEPTH_REGISTERS.length - 1);
  const pair = DEPTH_REGISTERS[regIndex];

  // Alternate within the depth's harmonic pair based on branch side & path parity.
  const pickSecond = step.side === 1 ? (step.pathBit & 1) === 1 : (step.pathBit & 2) === 2;
  const note = pair[pickSecond ? 1 : 0];

  const normScale = (params.scale - 0.58) / (0.82 - 0.58);
  const durationSec = Number(clamp(0.55 + step.length * 0.95 + normScale * 0.3, 0.55, 1.8, 1.0).toFixed(2));
  const depthRatio = step.maxDepth > 0 ? step.depth / step.maxDepth : 0;
  const velocity = Number(clamp(0.46 - depthRatio * 0.24, 0.18, 0.48, 0.32).toFixed(2));

  return {
    note,
    durationSec,
    velocity,
    pan: step.pan,
    reverbWet: Number((0.42 + step.distance * 0.36).toFixed(2)),
    filterHz: Math.round(950 + step.distance * 2100),
    chimeNote: step.isBaseCase ? CHIME_NOTES[step.pathBit % CHIME_NOTES.length] : null,
    chord: step.isBaseCase ? AMBIENT_CHORDS[(step.pathBit >> 2) % AMBIENT_CHORDS.length] : null,
  };
}

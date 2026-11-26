import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PARAMS,
  clampParams,
  generateFractalTree,
  mapStepToMusic,
  stepIntervalMs,
} from "./recursion.ts";

test("generateFractalTree produces 2^depth - 1 branches and 2^(depth-1) leaves", () => {
  for (const depth of [3, 6, 8]) {
    const steps = generateFractalTree({ ...DEFAULT_PARAMS, depth });
    assert.equal(steps.length, 2 ** depth - 1);
    const leaves = steps.filter((s) => s.isBaseCase);
    assert.equal(leaves.length, 2 ** (depth - 1));
  }
});

test("clampParams protects boundaries against extreme and NaN inputs", () => {
  const clamped = clampParams({
    depth: 99,
    angle: Number.NaN,
    scale: 2.5,
    asymmetry: -100,
    tempo: 5,
    volume: -3,
  });
  assert.equal(clamped.depth, 8);
  assert.equal(clamped.angle, DEFAULT_PARAMS.angle);
  assert.equal(clamped.scale, 0.82);
  assert.equal(clamped.asymmetry, -20);
  assert.equal(clamped.tempo, 30);
  assert.equal(clamped.volume, 0);

  const lowDepth = clampParams({ ...DEFAULT_PARAMS, depth: 1 });
  assert.equal(lowDepth.depth, 3);
});

test("normalized spatial coordinates stay within safe bounds", () => {
  const steps = generateFractalTree({ ...DEFAULT_PARAMS, depth: 7, angle: 42 });
  for (const step of steps) {
    assert.ok(step.pan >= -0.85 && step.pan <= 0.85, `pan out of bounds: ${step.pan}`);
    assert.ok(step.distance >= 0 && step.distance <= 1, `distance out of bounds: ${step.distance}`);
  }
});

function noteMidiApprox(note: string): number {
  const match = /^([A-G])(#?)(\d)$/.exec(note);
  if (!match) assert.fail(`unexpected note format: ${note}`);
  const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (Number(match[3]) + 1) * 12 + semitones[match[1]] + (match[2] ? 1 : 0);
}

test("mapStepToMusic climbs pitch with depth and triggers chimes/chords only on base-case leaves", () => {
  const steps = generateFractalTree({ ...DEFAULT_PARAMS, depth: 6 });
  const trunk = steps[0];
  const leaf = steps.find((s) => s.isBaseCase);
  if (!leaf) assert.fail("expected at least one base-case leaf");

  const trunkEvent = mapStepToMusic(trunk, DEFAULT_PARAMS);
  const leafEvent = mapStepToMusic(leaf, DEFAULT_PARAMS);

  assert.ok(noteMidiApprox(leafEvent.note) > noteMidiApprox(trunkEvent.note));
  assert.equal(trunkEvent.chimeNote, null);
  assert.equal(trunkEvent.chord, null);
  assert.ok(leafEvent.chimeNote !== null);
  assert.ok(leafEvent.chord !== null && leafEvent.chord.length === 3);
  assert.ok(leafEvent.reverbWet >= 0.42 && leafEvent.reverbWet <= 0.78);
  assert.ok(leafEvent.velocity >= 0.18 && leafEvent.velocity <= 0.48);
  assert.ok(stepIntervalMs(DEFAULT_PARAMS.tempo) > 0);
});

test("all generated notes, chimes, and chords belong to D Lydian pitch classes", () => {
  const dLydian = new Set(["D", "E", "F#", "G#", "A", "B", "C#"]);
  const pitchClass = (note: string): string => {
    const match = /^([A-G]#?)\d$/.exec(note);
    if (!match) assert.fail(`unexpected note format: ${note}`);
    return match[1];
  };

  for (let depth = 3; depth <= 8; depth += 1) {
    const steps = generateFractalTree({ ...DEFAULT_PARAMS, depth });
    for (const step of steps) {
      const ev = mapStepToMusic(step, { ...DEFAULT_PARAMS, depth });
      assert.ok(dLydian.has(pitchClass(ev.note)), `non-Lydian note: ${ev.note}`);
      if (ev.chimeNote) {
        assert.ok(dLydian.has(pitchClass(ev.chimeNote)), `non-Lydian chime: ${ev.chimeNote}`);
      }
      if (ev.chord) {
        for (const chordNote of ev.chord) {
          assert.ok(dLydian.has(pitchClass(chordNote)), `non-Lydian chord note: ${chordNote}`);
        }
      }
    }
  }
});

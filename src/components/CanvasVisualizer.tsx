import { useEffect, useRef } from "react";
import type { BranchStep } from "../recursion.ts";

export interface PlaybackProgress {
  count: number;
  stepStartedAt: number;
  stepDurationMs: number;
  isPlaying: boolean;
}

interface CanvasVisualizerProps {
  stepsRef: React.RefObject<BranchStep[]>;
  progressRef: React.RefObject<PlaybackProgress>;
  branchCount: number;
  currentDepth: number;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
}

interface Ripple {
  stepId: number;
  x: number;
  y: number;
  bornAt: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function branchHue(depth: number, maxDepth: number): number {
  const ratio = maxDepth > 0 ? depth / maxDepth : 0;
  // Indigo-slate trunk (224) -> aurora teal (186) -> luminous lavender (268)
  if (ratio < 0.5) {
    return 224 - (ratio / 0.5) * 38;
  }
  return 186 + ((ratio - 0.5) / 0.5) * 82;
}

export function CanvasVisualizer({
  stepsRef,
  progressRef,
  branchCount,
  currentDepth,
}: CanvasVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    let reduceMotion = motionQuery.matches;
    const onMotionChange = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
    };
    motionQuery.addEventListener("change", onMotionChange);

    const bgCanvas = document.createElement("canvas");
    const bgCtx = bgCanvas.getContext("2d");

    let width = canvas.clientWidth || window.innerWidth;
    let height = canvas.clientHeight || window.innerHeight;
    let dpr = 1;

    const resize = () => {
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      const maxDpr = width < 768 || coarsePointerQuery.matches ? 1.5 : 2;
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));

      if (bgCtx) {
        bgCanvas.width = canvas.width;
        bgCanvas.height = canvas.height;
        bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Deep twilight backdrop cached per resize for smooth 60fps mobile rendering.
        const bg = bgCtx.createLinearGradient(0, 0, 0, height);
        bg.addColorStop(0, "#050811");
        bg.addColorStop(0.55, "#0b1224");
        bg.addColorStop(1, "#121b33");
        bgCtx.fillStyle = bg;
        bgCtx.fillRect(0, 0, width, height);

        const aurora = bgCtx.createRadialGradient(
          width * 0.5,
          height * 0.44,
          10,
          width * 0.5,
          height * 0.44,
          Math.max(width, height) * 0.48
        );
        aurora.addColorStop(0, "rgba(45, 212, 191, 0.085)");
        aurora.addColorStop(0.45, "rgba(129, 140, 248, 0.045)");
        aurora.addColorStop(1, "rgba(5, 8, 17, 0)");
        bgCtx.fillStyle = aurora;
        bgCtx.fillRect(0, 0, width, height);
      }
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const motes: Mote[] = Array.from({ length: 24 }, (_, i) => ({
      x: ((i * 73) % 100) / 100,
      y: ((i * 41) % 100) / 100,
      r: 0.9 + (i % 3) * 0.65,
      vx: ((i % 2 === 0 ? 1 : -1) * (0.000012 + (i % 5) * 0.000004)),
      vy: -(0.000015 + (i % 4) * 0.000005),
      alpha: 0.14 + (i % 4) * 0.07,
    }));

    const ripples: Ripple[] = [];
    let lastRippleCount = 0;
    let lastFrameAt = 0;
    let rafId = 0;
    let cachedSteps: BranchStep[] | null = null;
    let cachedBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    const render = (now: number) => {
      const dt = lastFrameAt ? Math.min(50, Math.max(0, now - lastFrameAt)) / 16.67 : 1;
      lastFrameAt = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (bgCtx && bgCanvas.width > 0 && bgCanvas.height > 0) {
        ctx.drawImage(bgCanvas, 0, 0, width, height);
      } else {
        ctx.fillStyle = "#060913";
        ctx.fillRect(0, 0, width, height);
      }

      // Drifting ambient motes
      if (!reduceMotion) {
        for (const m of motes) {
          m.x = (m.x + m.vx * dt + 1) % 1;
          m.y = (m.y + m.vy * dt + 1) % 1;
          ctx.beginPath();
          ctx.arc(m.x * width, m.y * height, m.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(186, 230, 253, ${m.alpha})`;
          ctx.fill();
        }
      }

      const steps = stepsRef.current;
      if (steps.length > 0) {
        if (steps !== cachedSteps) {
          cachedSteps = steps;
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          for (const s of steps) {
            minX = Math.min(minX, s.x1, s.x2);
            maxX = Math.max(maxX, s.x1, s.x2);
            minY = Math.min(minY, s.y1, s.y2);
            maxY = Math.max(maxY, s.y1, s.y2);
          }
          cachedBounds = { minX, maxX, minY, maxY };
        }
        const { minX, maxX, minY, maxY } = cachedBounds;

        const spanX = Math.max(0.4, maxX - minX);
        const spanY = Math.max(0.4, maxY - minY);
        const padX = Math.min(width * 0.12, 80);
        const padTop = width < 640 ? 116 : 76;
        const padBottom = 112;
        const availW = Math.max(120, width - padX * 2);
        const availH = Math.max(120, height - padTop - padBottom);
        const worldScale = Math.min(availW / spanX, availH / spanY);

        const offsetX = width * 0.5 - ((minX + maxX) * 0.5) * worldScale;
        const offsetY = padTop + availH * 0.5 + ((minY + maxY) * 0.5) * worldScale;

        const toScreenX = (wx: number) => offsetX + wx * worldScale;
        const toScreenY = (wy: number) => offsetY - wy * worldScale;

        // Ghost preview silhouette of the full fractal tree
        ctx.save();
        ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
        ctx.lineWidth = 1;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const s of steps) {
          ctx.moveTo(toScreenX(s.x1), toScreenY(s.y1));
          ctx.lineTo(toScreenX(s.x2), toScreenY(s.y2));
        }
        ctx.stroke();
        ctx.restore();

        const progress = progressRef.current;
        const visibleCount = Math.min(progress.count, steps.length);

        if (visibleCount < lastRippleCount) {
          ripples.length = 0;
        }
        if (visibleCount > lastRippleCount) {
          for (let i = lastRippleCount; i < visibleCount; i += 1) {
            const leaf = steps[i];
            if (leaf?.isBaseCase) {
              ripples.push({
                stepId: leaf.id,
                x: toScreenX(leaf.x2),
                y: toScreenY(leaf.y2),
                bornAt: now,
              });
            }
          }
          if (ripples.length > 48) {
            ripples.splice(0, ripples.length - 48);
          }
        }
        lastRippleCount = visibleCount;

        // Batch completed branches by depth to minimize canvas draw calls on mobile GPUs.
        ctx.lineCap = "round";
        const completedEnd = progress.isPlaying && visibleCount > 0 ? visibleCount - 1 : visibleCount;
        if (completedEnd > 0) {
          const byDepth: BranchStep[][] = [];
          for (let i = 0; i < completedEnd; i += 1) {
            const s = steps[i];
            let bucket = byDepth[s.depth];
            if (!bucket) {
              bucket = [];
              byDepth[s.depth] = bucket;
            }
            bucket.push(s);
          }

          for (const group of byDepth) {
            if (!group || group.length === 0) continue;
            const sample = group[0];
            const hue = branchHue(sample.depth, sample.maxDepth);
            const coreWidth = Math.max(1.0, sample.length * 6.5);

            ctx.beginPath();
            for (const s of group) {
              ctx.moveTo(toScreenX(s.x1), toScreenY(s.y1));
              ctx.lineTo(toScreenX(s.x2), toScreenY(s.y2));
            }
            ctx.strokeStyle = `hsla(${hue}, 78%, 72%, 0.16)`;
            ctx.lineWidth = coreWidth + 4.5;
            ctx.stroke();

            ctx.strokeStyle = `hsla(${hue}, 82%, 82%, 0.85)`;
            ctx.lineWidth = coreWidth;
            ctx.stroke();
          }

          // Batch completed base-case leaf bloom dots into a single fill pass.
          ctx.beginPath();
          let hasCompletedLeaf = false;
          for (let i = 0; i < completedEnd; i += 1) {
            const s = steps[i];
            if (s.isBaseCase) {
              hasCompletedLeaf = true;
              const bx = toScreenX(s.x2);
              const by = toScreenY(s.y2);
              ctx.moveTo(bx + 3.2, by);
              ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
            }
          }
          if (hasCompletedLeaf) {
            ctx.fillStyle = "hsla(325, 80%, 84%, 0.765)";
            ctx.fill();
          }
        }

        // Draw the active growing tip separately so partial interpolation animates smoothly.
        if (progress.isPlaying && visibleCount > 0) {
          const s = steps[visibleCount - 1];
          const rawT = Math.min(
            1,
            Math.max(0, (now - progress.stepStartedAt) / Math.max(120, progress.stepDurationMs))
          );
          const t = easeOutCubic(rawT);

          const sx1 = toScreenX(s.x1);
          const sy1 = toScreenY(s.y1);
          const sx2 = sx1 + (toScreenX(s.x2) - sx1) * t;
          const sy2 = sy1 + (toScreenY(s.y2) - sy1) * t;

          const hue = branchHue(s.depth, s.maxDepth);
          const coreWidth = Math.max(1.0, s.length * 6.5);

          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.strokeStyle = `hsla(${hue}, 78%, 72%, 0.16)`;
          ctx.lineWidth = coreWidth + 4.5;
          ctx.stroke();

          ctx.strokeStyle = `hsla(${hue}, 82%, 82%, 0.85)`;
          ctx.lineWidth = coreWidth;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(sx2, sy2, 3.8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(153, 246, 228, 0.92)";
          ctx.fill();

          if (s.isBaseCase && t > 0.72) {
            const bloomAlpha = Math.min(0.9, (t - 0.72) / 0.28);
            ctx.beginPath();
            ctx.arc(sx2, sy2, 3.2, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(325, 80%, 84%, ${bloomAlpha * 0.85})`;
            ctx.fill();
          }
        }

        // Expanding water ripples on base-case blooms
        for (let i = ripples.length - 1; i >= 0; i -= 1) {
          const rip = ripples[i];
          const age = (now - rip.bornAt) / 2200;
          if (age >= 1) {
            ripples.splice(i, 1);
            continue;
          }
          const radius = reduceMotion ? 6 : 4 + age * 26;
          const alpha = (1 - age) * (reduceMotion ? 0.22 : 0.42);
          ctx.beginPath();
          ctx.arc(rip.x, rip.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(325, 85%, 86%, ${alpha})`;
          ctx.lineWidth = 1.25;
          ctx.stroke();
        }
      }

      if (!document.hidden) {
        rafId = window.requestAnimationFrame(render);
      } else {
        rafId = 0;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else if (!rafId) {
        lastFrameAt = 0;
        rafId = window.requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (!document.hidden) {
      rafId = window.requestAnimationFrame(render);
    }

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, [stepsRef, progressRef]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Ambient fractal tree visualization with ${branchCount} branches at recursion depth ${currentDepth}`}
      className="block h-full w-full"
    />
  );
}

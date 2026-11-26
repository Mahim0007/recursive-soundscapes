import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AmbientAudioEngine } from "./audioEngine.ts";
import { CanvasVisualizer, type PlaybackProgress } from "./components/CanvasVisualizer.tsx";
import { ControlPanel } from "./components/ControlPanel.tsx";
import {
  DEFAULT_PARAMS,
  generateFractalTree,
  mapStepToMusic,
  stepIntervalMs,
  type BranchStep,
  type RecursionParams,
} from "./recursion.ts";

type PlaybackStatus = "stopped" | "playing" | "paused";

interface ActiveInfo {
  step: number;
  total: number;
  depth: number;
  note: string;
  pan: number;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function extensionForMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("mp4") || lower.includes("aac")) return "m4a";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("wav")) return "wav";
  return "webm";
}

export default function App() {
  const [params, setParams] = useState<RecursionParams>(DEFAULT_PARAMS);
  const [status, setStatus] = useState<PlaybackStatus>("stopped");
  const [panelOpen, setPanelOpen] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [activeInfo, setActiveInfo] = useState<ActiveInfo | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [hasDownloadableAudio, setHasDownloadableAudio] = useState(false);
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const engineRef = useRef<AmbientAudioEngine | null>(null);
  const paramsRef = useRef<RecursionParams>(params);
  const stepsRef = useRef<BranchStep[]>(generateFractalTree(DEFAULT_PARAMS));
  const stepIndexRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const playSessionRef = useRef(0);
  const statusRef = useRef<PlaybackStatus>(status);
  statusRef.current = status;
  const lastBlobRef = useRef<Blob | null>(null);
  const progressRef = useRef<PlaybackProgress>({
    count: 0,
    stepStartedAt: 0,
    stepDurationMs: stepIntervalMs(DEFAULT_PARAMS.tempo),
    isPlaying: false,
  });

  const steps = useMemo(() => generateFractalTree(params), [params]);
  const branchCount = steps.length;

  const clearScheduler = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Recompute tree immediately on parameter updates so the next iteration adapts seamlessly.
  useEffect(() => {
    paramsRef.current = params;
    stepsRef.current = steps;
    if (stepIndexRef.current >= steps.length) {
      stepIndexRef.current = 0;
    }
    progressRef.current.count = Math.min(progressRef.current.count, steps.length);
    setActiveInfo((prev) =>
      prev && prev.total !== steps.length
        ? { ...prev, step: Math.min(prev.step, steps.length), total: steps.length }
        : prev
    );
    engineRef.current?.setVolume(params.volume);
  }, [params, steps]);

  useEffect(() => {
    if (!isRecording || status !== "playing") return;
    const id = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRecording, status]);

  const scheduleNextStep = useCallback(() => {
    const steps = stepsRef.current;
    if (steps.length === 0) return;

    const idx = stepIndexRef.current % steps.length;
    const step = steps[idx];
    const currentParams = paramsRef.current;
    const intervalMs = stepIntervalMs(currentParams.tempo);
    const event = mapStepToMusic(step, currentParams);

    engineRef.current?.playStep(event);

    progressRef.current = {
      count: idx + 1,
      stepStartedAt: performance.now(),
      stepDurationMs: intervalMs,
      isPlaying: true,
    };

    setActiveInfo({
      step: idx + 1,
      total: steps.length,
      depth: step.depth + 1,
      note: event.note,
      pan: event.pan,
    });

    const isCycleEnd = idx + 1 >= steps.length;
    stepIndexRef.current = isCycleEnd ? 0 : idx + 1;
    const nextDelay = isCycleEnd ? intervalMs * 4 : intervalMs;
    timerRef.current = window.setTimeout(scheduleNextStep, nextDelay);
  }, []);

  const handlePlay = useCallback(async () => {
    setErrorMsg(null);
    setStarting(true);
    const session = ++playSessionRef.current;
    const wasStopped = statusRef.current === "stopped";
    try {
      if (!engineRef.current) {
        engineRef.current = new AmbientAudioEngine();
      }
      await engineRef.current.init(paramsRef.current.volume);
      if (session !== playSessionRef.current) return;

      if (wasStopped) {
        setRecordingSeconds(0);
      }
      if (engineRef.current.startRecording()) {
        setIsRecording(true);
        setHasDownloadableAudio(true);
      }

      clearScheduler();
      statusRef.current = "playing";
      setStatus("playing");
      scheduleNextStep();
    } catch (err) {
      if (session !== playSessionRef.current) return;
      const msg = err instanceof Error ? err.message : "Could not start Web Audio.";
      setErrorMsg(msg);
      statusRef.current = "stopped";
      setStatus("stopped");
    } finally {
      if (session === playSessionRef.current) {
        setStarting(false);
      }
    }
  }, [clearScheduler, scheduleNextStep]);

  const handlePause = useCallback(() => {
    playSessionRef.current += 1;
    setStarting(false);
    clearScheduler();
    engineRef.current?.pauseRecording();
    progressRef.current = { ...progressRef.current, isPlaying: false };
    statusRef.current = "paused";
    setStatus("paused");
  }, [clearScheduler]);

  const handleStop = useCallback(async () => {
    playSessionRef.current += 1;
    setStarting(false);
    clearScheduler();
    engineRef.current?.releaseAll();
    stepIndexRef.current = 0;
    progressRef.current = {
      count: 0,
      stepStartedAt: 0,
      stepDurationMs: stepIntervalMs(paramsRef.current.tempo),
      isPlaying: false,
    };
    setActiveInfo(null);
    statusRef.current = "stopped";
    setStatus("stopped");
    setRecordingSeconds(0);

    if (engineRef.current) {
      const blob = await engineRef.current.stopRecording();
      setIsRecording(false);
      if (blob && blob.size > 0) {
        lastBlobRef.current = blob;
        setHasDownloadableAudio(true);
      }
    }
  }, [clearScheduler]);

  const handleDownload = useCallback(async () => {
    setErrorMsg(null);
    setExporting(true);
    try {
      let blob: Blob | null = null;
      if (isRecording && engineRef.current) {
        blob = await engineRef.current.stopRecording();
        setIsRecording(false);
        setRecordingSeconds(0);
        if (blob && blob.size > 0) {
          lastBlobRef.current = blob;
        }
        if (statusRef.current === "playing" && engineRef.current.startRecording()) {
          setIsRecording(true);
        }
      } else {
        blob = lastBlobRef.current;
      }

      if (!blob || blob.size === 0) {
        setErrorMsg("Play the soundscape briefly before downloading audio.");
        return;
      }

      const ext = extensionForMime(blob.type || "audio/webm");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      anchor.href = url;
      anchor.download = `recursive-soundscapes-${stamp}.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Audio export failed.";
      setErrorMsg(msg);
    } finally {
      setExporting(false);
    }
  }, [isRecording]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "BUTTON" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
      if (status === "playing") {
        handlePause();
      } else {
        void handlePlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, handlePause, handlePlay]);

  useEffect(() => {
    return () => {
      playSessionRef.current += 1;
      clearScheduler();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [clearScheduler]);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#060913] text-slate-100 select-none">
      <main className="h-full w-full">
        <CanvasVisualizer
          stepsRef={stepsRef}
          progressRef={progressRef}
          branchCount={branchCount}
          currentDepth={params.depth}
        />
      </main>

      {/* Top-left ambient header & status */}
      <header className="pointer-events-none fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] sm:left-4 sm:top-4 z-20 flex max-w-[calc(100vw-1.5rem)] flex-col gap-2">
        <div className="pointer-events-auto rounded-2xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 sm:px-4 sm:py-3 backdrop-blur-md sm:backdrop-blur-xl">
          <h1 className="text-sm sm:text-base font-medium tracking-wide text-slate-100">Recursive Soundscapes</h1>
          <p className="text-[11px] sm:text-xs text-slate-400">D Lydian Fractal Tree · Procedural Ambient</p>
        </div>

        <div
          aria-live="polite"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-slate-950/55 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              status === "playing"
                ? "animate-pulse bg-teal-300"
                : status === "paused"
                  ? "bg-amber-300/80"
                  : "bg-slate-500"
            }`}
          />
          <span className="truncate">
            {status === "playing" && activeInfo
              ? `Growing ${activeInfo.step}/${activeInfo.total} · Depth ${activeInfo.depth} · ${activeInfo.note}`
              : status === "paused"
                ? "Paused"
                : "Ready — press Play to begin"}
          </span>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="pointer-events-auto max-w-xs rounded-xl border border-rose-400/30 bg-rose-950/80 px-3 py-2 text-xs text-rose-200 backdrop-blur-md"
          >
            {errorMsg}
          </div>
        )}
      </header>

      <ControlPanel
        params={params}
        onChange={setParams}
        branchCount={branchCount}
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
      />

      {/* Bottom-center floating transport pill */}
      <nav
        aria-label="Playback and export controls"
        className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-5 left-1/2 z-20 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 sm:gap-1.5 rounded-full border border-white/10 bg-slate-950/75 p-1.5 shadow-2xl backdrop-blur-md sm:backdrop-blur-xl"
      >
        {status === "playing" ? (
          <button
            type="button"
            onClick={handlePause}
            aria-label="Pause playback"
            className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-teal-400/20 px-3 sm:px-4 py-2 text-xs font-medium text-teal-100 transition hover:bg-teal-400/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
          >
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2.5" width="3.5" height="11" rx="1" />
              <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" />
            </svg>
            <span>Pause</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handlePlay()}
            disabled={starting}
            aria-label={status === "paused" ? "Resume playback" : "Play soundscape"}
            className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-teal-400/20 px-3 sm:px-4 py-2 text-xs font-medium text-teal-100 transition hover:bg-teal-400/30 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
          >
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.8a.7.7 0 0 1 1.06-.6l8.2 5.2a.7.7 0 0 1 0 1.2l-8.2 5.2A.7.7 0 0 1 4 13.2V2.8Z" />
            </svg>
            <span>{starting ? "Starting..." : status === "paused" ? "Resume" : "Play"}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => void handleStop()}
          disabled={status === "stopped"}
          aria-label="Stop playback"
          className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 sm:px-3.5 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
          </svg>
          <span className="hidden min-[420px]:inline">Stop</span>
        </button>

        <div className="mx-0.5 h-4 w-px bg-white/10" aria-hidden="true" />

        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={!hasDownloadableAudio || exporting}
          aria-label="Download audio"
          className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 sm:px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M8 2.5v7.5m0 0-3-3m3 3 3-3M3 13.5h10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden min-[480px]:inline">{exporting ? "Saving..." : "Download"}</span>
          {isRecording && (
            <span className="rounded-full bg-rose-400/20 px-1.5 py-0.5 text-[10px] tabular-nums text-rose-200">
              {formatDuration(recordingSeconds)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
          aria-label="Toggle controls"
          className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 sm:px-3.5 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" strokeLinecap="round" />
            <circle cx="5.5" cy="4.5" r="1.2" fill="currentColor" />
            <circle cx="10.5" cy="8" r="1.2" fill="currentColor" />
            <circle cx="6.5" cy="11.5" r="1.2" fill="currentColor" />
          </svg>
          <span className="hidden min-[420px]:inline">Controls</span>
        </button>
      </nav>
    </div>
  );
}

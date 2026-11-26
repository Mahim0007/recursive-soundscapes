import { DEFAULT_PARAMS, type RecursionParams } from "../recursion.ts";

interface ControlPanelProps {
  params: RecursionParams;
  onChange: (next: RecursionParams) => void;
  branchCount: number;
  isOpen: boolean;
  onClose: () => void;
}

interface SliderConfig {
  key: keyof RecursionParams;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

export function ControlPanel({
  params,
  onChange,
  branchCount,
  isOpen,
  onClose,
}: ControlPanelProps) {
  if (!isOpen) return null;

  const sliders: SliderConfig[] = [
    {
      key: "depth",
      label: "Recursion Depth",
      min: 3,
      max: 8,
      step: 1,
      format: (v) => `${v} levels · ${branchCount} branches`,
    },
    {
      key: "angle",
      label: "Branching Angle",
      min: 12,
      max: 65,
      step: 1,
      format: (v) => `${v}°`,
    },
    {
      key: "scale",
      label: "Branch Scale",
      min: 0.58,
      max: 0.82,
      step: 0.01,
      format: (v) => v.toFixed(2),
    },
    {
      key: "asymmetry",
      label: "Sway / Asymmetry",
      min: -20,
      max: 20,
      step: 1,
      format: (v) => `${v > 0 ? `+${v}` : v}°`,
    },
    {
      key: "tempo",
      label: "Tempo",
      min: 30,
      max: 100,
      step: 1,
      format: (v) => `${v} BPM`,
    },
    {
      key: "volume",
      label: "Volume",
      min: 0,
      max: 1,
      step: 0.01,
      format: (v) => `${Math.round(v * 100)}%`,
    },
  ];

  const updateParam = (key: keyof RecursionParams, value: number) => {
    onChange({ ...params, [key]: value });
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-20 bg-slate-950/45 md:hidden"
      />
      <aside
        aria-label="Recursion and sound parameters"
        className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 max-h-[65dvh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/85 p-4 sm:p-5 text-slate-100 shadow-2xl backdrop-blur-md md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:w-[21rem] md:max-h-[calc(100dvh-7.5rem)] md:bg-slate-950/70 md:backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium tracking-wide text-slate-100">Shape &amp; Sound</h2>
            <p className="text-xs text-slate-400">Adjustments shape the next iteration</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide controls"
            className="flex min-h-9 min-w-9 items-center justify-center rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-3.5">
          {sliders.map((item) => {
            const id = `param-${item.key}`;
            const value = params[item.key];
            const formatted = item.format(value);
            return (
              <div key={item.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <label htmlFor={id} className="font-medium text-slate-200">
                    {item.label}
                  </label>
                  <span className="tabular-nums text-teal-200/90">{formatted}</span>
                </div>
                <input
                  id={id}
                  type="range"
                  min={item.min}
                  max={item.max}
                  step={item.step}
                  value={value}
                  aria-valuetext={formatted}
                  onChange={(e) => updateParam(item.key, Number(e.target.value))}
                  className="ambient-slider w-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300"
                />
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-300">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Sound Mapping
          </p>
          <ul className="space-y-1 text-slate-300/90">
            <li className="flex justify-between gap-2">
              <span className="text-slate-400">Depth</span>
              <span>Pitch &amp; Octave</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-slate-400">Spread</span>
              <span>Stereo Pan &amp; Space</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-slate-400">Leaves</span>
              <span>Soft Chime &amp; Pad</span>
            </li>
          </ul>
        </div>

        <button
          type="button"
          onClick={() => onChange(DEFAULT_PARAMS)}
          className="mt-4 min-h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
        >
          Reset Defaults
        </button>
      </aside>
    </>
  );
}

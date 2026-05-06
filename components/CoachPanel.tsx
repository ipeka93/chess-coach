'use client';

import type { MoveAnalysis, MoveRating } from '../types/chess';

const RATING_CONFIG: Record<
  MoveRating,
  { label: string; bg: string; text: string; border: string }
> = {
  Best: {
    label: 'Best',
    bg: 'bg-emerald-900/40',
    text: 'text-emerald-400',
    border: 'border-emerald-500',
  },
  Good: {
    label: 'Good',
    bg: 'bg-teal-900/40',
    text: 'text-teal-400',
    border: 'border-teal-500',
  },
  Inaccuracy: {
    label: 'Inaccuracy',
    bg: 'bg-amber-900/40',
    text: 'text-amber-400',
    border: 'border-amber-500',
  },
  Mistake: {
    label: 'Mistake',
    bg: 'bg-orange-900/40',
    text: 'text-orange-400',
    border: 'border-orange-500',
  },
  Blunder: {
    label: 'Blunder',
    bg: 'bg-red-900/40',
    text: 'text-red-400',
    border: 'border-red-500',
  },
};

interface CoachPanelProps {
  analysis: MoveAnalysis | null;
  isAnalyzing: boolean;
}

interface FieldProps {
  label: string;
  value: string;
}

function Field({ label, value }: FieldProps) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">
        {label}
      </p>
      <p className="text-slate-200 leading-relaxed text-sm">{value}</p>
    </div>
  );
}

export default function CoachPanel({ analysis, isAnalyzing }: CoachPanelProps) {
  if (isAnalyzing) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center gap-3 text-slate-300">
          <div className="h-4 w-4 rounded-full border-2 border-slate-400 border-t-white animate-spin" />
          <span className="text-sm">Analyzing your move…</span>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <p className="text-slate-400 text-sm text-center py-4">
          Make a move to get coaching feedback.
        </p>
      </div>
    );
  }

  const config = RATING_CONFIG[analysis.rating];

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-5`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-bold text-white">Move Review</h2>
        <span
          className={`text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full border ${config.border} ${config.text}`}
        >
          {config.label}
        </span>
      </div>

      {/* Move played */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-slate-900/60 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-400 mb-1">Move Played</p>
          <p className="font-mono text-lg font-bold text-white">{analysis.movePlayed}</p>
        </div>
        <div className="bg-slate-900/60 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-400 mb-1">Best Move</p>
          <p className="font-mono text-lg font-bold text-emerald-400">{analysis.bestMove || '—'}</p>
        </div>
      </div>

      <Field label="Why" value={analysis.why} />
      <Field label="What your move allows or misses" value={analysis.whatAllows} />
      <Field label="Beginner principle" value={analysis.beginnerPrinciple} />

      <div className="mt-1 pt-4 border-t border-slate-700/60">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">
          Next plan
        </p>
        <p className="text-slate-200 leading-relaxed text-sm">{analysis.nextPlan}</p>
      </div>
    </div>
  );
}

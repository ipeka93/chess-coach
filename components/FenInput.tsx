'use client';

import { useState } from 'react';
import { validateFen } from 'chess.js';

interface FenInputProps {
  fen: string;
  onLoad: (fen: string) => void;
}

export default function FenInput({ fen, onLoad }: FenInputProps) {
  const [inputFen, setInputFen] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(fen).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleLoad() {
    setError('');
    const trimmed = inputFen.trim();
    if (!trimmed) {
      setError('Please enter a FEN string.');
      return;
    }
    const result = validateFen(trimmed);
    if (!result.ok) {
      setError(result.error ?? 'Invalid FEN.');
      return;
    }
    onLoad(trimmed);
    setInputFen('');
  }

  return (
    <div className="mt-4 space-y-2">
      {/* Current FEN display */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 overflow-hidden">
          <p className="text-xs text-slate-400 mb-0.5">Current FEN</p>
          <p className="font-mono text-xs text-slate-300 truncate">{fen}</p>
        </div>
        <button
          onClick={handleCopy}
          className="flex-none px-3 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* FEN input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={inputFen}
          onChange={(e) => {
            setInputFen(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
          placeholder="Paste a FEN to load a position…"
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500"
        />
        <button
          onClick={handleLoad}
          className="flex-none px-3 py-2 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
        >
          Load
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

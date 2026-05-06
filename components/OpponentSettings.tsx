'use client';

import type { OpponentMode, PlayerColor, BotDifficulty } from '../types/chess';

interface OpponentSettingsProps {
  opponentMode: OpponentMode;
  playerColor: PlayerColor;
  difficulty: BotDifficulty;
  onOpponentModeChange: (m: OpponentMode) => void;
  onPlayerColorChange: (c: PlayerColor) => void;
  onDifficultyChange: (d: BotDifficulty) => void;
  onNewGame: () => void;
}

function SegmentGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1.5">{label}</p>
      <div className="flex rounded-lg overflow-hidden border border-slate-600">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={[
              'flex-1 py-1.5 text-xs font-medium transition-colors',
              i > 0 ? 'border-l border-slate-600' : '',
              value === opt.value
                ? 'bg-slate-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OpponentSettings({
  opponentMode,
  playerColor,
  difficulty,
  onOpponentModeChange,
  onPlayerColorChange,
  onDifficultyChange,
  onNewGame,
}: OpponentSettingsProps) {
  const isBotMode = opponentMode !== 'human';
  const isStockfishMode = opponentMode === 'stockfish';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
        Game Settings
      </h2>

      <SegmentGroup<OpponentMode>
        label="Opponent"
        options={[
          { value: 'human', label: 'Human' },
          { value: 'random', label: 'Random Bot' },
          { value: 'stockfish', label: 'Stockfish' },
        ]}
        value={opponentMode}
        onChange={onOpponentModeChange}
      />

      {isBotMode && (
        <SegmentGroup<PlayerColor>
          label="Play as"
          options={[
            { value: 'white', label: 'White' },
            { value: 'black', label: 'Black' },
          ]}
          value={playerColor}
          onChange={onPlayerColorChange}
        />
      )}

      {isStockfishMode && (
        <SegmentGroup<BotDifficulty>
          label="Bot Difficulty"
          options={[
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
          value={difficulty}
          onChange={onDifficultyChange}
        />
      )}

      <button
        onClick={onNewGame}
        className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
      >
        New Game
      </button>
    </div>
  );
}

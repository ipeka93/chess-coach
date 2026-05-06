'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { OpponentMode, PlayerColor, BotDifficulty } from '../types/chess';

// ── Edit option descriptions here ────────────────────────────────────────────
const OPPONENT_OPTIONS: { value: OpponentMode; label: string; description: string }[] = [
  { value: 'human',     label: 'Human vs Human', description: 'You control both sides — great for practice or playing with a friend.' },
  { value: 'random',    label: 'Random Bot',      description: 'Plays random legal moves. Easy to beat, good for absolute beginners.' },
  { value: 'stockfish', label: 'Stockfish Bot',   description: 'Plays strong engine moves. Choose a difficulty level below.' },
];

const COLOR_OPTIONS: { value: PlayerColor; label: string; description: string }[] = [
  { value: 'white', label: 'White', description: 'You move first.' },
  { value: 'black', label: 'Black', description: 'Bot moves first.' },
];

const DIFFICULTY_OPTIONS: { value: BotDifficulty; label: string; description: string }[] = [
  { value: 'easy',   label: 'Easy',   description: 'Random moves — same as Random Bot.' },
  { value: 'medium', label: 'Medium', description: 'Good moves, but not always the best.' },
  { value: 'hard',   label: 'Hard',   description: 'Always plays the strongest possible move.' },
];
// ─────────────────────────────────────────────────────────────────────────────

interface OpponentSettingsProps {
  opponentMode: OpponentMode;
  playerColor: PlayerColor;
  difficulty: BotDifficulty;
  onOpponentModeChange: (m: OpponentMode) => void;
  onPlayerColorChange:  (c: PlayerColor)  => void;
  onDifficultyChange:   (d: BotDifficulty) => void;
  onNewGame: () => void;
}

function RadioCard<T extends string>({
  option,
  isSelected,
  onSelect,
}: {
  option: { value: T; label: string; description: string };
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={[
        'w-full text-left px-4 py-3 rounded-lg border transition-colors',
        isSelected
          ? 'border-indigo-500 bg-indigo-900/30'
          : 'border-slate-600 bg-slate-900/40 hover:border-slate-500',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5">
        <div className={[
          'w-3.5 h-3.5 rounded-full border-2 flex-none transition-colors',
          isSelected ? 'border-indigo-400 bg-indigo-400' : 'border-slate-500',
        ].join(' ')} />
        <span className={['text-sm font-medium', isSelected ? 'text-white' : 'text-slate-300'].join(' ')}>
          {option.label}
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-1 ml-6">{option.description}</p>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">{children}</p>
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
  const [isOpen, setIsOpen] = useState(false);

  // Draft state — only applied when user clicks New Game
  const [draftMode,  setDraftMode]  = useState<OpponentMode>(opponentMode);
  const [draftColor, setDraftColor] = useState<PlayerColor>(playerColor);
  const [draftDiff,  setDraftDiff]  = useState<BotDifficulty>(difficulty);

  function openModal() {
    setDraftMode(opponentMode);
    setDraftColor(playerColor);
    setDraftDiff(difficulty);
    setIsOpen(true);
  }

  function handleNewGame() {
    onOpponentModeChange(draftMode);
    onPlayerColorChange(draftColor);
    onDifficultyChange(draftDiff);
    setIsOpen(false);
    onNewGame();
  }

  const isBotMode       = draftMode !== 'human';
  const isStockfishMode = draftMode === 'stockfish';

  return (
    <>
      {/* ── Trigger button ───────────────────────────────────────────────── */}
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
      >
        <span>♟️</span>
        <span className="hidden sm:inline">Game Mode</span>
      </button>

      {/* ── Modal — portalled to document.body to escape backdrop-filter stacking context ── */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70"
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            {/* Header — always pinned */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-700 flex-none">
              <h2 className="text-base font-bold text-white">Game Mode</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center"
              >
                ×
              </button>
            </div>

            {/* Scrollable options */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Opponent Mode */}
              <div>
                <SectionLabel>Opponent</SectionLabel>
                <div className="space-y-2">
                  {OPPONENT_OPTIONS.map((opt) => (
                    <RadioCard
                      key={opt.value}
                      option={opt}
                      isSelected={draftMode === opt.value}
                      onSelect={() => setDraftMode(opt.value)}
                    />
                  ))}
                </div>
              </div>

              {/* Player Color — only when a bot is selected */}
              {isBotMode && (
                <div>
                  <SectionLabel>Play as</SectionLabel>
                  <div className="space-y-2">
                    {COLOR_OPTIONS.map((opt) => (
                      <RadioCard
                        key={opt.value}
                        option={opt}
                        isSelected={draftColor === opt.value}
                        onSelect={() => setDraftColor(opt.value)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Difficulty — only for Stockfish */}
              {isStockfishMode && (
                <div>
                  <SectionLabel>Bot Difficulty</SectionLabel>
                  <div className="space-y-2">
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <RadioCard
                        key={opt.value}
                        option={opt}
                        isSelected={draftDiff === opt.value}
                        onSelect={() => setDraftDiff(opt.value)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer — always pinned */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700 flex-none">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 py-2.5 text-sm font-medium bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleNewGame}
                className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors text-white"
              >
                New Game
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

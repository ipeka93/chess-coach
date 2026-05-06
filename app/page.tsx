'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Chess } from 'chess.js';
import { StockfishEngine } from '../engine/stockfish';
import { getBotMoveLAN } from '../engine/bot';
import { classifyMove, computeScoreLoss, lanToSAN } from '../lib/evaluation';
import { generateExplanation } from '../lib/chessCoach';
import ChessBoardComponent from '../components/ChessBoard';
import CoachPanel from '../components/CoachPanel';
import FenInput from '../components/FenInput';
import OpponentSettings from '../components/OpponentSettings';
import type { EngineResult, MoveAnalysis, OpponentMode, PlayerColor, BotDifficulty } from '../types/chess';

interface EvalSnapshot {
  result: EngineResult;
  fen: string;
}

export default function Home() {
  const engineRef = useRef<StockfishEngine | null>(null);
  const gameRef = useRef(new Chess());

  const [fen, setFen] = useState(gameRef.current.fen());
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [prevEval, setPrevEval] = useState<EvalSnapshot | null>(null);
  const [analysis, setAnalysis] = useState<MoveAnalysis | null>(null);
  const [bestMoveLAN, setBestMoveLAN] = useState('');
  const [bestMoveSAN, setBestMoveSAN] = useState('');

  // Opponent settings state
  const [opponentMode, setOpponentMode] = useState<OpponentMode>('human');
  const [playerColor, setPlayerColor] = useState<PlayerColor>('white');
  const [difficulty, setDifficulty] = useState<BotDifficulty>('medium');

  // Refs that mirror async-sensitive state/settings for stale-closure safety
  const prevEvalRef = useRef<EvalSnapshot | null>(null);
  const opponentModeRef = useRef<OpponentMode>('human');
  const playerColorRef = useRef<PlayerColor>('white');
  const difficultyRef = useRef<BotDifficulty>('medium');
  const botTurnPendingRef = useRef(false);

  // Keep refs in sync
  const updateOpponentMode = useCallback((m: OpponentMode) => {
    setOpponentMode(m);
    opponentModeRef.current = m;
  }, []);

  const updatePlayerColor = useCallback((c: PlayerColor) => {
    setPlayerColor(c);
    playerColorRef.current = c;
  }, []);

  const updateDifficulty = useCallback((d: BotDifficulty) => {
    setDifficulty(d);
    difficultyRef.current = d;
  }, []);

  // ── Boot the engine ───────────────────────────────────────────────────────
  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;

    engine
      .init()
      .then(() => {
        setEngineReady(true);
        evaluatePosition(gameRef.current.fen());
      })
      .catch(() => setEngineError(true));

    return () => {
      engine.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Evaluate a position and store snapshot ────────────────────────────────
  async function evaluatePosition(positionFen: string) {
    const engine = engineRef.current;
    if (!engine) return;

    setIsAnalyzing(true);
    try {
      const result = await engine.evaluate(positionFen);
      const snapshot = { result, fen: positionFen };
      setPrevEval(snapshot);
      prevEvalRef.current = snapshot;
      setBestMoveLAN(result.bestMove);
      setBestMoveSAN(lanToSAN(positionFen, result.bestMove));
    } catch {
      // engine may have been terminated on cleanup
    } finally {
      setIsAnalyzing(false);
    }
  }

  // ── Trigger bot move if it's the bot's turn ───────────────────────────────
  async function maybeTriggerBotMove(currentFen: string) {
    const engine = engineRef.current;
    if (!engine) return;

    const mode = opponentModeRef.current;
    if (mode === 'human') return;

    const game = gameRef.current;
    if (game.isGameOver()) return;

    const turn = game.turn(); // 'w' or 'b'
    const userIsWhite = playerColorRef.current === 'white';
    const botColor = userIsWhite ? 'b' : 'w';
    if (turn !== botColor) return;

    // Prevent double-triggering
    if (botTurnPendingRef.current) return;
    botTurnPendingRef.current = true;

    setIsBotThinking(true);
    setBestMoveLAN('');
    setBestMoveSAN('');

    try {
      await new Promise((r) => setTimeout(r, 500));

      const moveLAN = await getBotMoveLAN(currentFen, mode, difficultyRef.current, engine);
      if (!moveLAN) return;

      const from = moveLAN.slice(0, 2);
      const to = moveLAN.slice(2, 4);
      const promotion = moveLAN.length > 4 ? moveLAN[4] : 'q';

      const clone = new Chess(currentFen);
      let moveResult;
      try {
        moveResult = clone.move({ from, to, promotion });
      } catch {
        return;
      }

      const afterFen = clone.fen();
      gameRef.current = clone;
      setFen(afterFen);

      // Evaluate new position (for best-move hint and prevEval), no coaching
      setIsAnalyzing(true);
      try {
        const newEval = await engine.evaluate(afterFen);
        const snapshot = { result: newEval, fen: afterFen };
        setPrevEval(snapshot);
        prevEvalRef.current = snapshot;
        setBestMoveLAN(newEval.bestMove);
        setBestMoveSAN(lanToSAN(afterFen, newEval.bestMove));
      } catch {
        // ignore
      } finally {
        setIsAnalyzing(false);
      }
    } finally {
      setIsBotThinking(false);
      botTurnPendingRef.current = false;
    }
  }

  // ── Async analysis after a user move, then maybe bot ─────────────────────
  async function runAnalysisAndMaybeBotMove(
    beforeFen: string,
    afterFen: string,
    moveSAN: string,
    isWhite: boolean,
    snapshot: EvalSnapshot | null,
  ) {
    const engine = engineRef.current;
    if (!engine) return;

    setIsAnalyzing(true);
    try {
      const newEval = await engine.evaluate(afterFen);

      if (snapshot) {
        const scoreLoss = computeScoreLoss(snapshot.result.scoreCP, newEval.scoreCP, isWhite);
        const rating = classifyMove(scoreLoss);
        const bestSAN = lanToSAN(beforeFen, snapshot.result.bestMove);

        setAnalysis(
          generateExplanation(
            moveSAN,
            bestSAN || moveSAN,
            rating,
            beforeFen,
            afterFen,
          ),
        );
      }

      const snap = { result: newEval, fen: afterFen };
      setPrevEval(snap);
      prevEvalRef.current = snap;
      setBestMoveLAN(newEval.bestMove);
      setBestMoveSAN(lanToSAN(afterFen, newEval.bestMove));
    } catch {
      // engine may have been terminated on cleanup
    } finally {
      setIsAnalyzing(false);
    }

    // After coaching, trigger bot move if applicable
    await maybeTriggerBotMove(gameRef.current.fen());
  }

  // ── Handle a move from the board ──────────────────────────────────────────
  const handleMove = useCallback(
    (from: string, to: string, promotion = 'q'): boolean => {
      // Don't accept moves while bot is thinking or board is otherwise locked
      if (isBotThinking) return false;

      const game = gameRef.current;

      // In bot mode, only allow user's color to move
      if (opponentModeRef.current !== 'human') {
        const turn = game.turn();
        const userIsWhite = playerColorRef.current === 'white';
        const userColor = userIsWhite ? 'w' : 'b';
        if (turn !== userColor) return false;
      }

      const clone = new Chess(game.fen());
      let moveResult;
      try {
        moveResult = clone.move({ from, to, promotion });
      } catch {
        return false;
      }

      const beforeFen = game.fen();
      const afterFen = clone.fen();

      gameRef.current = clone;
      setFen(afterFen);
      setAnalysis(null);
      setBestMoveLAN('');
      setBestMoveSAN('');

      runAnalysisAndMaybeBotMove(
        beforeFen,
        afterFen,
        moveResult.san,
        moveResult.color === 'w',
        prevEvalRef.current,
      );

      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isBotThinking],
  );

  // ── New Game (respects current settings) ─────────────────────────────────
  const handleNewGame = useCallback(async () => {
    botTurnPendingRef.current = false;
    const newGame = new Chess();
    gameRef.current = newGame;
    const initialFen = newGame.fen();
    setFen(initialFen);
    setAnalysis(null);
    setPrevEval(null);
    prevEvalRef.current = null;
    setBestMoveLAN('');
    setBestMoveSAN('');
    setIsBotThinking(false);

    // Flip board to match player color
    const color = playerColorRef.current;
    setOrientation(color);

    if (engineRef.current) {
      await evaluatePosition(initialFen);
    }

    // If player chose black, bot (white) moves first
    await maybeTriggerBotMove(gameRef.current.fen());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset (legacy, keeps human vs human semantics) ─────────────────────
  const handleReset = useCallback(async () => {
    botTurnPendingRef.current = false;
    const newGame = new Chess();
    gameRef.current = newGame;
    setFen(newGame.fen());
    setAnalysis(null);
    setPrevEval(null);
    prevEvalRef.current = null;
    setBestMoveLAN('');
    setBestMoveSAN('');
    setIsBotThinking(false);
    if (engineRef.current) {
      await evaluatePosition(newGame.fen());
    }
  }, []);

  // ── Load FEN ──────────────────────────────────────────────────────────────
  const handleFenLoad = useCallback(async (newFen: string) => {
    botTurnPendingRef.current = false;
    const newGame = new Chess(newFen);
    gameRef.current = newGame;
    setFen(newFen);
    setAnalysis(null);
    setPrevEval(null);
    prevEvalRef.current = null;
    setBestMoveLAN('');
    setBestMoveSAN('');
    setIsBotThinking(false);
    if (engineRef.current) {
      await evaluatePosition(newFen);
    }
  }, []);

  // ── Flip board ────────────────────────────────────────────────────────────
  const handleFlip = useCallback(() => {
    setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  }, []);

  const boardDisabled = isBotThinking || isAnalyzing;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700/60 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Chess Coach</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Beginner-friendly coaching after every move
            </p>
          </div>
          {engineError && (
            <p className="text-red-400 text-xs bg-red-900/30 border border-red-700 rounded-lg px-3 py-1">
              Engine failed to load
            </p>
          )}
          {!engineReady && !engineError && (
            <p className="text-slate-400 text-xs animate-pulse">Loading engine…</p>
          )}
          {engineReady && !isBotThinking && (
            <p className="text-emerald-400 text-xs">
              ✓ Stockfish 18 ready
            </p>
          )}
          {isBotThinking && (
            <p className="text-amber-400 text-xs animate-pulse">
              Bot is thinking…
            </p>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
        {/* ── Left: board + controls ── */}
        <div className="lg:w-[480px] flex-none">
          {/* Board */}
          <div className="w-full">
            <ChessBoardComponent
              fen={fen}
              orientation={orientation}
              bestMoveLAN={bestMoveLAN}
              disabled={boardDisabled}
              onMove={handleMove}
            />
          </div>

          {/* Bot thinking overlay text */}
          {isBotThinking && (
            <div className="flex items-center gap-2 justify-center mt-2 text-amber-400 text-xs">
              <div className="h-3 w-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              Bot is thinking…
            </div>
          )}

          {/* Control buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleReset}
              className="flex-1 py-2 text-sm font-medium bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleFlip}
              className="flex-1 py-2 text-sm font-medium bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Flip Board
            </button>
          </div>

          {/* FEN */}
          <FenInput fen={fen} onLoad={handleFenLoad} />
        </div>

        {/* ── Right: coaching panels ── */}
        <div className="flex-1 space-y-4 min-w-0">
          {/* Opponent Settings */}
          <OpponentSettings
            opponentMode={opponentMode}
            playerColor={playerColor}
            difficulty={difficulty}
            onOpponentModeChange={updateOpponentMode}
            onPlayerColorChange={updatePlayerColor}
            onDifficultyChange={updateDifficulty}
            onNewGame={handleNewGame}
          />

          {/* Best Move Panel */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-3">
              Best Move (current position)
            </h2>
            {isAnalyzing && !bestMoveSAN ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="h-3 w-3 rounded-full border-2 border-slate-500 border-t-white animate-spin" />
                Calculating…
              </div>
            ) : bestMoveSAN ? (
              <div className="flex items-center gap-4">
                <span className="font-mono text-3xl font-bold text-emerald-400">
                  {bestMoveSAN}
                </span>
                <span className="text-slate-400 text-xs">
                  shown as a green arrow on the board
                </span>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">
                {engineReady ? 'No best move available' : 'Waiting for engine…'}
              </p>
            )}
          </div>

          {/* Move Review Panel */}
          <CoachPanel analysis={analysis} isAnalyzing={isAnalyzing && !bestMoveSAN} />

          {/* How to use note */}
          {!analysis && !isAnalyzing && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">How to use</h3>
              <ul className="text-slate-400 text-xs space-y-1.5">
                <li>• Click a piece, then click where to move it — or drag and drop</li>
                <li>• After each move you&apos;ll see coaching feedback on the right</li>
                <li>• The green arrow shows you the best move in the position</li>
                <li>• Choose an opponent above and press <strong className="text-slate-300">New Game</strong> to play against the bot</li>
                <li>• Use <strong className="text-slate-300">Reset</strong> to start over, <strong className="text-slate-300">Flip Board</strong> to switch sides</li>
                <li>• Paste a FEN string below the board to load any position</li>
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

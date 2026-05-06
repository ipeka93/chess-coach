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
  const gameRef   = useRef(new Chess());

  const [fen,          setFen]          = useState(gameRef.current.fen());
  const [orientation,  setOrientation]  = useState<'white' | 'black'>('white');
  const [engineReady,  setEngineReady]  = useState(false);
  const [engineError,  setEngineError]  = useState(false);
  const [isAnalyzing,  setIsAnalyzing]  = useState(false);
  const [isBotThinking,setIsBotThinking]= useState(false);
  const [prevEval,     setPrevEval]     = useState<EvalSnapshot | null>(null);
  const [analysis,     setAnalysis]     = useState<MoveAnalysis | null>(null);
  const [bestMoveLAN,  setBestMoveLAN]  = useState('');
  const [bestMoveSAN,  setBestMoveSAN]  = useState('');

  const [opponentMode, setOpponentMode] = useState<OpponentMode>('human');
  const [playerColor,  setPlayerColor]  = useState<PlayerColor>('white');
  const [difficulty,   setDifficulty]   = useState<BotDifficulty>('medium');

  const prevEvalRef      = useRef<EvalSnapshot | null>(null);
  const opponentModeRef  = useRef<OpponentMode>('human');
  const playerColorRef   = useRef<PlayerColor>('white');
  const difficultyRef    = useRef<BotDifficulty>('medium');
  const botTurnPendingRef= useRef(false);

  const updateOpponentMode = useCallback((m: OpponentMode) => {
    setOpponentMode(m); opponentModeRef.current = m;
  }, []);
  const updatePlayerColor = useCallback((c: PlayerColor) => {
    setPlayerColor(c); playerColorRef.current = c;
  }, []);
  const updateDifficulty = useCallback((d: BotDifficulty) => {
    setDifficulty(d); difficultyRef.current = d;
  }, []);

  // ── Boot engine ───────────────────────────────────────────────────────────
  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    engine.init()
      .then(() => { setEngineReady(true); evaluatePosition(gameRef.current.fen()); })
      .catch(() => setEngineError(true));
    return () => engine.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Evaluate position → update prevEval + bestMove hint ──────────────────
  async function evaluatePosition(positionFen: string) {
    const engine = engineRef.current;
    if (!engine) return;
    setIsAnalyzing(true);
    try {
      const result = await engine.evaluate(positionFen);
      const snap = { result, fen: positionFen };
      setPrevEval(snap); prevEvalRef.current = snap;
      setBestMoveLAN(result.bestMove);
      setBestMoveSAN(lanToSAN(positionFen, result.bestMove));
    } catch { /* terminated on cleanup */ }
    finally   { setIsAnalyzing(false); }
  }

  // ── Maybe trigger bot move ────────────────────────────────────────────────
  async function maybeTriggerBotMove(currentFen: string) {
    const engine = engineRef.current;
    if (!engine) return;
    if (opponentModeRef.current === 'human') return;
    const game = gameRef.current;
    if (game.isGameOver()) return;
    const botColor = playerColorRef.current === 'white' ? 'b' : 'w';
    if (game.turn() !== botColor) return;
    if (botTurnPendingRef.current) return;
    botTurnPendingRef.current = true;
    setIsBotThinking(true);
    setBestMoveLAN(''); setBestMoveSAN('');
    try {
      await new Promise((r) => setTimeout(r, 500));
      const moveLAN = await getBotMoveLAN(currentFen, opponentModeRef.current, difficultyRef.current, engine);
      if (!moveLAN) return;
      const clone = new Chess(currentFen);
      try { clone.move({ from: moveLAN.slice(0,2), to: moveLAN.slice(2,4), promotion: moveLAN[4] ?? 'q' }); }
      catch { return; }
      gameRef.current = clone;
      setFen(clone.fen());
      setIsAnalyzing(true);
      try {
        const newEval = await engine.evaluate(clone.fen());
        const snap = { result: newEval, fen: clone.fen() };
        setPrevEval(snap); prevEvalRef.current = snap;
        setBestMoveLAN(newEval.bestMove);
        setBestMoveSAN(lanToSAN(clone.fen(), newEval.bestMove));
      } catch { /* ignore */ }
      finally { setIsAnalyzing(false); }
    } finally { setIsBotThinking(false); botTurnPendingRef.current = false; }
  }

  // ── Analyze user's move, then maybe trigger bot ───────────────────────────
  async function runAnalysisAndMaybeBotMove(
    beforeFen: string, afterFen: string,
    moveSAN: string, isWhite: boolean,
    snapshot: EvalSnapshot | null,
  ) {
    const engine = engineRef.current;
    if (!engine) return;
    setIsAnalyzing(true);
    try {
      const newEval = await engine.evaluate(afterFen);
      if (snapshot) {
        const scoreLoss = computeScoreLoss(snapshot.result.scoreCP, newEval.scoreCP, isWhite);
        setAnalysis(generateExplanation(
          moveSAN,
          lanToSAN(beforeFen, snapshot.result.bestMove) || moveSAN,
          classifyMove(scoreLoss),
          beforeFen, afterFen,
        ));
      }
      const snap = { result: newEval, fen: afterFen };
      setPrevEval(snap); prevEvalRef.current = snap;
      setBestMoveLAN(newEval.bestMove);
      setBestMoveSAN(lanToSAN(afterFen, newEval.bestMove));
    } catch { /* terminated */ }
    finally   { setIsAnalyzing(false); }
    await maybeTriggerBotMove(gameRef.current.fen());
  }

  // ── Board move handler ────────────────────────────────────────────────────
  const handleMove = useCallback(
    (from: string, to: string, promotion = 'q'): boolean => {
      if (isBotThinking) return false;
      if (opponentModeRef.current !== 'human') {
        const userColor = playerColorRef.current === 'white' ? 'w' : 'b';
        if (gameRef.current.turn() !== userColor) return false;
      }
      const clone = new Chess(gameRef.current.fen());
      let moveResult;
      try { moveResult = clone.move({ from, to, promotion }); }
      catch { return false; }
      const beforeFen = gameRef.current.fen();
      gameRef.current = clone;
      setFen(clone.fen());
      setAnalysis(null); setBestMoveLAN(''); setBestMoveSAN('');
      runAnalysisAndMaybeBotMove(beforeFen, clone.fen(), moveResult.san, moveResult.color === 'w', prevEvalRef.current);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isBotThinking],
  );

  // ── New Game ──────────────────────────────────────────────────────────────
  const handleNewGame = useCallback(async () => {
    botTurnPendingRef.current = false;
    const newGame = new Chess();
    gameRef.current = newGame;
    setFen(newGame.fen()); setAnalysis(null);
    setPrevEval(null); prevEvalRef.current = null;
    setBestMoveLAN(''); setBestMoveSAN('');
    setIsBotThinking(false);
    setOrientation(playerColorRef.current);
    if (engineRef.current) await evaluatePosition(newGame.fen());
    await maybeTriggerBotMove(gameRef.current.fen());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    botTurnPendingRef.current = false;
    const newGame = new Chess();
    gameRef.current = newGame;
    setFen(newGame.fen()); setAnalysis(null);
    setPrevEval(null); prevEvalRef.current = null;
    setBestMoveLAN(''); setBestMoveSAN('');
    setIsBotThinking(false);
    if (engineRef.current) await evaluatePosition(newGame.fen());
  }, []);

  // ── Load FEN ──────────────────────────────────────────────────────────────
  const handleFenLoad = useCallback(async (newFen: string) => {
    botTurnPendingRef.current = false;
    const newGame = new Chess(newFen);
    gameRef.current = newGame;
    setFen(newFen); setAnalysis(null);
    setPrevEval(null); prevEvalRef.current = null;
    setBestMoveLAN(''); setBestMoveSAN('');
    setIsBotThinking(false);
    if (engineRef.current) await evaluatePosition(newFen);
  }, []);

  const handleFlip = useCallback(() => {
    setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  }, []);

  // Only lock the board while the bot is choosing its move.
  // isAnalyzing (background evaluation) must not block the user —
  // on mobile the WASM load can take several seconds and the board would be unusable.
  const boardDisabled = isBotThinking;

  return (
    <div className="min-h-screen bg-slate-900 text-white">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-700/60 px-4 py-3 sticky top-0 z-40 bg-slate-900/95 backdrop-blur">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight leading-tight">Chess Coach</h1>
            <p className="text-slate-400 text-xs hidden sm:block">Beginner coaching after every move</p>
          </div>

          <div className="flex items-center gap-2 flex-none">
            {/* Engine / bot status */}
            {engineError && (
              <span className="text-red-400 text-xs">Engine error</span>
            )}
            {!engineReady && !engineError && (
              <span className="text-slate-400 text-xs animate-pulse">Loading…</span>
            )}
            {engineReady && !isBotThinking && (
              <span className="text-emerald-400 text-xs hidden md:inline">✓ Stockfish 18</span>
            )}
            {isBotThinking && (
              <span className="text-amber-400 text-xs animate-pulse flex items-center gap-1">
                <span className="h-2 w-2 rounded-full border border-amber-400 border-t-transparent animate-spin inline-block" />
                Bot thinking…
              </span>
            )}

            {/* ⚙️ Settings button — opens modal */}
            <OpponentSettings
              opponentMode={opponentMode}
              playerColor={playerColor}
              difficulty={difficulty}
              onOpponentModeChange={updateOpponentMode}
              onPlayerColorChange={updatePlayerColor}
              onDifficultyChange={updateDifficulty}
              onNewGame={handleNewGame}
            />
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4">

          {/* ── Left: board + controls ──────────────────────────────────── */}
          <div className="lg:w-[440px] xl:w-[480px] flex-none">
            <ChessBoardComponent
              fen={fen}
              orientation={orientation}
              bestMoveLAN={bestMoveLAN}
              disabled={boardDisabled}
              onMove={handleMove}
            />

            {isBotThinking && (
              <p className="text-center text-amber-400 text-xs mt-2 animate-pulse">
                Bot is thinking…
              </p>
            )}

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
          </div>

          {/* ── Right: Best Move → coaching ─────────────────────────────── */}
          <div className="flex-1 space-y-3 min-w-0">

            {/* Best Move — always first */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                Best Move
              </p>
              {isAnalyzing && !bestMoveSAN ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-1">
                  <div className="h-3 w-3 rounded-full border-2 border-slate-500 border-t-white animate-spin flex-none" />
                  Calculating…
                </div>
              ) : bestMoveSAN ? (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-3xl font-bold text-emerald-400">{bestMoveSAN}</span>
                  <span className="text-slate-400 text-xs">shown as a green arrow on the board</span>
                </div>
              ) : (
                <p className="text-slate-500 text-sm py-1">
                  {engineReady ? 'No best move available' : 'Waiting for engine…'}
                </p>
              )}
            </div>

            {/* Move coaching */}
            <CoachPanel analysis={analysis} isAnalyzing={isAnalyzing && !bestMoveSAN} />

            {/* How to use — only before first move */}
            {!analysis && !isAnalyzing && (
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-slate-300 mb-2">How to use</p>
                <ul className="text-slate-400 text-xs space-y-1.5">
                  <li>• Click a piece then click where to move it — or drag and drop</li>
                  <li>• After each move you'll see coaching feedback here</li>
                  <li>• The green arrow on the board shows the best move</li>
                  <li>• Tap ♟️ <strong className="text-slate-300">Game Mode</strong> to play against a bot</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ── FEN input — advanced feature, always at bottom ──────────── */}
        <div className="mt-6 pt-4 border-t border-slate-700/50">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
            Position (FEN)
          </p>
          <FenInput fen={fen} onLoad={handleFenLoad} />
        </div>
      </main>
    </div>
  );
}

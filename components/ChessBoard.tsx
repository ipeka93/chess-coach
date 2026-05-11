'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

interface ChessBoardProps {
  fen: string;
  orientation: 'white' | 'black';
  bestMoveLAN?: string;
  disabled?: boolean;
  onMove: (from: string, to: string, promotion?: string) => boolean;
}

const HIGHLIGHT_YELLOW = { backgroundColor: 'rgba(255, 213, 0, 0.45)' };
const HIGHLIGHT_GREEN_DOT =
  'radial-gradient(circle, rgba(0,0,0,0.15) 28%, transparent 28%)';
const HIGHLIGHT_GREEN_CAP =
  'radial-gradient(circle, rgba(0,0,0,0.12) 85%, transparent 85%)';

// Steady highlight for the "from" square of the best move suggestion
const FROM_HIGHLIGHT: React.CSSProperties = { backgroundColor: 'rgba(0,200,80,0.55)' };
// Active highlight for the travelling pulse along the path
const PATH_HIGHLIGHT: React.CSSProperties = { backgroundColor: 'rgba(0,200,80,0.70)' };

/**
 * Returns the ordered list of squares from `fromSq` (exclusive) to `toSq` (inclusive)
 * that the piece would physically travel through.
 *
 * Knight: 3 squares — elbow (one step along longer leg), corner (bend), destination.
 * Pawn: every square from one-ahead up to and including `to` (handles double push).
 * King: every square stepped through including castling transit squares.
 * Rook/Bishop/Queen: every square along the ray up to and including `to`.
 */
function computePathSquares(fromSq: string, toSq: string, chess: Chess): string[] {
  const fromFile = fromSq.charCodeAt(0) - 97;   // 0–7
  const fromRank = parseInt(fromSq[1]);           // 1–8
  const toFile   = toSq.charCodeAt(0)  - 97;
  const toRank   = parseInt(toSq[1]);

  const piece = chess.get(fromSq as Square);
  if (!piece) return [toSq];

  const df = toFile - fromFile;   // raw delta (signed)
  const dr = toRank - fromRank;

  const sf = Math.sign(df);       // step direction: -1, 0, +1
  const sr = Math.sign(dr);

  const sq = (f: number, r: number) => String.fromCharCode(97 + f) + r;

  if (piece.type === 'n') {
    if (Math.abs(dr) >= Math.abs(df)) {
      // Longer leg is vertical (2 rank steps), shorter is horizontal (1 file step)
      return [
        sq(fromFile,          fromRank + sr),      // 1 step along long leg
        sq(fromFile,          fromRank + 2 * sr),  // 2 steps along long leg (the bend)
        toSq,                                       // destination (1 step sideways)
      ];
    } else {
      // Longer leg is horizontal (2 file steps), shorter is vertical (1 rank step)
      return [
        sq(fromFile + sf,     fromRank),            // 1 step along long leg
        sq(fromFile + 2 * sf, fromRank),            // 2 steps along long leg (the bend)
        toSq,                                       // destination (1 step up/down)
      ];
    }
  }

  if (piece.type === 'p') {
    // Diagonal capture: the piece jumps one square diagonally — no squares in between.
    if (df !== 0) return [toSq];
    // Straight push: walk every rank from one-ahead up to (and including) `to`.
    const path: string[] = [];
    for (let r = fromRank + sr; r !== toRank + sr; r += sr) {
      path.push(sq(fromFile, r));
    }
    return path;
  }

  if (piece.type === 'k') {
    // King moves at most 2 squares (castling). Step through each square.
    const steps = Math.max(Math.abs(df), Math.abs(dr));
    const path: string[] = [];
    for (let i = 1; i <= steps; i++) {
      path.push(sq(fromFile + i * sf, fromRank + i * sr));
    }
    return path;
  }

  // Rook, bishop, queen — walk the ray from `from` (exclusive) to `to` (inclusive).
  const path: string[] = [];
  let f = fromFile + sf;
  let r = fromRank + sr;
  while (f !== toFile || r !== toRank) {
    path.push(sq(f, r));
    f += sf;
    r += sr;
    if (path.length > 8) break; // safety guard
  }
  path.push(toSq);
  return path;
}

export default function ChessBoardComponent({
  fen,
  orientation,
  bestMoveLAN,
  disabled = false,
  onMove,
}: ChessBoardProps) {
  const [selectedSq,   setSelectedSq]   = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, React.CSSProperties>>({});
  // Currently lit path square for the travelling-pulse animation (null = none)
  const [animSq, setAnimSq] = useState<string | null>(null);

  const chess = useMemo(() => new Chess(fen), [fen]);

  // Ordered path squares (from-exclusive, to-inclusive) for the current best move
  const pathSquares = useMemo(() => {
    if (!bestMoveLAN || bestMoveLAN.length < 4) return [];
    return computePathSquares(bestMoveLAN.slice(0, 2), bestMoveLAN.slice(2, 4), chess);
  }, [bestMoveLAN, chess]);

  // Travelling-pulse animation: light up each path square briefly, one at a time, looping.
  // The "from" square is steady (handled in combinedStyles) and never included here.
  useEffect(() => {
    setAnimSq(null);
    if (pathSquares.length === 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    function runCycle() {
      if (cancelled) return;
      setAnimSq(null);

      pathSquares.forEach((sq, i) => {
        // Show this square
        timers.push(setTimeout(() => {
          if (!cancelled) setAnimSq(sq);
        }, i * 240));
        // Hide this square after 180 ms
        timers.push(setTimeout(() => {
          if (!cancelled) setAnimSq(null);
        }, i * 240 + 180));
      });

      // After the last square fades, wait 400 ms then restart
      const cycleEnd = (pathSquares.length - 1) * 240 + 180;
      timers.push(setTimeout(() => {
        if (!cancelled) runCycle();
      }, cycleEnd + 400));
    }

    runCycle();

    return () => {
      cancelled = true;
      timers.forEach(t => clearTimeout(t));
      setAnimSq(null);
    };
  }, [pathSquares]);

  // Merge best-move highlights with selection styles.
  // The "from" square is always steady-green when bestMoveLAN is set.
  // The animated path square overlays on top of the steady "from" colour.
  // Selection styles (squareStyles) overlay everything — so picking a piece feels natural.
  const combinedStyles = useMemo(() => {
    const result: Record<string, React.CSSProperties> = {};

    if (bestMoveLAN && bestMoveLAN.length >= 4) {
      result[bestMoveLAN.slice(0, 2)] = FROM_HIGHLIGHT;
    }
    if (animSq) {
      result[animSq] = PATH_HIGHLIGHT;
    }

    return { ...result, ...squareStyles };
  }, [bestMoveLAN, animSq, squareStyles]);

  const getLegalSquares = useCallback(
    (sq: string): Record<string, React.CSSProperties> => {
      const styles: Record<string, React.CSSProperties> = {};
      styles[sq] = HIGHLIGHT_YELLOW;
      try {
        const moves = chess.moves({ verbose: true, square: sq as Square });
        for (const m of moves) {
          styles[m.to] = {
            background: m.isCapture() ? HIGHLIGHT_GREEN_CAP : HIGHLIGHT_GREEN_DOT,
          };
        }
      } catch {
        // ignore invalid squares
      }
      return styles;
    },
    [chess],
  );

  const handleSquareClick = useCallback(
    ({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
      if (disabled) return;

      if (selectedSq) {
        const moved = onMove(selectedSq, square, 'q');
        if (moved) {
          setSelectedSq(null);
          setSquareStyles({});
          return;
        }
      }

      const gamePiece = chess.get(square as Square);
      if (gamePiece && gamePiece.color === chess.turn()) {
        setSelectedSq(square);
        setSquareStyles(getLegalSquares(square));
      } else {
        setSelectedSq(null);
        setSquareStyles({});
      }
    },
    [disabled, selectedSq, onMove, chess, getLegalSquares],
  );

  const handlePieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      if (disabled || !targetSquare) return false;
      const moved = onMove(sourceSquare, targetSquare, 'q');
      if (moved) {
        setSelectedSq(null);
        setSquareStyles({});
      }
      return moved;
    },
    [disabled, onMove],
  );

  return (
    <div className={disabled ? 'opacity-70 pointer-events-none' : undefined}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          squareStyles: combinedStyles,
          onSquareClick: handleSquareClick,
          onPieceDrop: handlePieceDrop,
          allowDragging: !disabled,
          allowDrawingArrows: false,
        }}
      />
    </div>
  );
}

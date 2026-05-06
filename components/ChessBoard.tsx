'use client';

import { useState, useMemo, useCallback } from 'react';
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

export default function ChessBoardComponent({
  fen,
  orientation,
  bestMoveLAN,
  disabled = false,
  onMove,
}: ChessBoardProps) {
  const [selectedSq, setSelectedSq] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, React.CSSProperties>>({});

  const chess = useMemo(() => new Chess(fen), [fen]);

  // Arrow for the best move
  const arrows = useMemo(() => {
    if (!bestMoveLAN || bestMoveLAN.length < 4) return [];
    return [
      {
        startSquare: bestMoveLAN.slice(0, 2),
        endSquare: bestMoveLAN.slice(2, 4),
        color: 'rgba(0,200,80,0.75)',
      },
    ];
  }, [bestMoveLAN]);

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

      // If a piece is already selected, try to move
      if (selectedSq) {
        const moved = onMove(selectedSq, square, 'q');
        if (moved) {
          setSelectedSq(null);
          setSquareStyles({});
          return;
        }
      }

      // Select a piece belonging to the side to move
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
          squareStyles,
          arrows,
          onSquareClick: handleSquareClick,
          onPieceDrop: handlePieceDrop,
          allowDragging: !disabled,
          allowDrawingArrows: false,
        }}
      />
    </div>
  );
}

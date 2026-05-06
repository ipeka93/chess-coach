import { Chess } from 'chess.js';
import type { MoveRating } from '../types/chess';

export function classifyMove(scoreLossCP: number): MoveRating {
  if (scoreLossCP <= 20) return 'Best';
  if (scoreLossCP <= 60) return 'Good';
  if (scoreLossCP <= 150) return 'Inaccuracy';
  if (scoreLossCP <= 300) return 'Mistake';
  return 'Blunder';
}

export function computeScoreLoss(
  evalBefore: number,
  evalAfter: number,
  isWhite: boolean,
): number {
  // White wants high scores; black wants low scores.
  // Loss = how much worse the position got for the player who moved.
  const raw = isWhite ? evalBefore - evalAfter : evalAfter - evalBefore;
  return Math.max(0, raw);
}

export function lanToSAN(fen: string, lan: string): string {
  if (!lan || lan === '(none)') return '';
  const from = lan.slice(0, 2);
  const to = lan.slice(2, 4);
  const promotion = lan.length > 4 ? lan[4] : undefined;
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from, to, promotion });
    return move.san;
  } catch {
    return lan;
  }
}

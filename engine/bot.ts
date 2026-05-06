import { Chess } from 'chess.js';
import type { BotDifficulty, OpponentMode } from '../types/chess';
import { StockfishEngine } from './stockfish';

function getRandomMove(fen: string): string | null {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  return moves[Math.floor(Math.random() * moves.length)].lan;
}

export async function getBotMoveLAN(
  fen: string,
  mode: OpponentMode,
  difficulty: BotDifficulty,
  engine: StockfishEngine,
): Promise<string | null> {
  if (mode === 'random') {
    return getRandomMove(fen);
  }

  // Stockfish bot
  if (difficulty === 'easy') {
    return getRandomMove(fen);
  }

  if (difficulty === 'hard') {
    const result = await engine.evaluate(fen, 12);
    return result.bestMove || null;
  }

  // medium: weighted random from top 3 (60 / 25 / 15%)
  const topMoves = await engine.getTopMoves(fen, 3, 10);
  if (topMoves.length === 0) return getRandomMove(fen);

  const weights = [0.60, 0.25, 0.15];
  const rand = Math.random();
  let cumulative = 0;
  for (let i = 0; i < topMoves.length; i++) {
    cumulative += weights[i] ?? 0;
    if (rand < cumulative) return topMoves[i];
  }
  return topMoves[0];
}

export type MoveRating = 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export type OpponentMode = 'human' | 'random' | 'stockfish';
export type PlayerColor = 'white' | 'black';
export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface EngineResult {
  bestMove: string; // LAN format, e.g. "e2e4"
  scoreCP: number;  // centipawns from white's perspective
  isMate: boolean;
}

export interface MoveAnalysis {
  movePlayed: string;
  bestMove: string;
  rating: MoveRating;
  why: string;
  whatAllows: string;
  beginnerPrinciple: string;
  nextPlan: string;
}

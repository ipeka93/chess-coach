export type MoveRating = 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export type OpponentMode = 'human' | 'random' | 'stockfish';
export type PlayerColor = 'white' | 'black';
export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface EngineResult {
  bestMove: string; // LAN format, e.g. "e2e4"
  scoreCP: number;  // centipawns from white's perspective
  isMate: boolean;
}

export interface DebugInfo {
  hangingUserPieces:   string[];   // user's pieces the opponent can take
  hangingOppPieces:    string[];   // opponent's pieces the user can take next turn
  oppFreeCaptureSAN:   string | null; // best free capture opponent can make right now
  missedCaptureSAN:    string | null; // free capture user could have taken
  oppCheckMoves:       string[];   // check/checkmate moves opponent can play
  forkDetected:        boolean;
  rating:              MoveRating;
}

export interface MoveAnalysis {
  movePlayed: string;
  bestMove: string;
  rating: MoveRating;
  whatItDid: string;
  why: string;
  whatAllows: string;
  beginnerPrinciple: string;
  nextPlan: string;
  debugInfo?: DebugInfo;
}

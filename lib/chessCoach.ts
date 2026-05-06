import { Chess, SQUARES } from 'chess.js';
import type { Square } from 'chess.js';
import type { MoveRating, MoveAnalysis } from '../types/chess';

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const CENTER_SQUARES = new Set(['e4', 'e5', 'd4', 'd5']);

// Starting squares for each piece type by color
const STARTING: Record<string, Record<string, string[]>> = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'], q: ['d1'], r: ['a1', 'h1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'], q: ['d8'], r: ['a8', 'h8'] },
};

const PRINCIPLES = {
  protect:
    'Always make sure your pieces are protected. A piece nobody is defending can be taken for free!',
  free_capture:
    'When you can take a piece that has no protection, you almost always should.',
  king_safety:
    'Castle early to move your king to safety behind your pawns. An exposed king is very dangerous.',
  no_queen_early:
    "Don't bring your queen out too early — it can be chased around and you'll waste moves.",
  develop:
    'In the opening, bring your knights and bishops into the game quickly so they can join the fight.',
  center:
    'Controlling the center squares (e4, e5, d4, d5) gives your pieces more space and power.',
  look_for_tactics:
    'Before every move, ask: can I check the king, take a free piece, or create a big threat?',
};

function isDevelopmentMove(from: string, piece: string, color: string): boolean {
  if (piece === 'p' || piece === 'k') return false;
  return STARTING[color]?.[piece]?.includes(from) ?? false;
}

function countDeveloped(chess: Chess, color: string): number {
  let count = 0;
  for (const [piece, squares] of Object.entries(STARTING[color] ?? {})) {
    for (const sq of squares) {
      const p = chess.get(sq as Square);
      if (!p || p.type !== piece || p.color !== color) count++;
    }
  }
  return count;
}

function findHanging(chess: Chess, color: string): string | null {
  const opp = color === 'w' ? 'b' : 'w';
  for (const sq of SQUARES) {
    const p = chess.get(sq);
    if (p && p.color === color && p.type !== 'k') {
      if (chess.isAttacked(sq, opp as 'w' | 'b') && !chess.isAttacked(sq, color as 'w' | 'b')) {
        return `${PIECE_NAMES[p.type]} on ${sq}`;
      }
    }
  }
  return null;
}

function findFreeCapture(chess: Chess): string | null {
  const color = chess.turn();
  const opp = color === 'w' ? 'b' : 'w';
  const moves = chess.moves({ verbose: true });
  for (const m of moves) {
    if (m.isCapture() && !chess.isAttacked(m.to, opp as 'w' | 'b')) {
      return `${PIECE_NAMES[m.captured!]} on ${m.to}`;
    }
  }
  return null;
}

export function generateExplanation(
  movePlayed: string,
  bestMoveSAN: string,
  rating: MoveRating,
  beforeFen: string,
  afterFen: string,
): MoveAnalysis {
  const before = new Chess(beforeFen);
  const after = new Chess(afterFen);

  // Parse the played move
  const tempA = new Chess(beforeFen);
  let moveResult;
  try {
    moveResult = tempA.move(movePlayed);
  } catch {
    // Fallback: return a minimal explanation
    return {
      movePlayed,
      bestMove: bestMoveSAN,
      rating,
      why: `The best move was ${bestMoveSAN}.`,
      whatAllows: 'See if you can spot the difference.',
      beginnerPrinciple: PRINCIPLES.develop,
      nextPlan: 'Keep developing your pieces.',
    };
  }

  const color = moveResult.color;
  const isWhite = color === 'w';
  const piece = moveResult.piece;
  const capturedPiece = moveResult.captured;
  const isCapture = moveResult.isCapture();
  const isCastle = moveResult.isKingsideCastle() || moveResult.isQueensideCastle();
  const isCheck = after.inCheck();
  const isCheckmate = after.isCheckmate();
  const fromSq = moveResult.from;
  const toSq = moveResult.to;
  const isDev = isDevelopmentMove(fromSq, piece, color);
  const controlsCenter = CENTER_SQUARES.has(toSq);
  const isQueenMove = piece === 'q';
  const isBigPawn = moveResult.isBigPawn();
  const moveNumber = before.moveNumber();
  const isOpening = moveNumber <= 15;

  // Parse best move
  const tempB = new Chess(beforeFen);
  let bestResult;
  try {
    bestResult = tempB.move(bestMoveSAN);
  } catch {
    bestResult = null;
  }
  const bestIsCapture = bestResult?.isCapture() ?? false;
  const bestIsCastle =
    (bestResult?.isKingsideCastle() ?? false) ||
    (bestResult?.isQueensideCastle() ?? false);
  const bestIsDev = bestResult
    ? isDevelopmentMove(bestResult.from, bestResult.piece, bestResult.color)
    : false;
  const bestControlsCenter = bestResult ? CENTER_SQUARES.has(bestResult.to) : false;
  const bestPiece = bestResult?.piece ?? '';
  const bestCaptured = bestResult?.captured ?? '';

  // Contextual facts
  const developedCount = countDeveloped(before, color);
  const hangingAfter = findHanging(after, color);
  const freeBefore = findFreeCapture(before);
  const pieceName = PIECE_NAMES[piece] ?? 'piece';
  const bestPieceName = PIECE_NAMES[bestPiece] ?? 'piece';
  const isBestMove = movePlayed === bestMoveSAN || rating === 'Best';

  // ── WHY ──────────────────────────────────────────────────────────────────
  let why = '';

  if (isBestMove) {
    if (isCheckmate) {
      why = `You delivered checkmate! The game is over — you won!`;
    } else if (isCheck) {
      why = `Excellent! Checking the king forces your opponent to respond immediately, keeping you in control of the game.`;
    } else if (isCapture && capturedPiece) {
      why = `You captured the ${PIECE_NAMES[capturedPiece]} — winning material is one of the best things you can do in chess!`;
    } else if (isCastle) {
      why = `Perfect — castling puts your king behind your pawns where it's safe, and connects your rooks so they can work together.`;
    } else if (isDev && isOpening) {
      why = `Great development! Bringing your ${pieceName} into the game gives it more power and gets you ready to attack.`;
    } else if (isBigPawn) {
      why = `Moving the pawn two squares controls the center and opens lines for your pieces — a strong opening move!`;
    } else if (controlsCenter) {
      why = `That square gives you strong control of the center, which means your pieces will have more room to operate.`;
    } else {
      why = `That's a strong move that improves your position and keeps your pieces active.`;
    }
  } else {
    // Explain why the BEST move was better
    if (bestIsCapture && bestCaptured) {
      why = `The best move was ${bestMoveSAN}, which captures the ${PIECE_NAMES[bestCaptured]} for free. Always look for pieces that aren't defended — you can take them without losing anything!`;
    } else if (bestIsCastle) {
      why = `The best move was to castle (${bestMoveSAN}). Castling moves your king to safety and connects your rooks — this should usually be a top priority.`;
    } else if (bestIsDev && isOpening) {
      why = `The best move was ${bestMoveSAN}, which develops your ${bestPieceName} to a good square. In the opening, getting all your pieces into the game quickly is very important.`;
    } else if (bestControlsCenter) {
      why = `The best move was ${bestMoveSAN}, which controls more of the center. A player who controls the center usually has more options and more active pieces.`;
    } else {
      why = `The best move was ${bestMoveSAN}, which keeps your pieces better coordinated and gives you a stronger position overall.`;
    }
  }

  // ── WHAT YOUR MOVE ALLOWS OR MISSES ──────────────────────────────────────
  let whatAllows = '';

  if (rating === 'Best' || rating === 'Good') {
    if (isCheckmate) {
      whatAllows = 'The game is over — well done!';
    } else if (isCheck) {
      whatAllows = `Your opponent is in check and must deal with it right now. This limits their choices and gives you the initiative.`;
    } else if (isCapture && capturedPiece) {
      whatAllows = `You are now ahead in material. More pieces usually means more power to attack and eventually checkmate.`;
    } else if (isCastle) {
      whatAllows = `Your king is now safe, and your rooks are ready to join the game. Great milestone!`;
    } else {
      whatAllows = `Your position is solid. Your opponent doesn't have any obvious tricks to exploit right now.`;
    }
  } else {
    if (hangingAfter) {
      whatAllows = `After your move, your ${hangingAfter} is completely unprotected! Your opponent can take it on their next move for free.`;
    } else if (freeBefore && !isCapture) {
      whatAllows = `You had a free capture available: you could have taken the ${freeBefore} without any risk. Always check for undefended pieces before making other moves!`;
    } else if (isQueenMove && isOpening && moveNumber <= 9) {
      whatAllows = `By moving your queen so early, it can be chased by your opponent's pieces. Each time they attack it, you lose a move developing everything else.`;
    } else if (!isDev && !isCapture && !isCastle && isOpening && developedCount < 3) {
      whatAllows = `You still have pieces sitting on their starting squares that need to come out. While you make slow moves, your opponent can develop and attack.`;
    } else {
      whatAllows = `Your move gives your opponent a chance to improve their position. They can now take control of more space or create threats you'll have to deal with.`;
    }
  }

  // ── BEGINNER PRINCIPLE ───────────────────────────────────────────────────
  let beginnerPrinciple = '';

  if (hangingAfter && rating !== 'Best' && rating !== 'Good') {
    beginnerPrinciple = PRINCIPLES.protect;
  } else if (freeBefore && !isCapture && rating !== 'Best' && rating !== 'Good') {
    beginnerPrinciple = PRINCIPLES.free_capture;
  } else if (bestIsCastle && !isCastle) {
    beginnerPrinciple = PRINCIPLES.king_safety;
  } else if (isQueenMove && isOpening && moveNumber <= 9) {
    beginnerPrinciple = PRINCIPLES.no_queen_early;
  } else if (isOpening && developedCount < 2 && !isDev && !isCapture && !isCastle) {
    beginnerPrinciple = PRINCIPLES.develop;
  } else if (isBigPawn || bestControlsCenter || controlsCenter) {
    beginnerPrinciple = PRINCIPLES.center;
  } else {
    beginnerPrinciple = PRINCIPLES.look_for_tactics;
  }

  // ── NEXT PLAN ────────────────────────────────────────────────────────────
  let nextPlan = '';

  if (after.isGameOver()) {
    nextPlan = after.isCheckmate()
      ? `The game is over — ${isWhite ? 'white' : 'black'} wins!`
      : 'The game ended in a draw.';
  } else if (isOpening && countDeveloped(after, color) < 4) {
    nextPlan =
      'Continue developing your remaining pieces, then look to castle if you haven\'t yet.';
  } else if (isOpening && !after.isCheck()) {
    nextPlan =
      'Your pieces are well developed! Now look for ways to create threats or improve your worst piece.';
  } else {
    nextPlan =
      'Check for any opponent threats first, then find the move that either wins material or improves your position.';
  }

  return {
    movePlayed,
    bestMove: bestMoveSAN,
    rating,
    why,
    whatAllows,
    beginnerPrinciple,
    nextPlan,
  };
}

import { Chess } from 'chess.js';
import type { Square, Color } from 'chess.js';
import type { MoveRating, MoveAnalysis, DebugInfo } from '../types/chess';
import {
  PIECE_NAMES,
  getHangingPieces,
  getBestFreeCapture,
  getOpponentChecks,
  detectFork,
  isDevelopment,
  countDeveloped,
  describeSquare,
  generateNextPlan,
  validateClaim,
  swapTurn,
  type CaptureInfo,
} from './positionAnalysis';

const CENTER_SQUARES = new Set(['e4', 'e5', 'd4', 'd5']);

const BANNED_PHRASES = [
  'your position is solid',
  'continue developing',
  'keep developing your pieces',
  'look for ways',
  'no obvious tricks',
  'improves your position',
  'well-coordinated',
  'keep your pieces active',
  'stronger position overall',
  'improve their position',
  'keep developing',
];

function sanitize(text: string): string {
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      return '[coaching engine: generic phrase slipped through — report this position]';
    }
  }
  return text;
}

const PRINCIPLES = {
  protect: 'Always check if your pieces are defended. An unprotected piece can be taken for free on the next move.',
  free_capture: 'Before every move, scan for undefended enemy pieces — taking them costs nothing.',
  king_safety: 'Castle early to move your king behind your pawns. A king stuck in the center is a liability.',
  no_queen_early: "Don't bring your queen out in the first few moves — it gets chased by cheaper pieces and you waste tempo.",
  develop: 'In the opening, get your knights and bishops off the back rank before pushing pawns or attacking.',
  center: 'Pieces placed in or near the center (d4/d5/e4/e5) control more squares and are harder to attack.',
  look_for_tactics: 'Before every move, ask: can I take a piece, give check, or create a threat my opponent must answer?',
};

export function generateExplanation(
  movePlayed: string,
  bestMoveSAN: string,
  rating: MoveRating,
  beforeFen: string,
  afterFen: string,
): MoveAnalysis {
  const before = new Chess(beforeFen);
  const after  = new Chess(afterFen);

  // ── Parse played move ────────────────────────────────────────────────────
  const tempA = new Chess(beforeFen);
  let moveResult;
  try { moveResult = tempA.move(movePlayed); }
  catch {
    return {
      movePlayed, bestMove: bestMoveSAN, rating,
      whatItDid: `You played ${movePlayed}.`,
      why: `The engine preferred ${bestMoveSAN}.`,
      whatAllows: 'No immediate threats detected.',
      beginnerPrinciple: PRINCIPLES.look_for_tactics,
      nextPlan: 'No clear plan detected. Look for checks, captures, or threats.',
    };
  }

  const color      = moveResult.color as Color;
  const isWhite    = color === 'w';
  const opp        = (isWhite ? 'b' : 'w') as Color;
  const piece      = moveResult.piece;
  const captured   = moveResult.captured;
  const isCapture  = moveResult.isCapture();
  const isCastle   = moveResult.isKingsideCastle() || moveResult.isQueensideCastle();
  const isCheck    = after.inCheck();
  const isCheckmate = after.isCheckmate();
  const fromSq     = moveResult.from;
  const toSq       = moveResult.to;
  const isDev      = isDevelopment(fromSq, piece, color);
  const controlsCenter = CENTER_SQUARES.has(toSq);
  const isQueenMove = piece === 'q';
  const isBigPawn  = moveResult.isBigPawn();
  const moveNumber = before.moveNumber();
  const isOpening  = moveNumber <= 15;
  const isBestMove = rating === 'Best' || movePlayed === bestMoveSAN;
  const pieceName  = PIECE_NAMES[piece] ?? 'piece';

  // Guard: produce text only when a specific board claim is verified.
  // board = the chess instance to validate "piece on square" claims against.
  function guard(text: string, board: Chess, fallback: string): string {
    return validateClaim(text, board, color) ? text : fallback;
  }

  // ── Parse best move ──────────────────────────────────────────────────────
  const tempB = new Chess(beforeFen);
  let bestResult;
  try { bestResult = tempB.move(bestMoveSAN); } catch { bestResult = null; }
  const bestIsCapture      = bestResult?.isCapture() ?? false;
  const bestIsCastle       = (bestResult?.isKingsideCastle() ?? false) || (bestResult?.isQueensideCastle() ?? false);
  const bestIsDev          = bestResult ? isDevelopment(bestResult.from, bestResult.piece, bestResult.color) : false;
  const bestControlsCenter = bestResult ? CENTER_SQUARES.has(bestResult.to) : false;
  const bestPiece          = bestResult?.piece ?? '';
  const bestCaptured       = bestResult?.captured ?? '';
  const bestToSq           = bestResult?.to ?? '';
  const bestPieceName      = PIECE_NAMES[bestPiece] ?? 'piece';

  // ── Verified position facts ──────────────────────────────────────────────

  // Opponent's legal options after user's move:
  const oppLegalMoves = after.moves({ verbose: true });
  const oppFreeCap    = getBestFreeCapture(after);   // opp's best free capture of user's piece (legal-move based)
  const oppChecks     = getOpponentChecks(after);    // check moves opp can make (SAN-based, always accurate)

  // Verify oppFreeCap: the piece must exist on that square in `after`
  const oppFreeCapVerified: CaptureInfo | null = (() => {
    if (!oppFreeCap) return null;
    const p = after.get(oppFreeCap.to as Square);
    if (!p || p.color !== color || PIECE_NAMES[p.type] !== PIECE_NAMES[oppFreeCap.captured]) return null;
    return oppFreeCap;
  })();

  // User's hanging pieces: isAttacked-based, then cross-checked against actual opponent legal moves
  const userHangingVerified = getHangingPieces(after, color)
    .filter(h => oppLegalMoves.some(m => m.to === h.square && m.isCapture()));

  // User could have taken this for free before their move (legal-move based)
  const freeBefore = getBestFreeCapture(before);
  // Verify freeBefore: the piece must have existed in `before`
  const freeBeforeVerified: CaptureInfo | null = (() => {
    if (!freeBefore) return null;
    const p = before.get(freeBefore.to as Square);
    if (!p || p.color !== opp || PIECE_NAMES[p.type] !== PIECE_NAMES[freeBefore.captured]) return null;
    return freeBefore;
  })();

  // Fork detection (uses legal moves from swapped position — accounts for pins)
  const forkCreated = detectFork(beforeFen, `${fromSq}${toSq}`);
  // Verify fork targets: each forked square must have an actual opponent piece in `after`
  const verifiedForkTargets = (forkCreated?.targets ?? []).filter(sq => {
    const p = after.get(sq as Square);
    return p && p.color === opp;
  });

  // User's free capture available next turn (verified via swapped position + piece existence)
  let nextFreeCapAfter: CaptureInfo | null = null;
  try {
    const swapped = new Chess(swapTurn(afterFen));
    const cap = getBestFreeCapture(swapped);
    if (cap) {
      // Double-check: the piece must exist in the after position with correct type/color
      const p = after.get(cap.to as Square);
      if (p && p.color === opp && PIECE_NAMES[p.type] === PIECE_NAMES[cap.captured]) {
        nextFreeCapAfter = cap;
      }
    }
  } catch { /* ignore */ }

  // Verify best-move capture: the piece must have existed in `before`
  const bestCaptureVerified: boolean = (() => {
    if (!bestIsCapture || !bestCaptured || !bestToSq) return false;
    const p = before.get(bestToSq as Square);
    return !!(p && p.color === opp && PIECE_NAMES[p.type] === PIECE_NAMES[bestCaptured]);
  })();

  const devCount = countDeveloped(before, color);

  // ── WHAT IT DID ──────────────────────────────────────────────────────────
  let whatItDid: string;
  if (isCheckmate) {
    whatItDid = `Your ${pieceName} moved to ${toSq} — checkmate!`;
  } else if (isCheck) {
    whatItDid = `Your ${pieceName} moved to ${describeSquare(toSq)}, putting the king in check.`;
  } else if (isCapture && captured) {
    whatItDid = `Your ${pieceName} on ${fromSq} took the ${PIECE_NAMES[captured]} on ${describeSquare(toSq)}.`;
  } else if (isCastle) {
    whatItDid = `You castled — king moved to safety, rook became active.`;
  } else if (verifiedForkTargets.length >= 2) {
    // Both fork targets verified to exist on those squares
    const targets = verifiedForkTargets.slice(0, 2).map(sq => {
      const p = after.get(sq as Square)!;
      return `the ${PIECE_NAMES[p.type]} on ${sq}`;
    }).join(' and ');
    whatItDid = guard(
      `Your ${pieceName} moved to ${toSq}, attacking ${targets} at the same time — a fork!`,
      after,
      `Your ${pieceName} moved from ${fromSq} to ${describeSquare(toSq)}.`,
    );
  } else {
    whatItDid = `Your ${pieceName} moved from ${fromSq} to ${describeSquare(toSq)}.`;
  }

  // ── WHY THIS MOVE MATTERS ────────────────────────────────────────────────
  let why: string;
  if (isBestMove) {
    if (isCheckmate) {
      why = `That's the winning move — the king has no legal escape.`;
    } else if (isCheck) {
      why = `Checking the king on ${toSq} forces your opponent to respond, keeping you in control.`;
    } else if (isCapture && captured) {
      why = `Taking the ${PIECE_NAMES[captured]} on ${describeSquare(toSq)} wins material — you're now up a ${PIECE_NAMES[captured]}.`;
    } else if (isCastle) {
      why = `Castling was the engine's top choice — king behind the pawns and rook enters the game.`;
    } else if (verifiedForkTargets.length >= 2) {
      const targets = verifiedForkTargets.slice(0, 2).map(sq => {
        const p = after.get(sq as Square)!;
        return `the ${PIECE_NAMES[p.type]} on ${sq}`;
      }).join(' and ');
      const candidate = `Your ${pieceName} on ${toSq} now attacks ${targets} at once — your opponent can only save one.`;
      why = guard(candidate, after, `The engine prefers ${bestMoveSAN}, but this app cannot yet identify the exact reason.`);
    } else if (nextFreeCapAfter) {
      // Verified: user can legally take this piece and it exists on that square
      const candidate = `After this move, your opponent's ${PIECE_NAMES[nextFreeCapAfter.captured]} on ${nextFreeCapAfter.to} is undefended — take it with ${nextFreeCapAfter.san} next turn.`;
      why = guard(candidate, after, `The engine prefers ${bestMoveSAN}, but this app cannot yet identify the exact reason.`);
    } else if (isDev && isOpening) {
      why = `Developing your ${pieceName} to ${describeSquare(toSq)} gets it off the back rank and into the game.`;
    } else if (isBigPawn && controlsCenter) {
      why = `Pushing the pawn two squares stakes a claim in the center, giving your pieces more room.`;
    } else if (controlsCenter) {
      why = `${describeSquare(toSq)} is a central square — your ${pieceName} controls more of the board from there.`;
    } else {
      why = `The engine prefers ${bestMoveSAN}, but this app cannot yet identify the exact reason.`;
    }
  } else {
    // Explain why the best move was better
    if (bestCaptureVerified && bestCaptured) {
      // Verified: the captured piece exists in `before`
      const isFreeCapture = freeBeforeVerified?.to === bestToSq;
      const qualifier = isFreeCapture ? 'for free — it has no protection' : '';
      const candidate = isFreeCapture
        ? `The best move was ${bestMoveSAN} — it takes the undefended ${PIECE_NAMES[bestCaptured]} on ${describeSquare(bestToSq)} for free.`
        : `The best move was ${bestMoveSAN} — it captures the ${PIECE_NAMES[bestCaptured]} on ${describeSquare(bestToSq)}${qualifier}.`;
      why = guard(candidate, before, `The engine preferred ${bestMoveSAN}, but this app cannot yet identify the exact reason.`);
    } else if (bestIsCastle) {
      why = `The best move was to castle (${bestMoveSAN}). Your king is still exposed in the center and needs to reach safety.`;
    } else if (bestIsDev && isOpening && bestToSq) {
      why = `The best move was ${bestMoveSAN}, developing the ${bestPieceName} toward ${describeSquare(bestToSq)}. Get your pieces out before attacking.`;
    } else if (bestControlsCenter && bestToSq) {
      why = `The best move was ${bestMoveSAN}, placing the ${bestPieceName} on ${describeSquare(bestToSq)} — a more active, central square.`;
    } else {
      why = `The engine preferred ${bestMoveSAN}, but this app cannot yet identify the exact reason.`;
    }
  }

  // ── CONCRETE CONSEQUENCE ─────────────────────────────────────────────────
  // Only state things verified from actual legal moves or explicitly checked board state.
  let whatAllows: string;
  if (isCheckmate) {
    whatAllows = 'The game is over — checkmate!';
  } else if (oppFreeCapVerified) {
    // Verified: piece exists, opponent has legal move to take it
    const candidate = `Your opponent can take your ${PIECE_NAMES[oppFreeCapVerified.captured]} on ${oppFreeCapVerified.to} for free with ${oppFreeCapVerified.san}.`;
    whatAllows = guard(candidate, after, 'No immediate threats detected.');
  } else if (userHangingVerified.length > 0) {
    // Verified: opponent has actual legal capture
    const h = userHangingVerified[0];
    whatAllows = `Your ${h.name} on ${h.square} is undefended and can be taken.`;
  } else if (!isBestMove && freeBeforeVerified && !isCapture) {
    // Verified: the piece existed in `before` and user had a legal capture
    const candidate = `You could have taken the undefended ${PIECE_NAMES[freeBeforeVerified.captured]} on ${freeBeforeVerified.to} for free with ${freeBeforeVerified.san}.`;
    whatAllows = guard(candidate, before, 'No immediate threats detected.');
  } else if (oppChecks.length > 0 && !isBestMove) {
    whatAllows = `Your opponent can give check with ${oppChecks[0]}.`;
  } else {
    whatAllows = 'No immediate threats detected.';
  }

  // ── BEGINNER PRINCIPLE ───────────────────────────────────────────────────
  let beginnerPrinciple: string;
  if ((oppFreeCapVerified || userHangingVerified.length > 0) && !isBestMove) {
    beginnerPrinciple = PRINCIPLES.protect;
  } else if (freeBeforeVerified && !isCapture && !isBestMove) {
    beginnerPrinciple = PRINCIPLES.free_capture;
  } else if (bestIsCastle && !isCastle) {
    beginnerPrinciple = PRINCIPLES.king_safety;
  } else if (isQueenMove && isOpening && moveNumber <= 9) {
    beginnerPrinciple = PRINCIPLES.no_queen_early;
  } else if (isOpening && devCount < 2 && !isDev && !isCapture && !isCastle) {
    beginnerPrinciple = PRINCIPLES.develop;
  } else if (controlsCenter || bestControlsCenter || isBigPawn) {
    beginnerPrinciple = PRINCIPLES.center;
  } else {
    beginnerPrinciple = PRINCIPLES.look_for_tactics;
  }

  // ── CONCRETE NEXT MOVE OR IDEA ───────────────────────────────────────────
  let nextPlan: string;
  if (after.isGameOver()) {
    nextPlan = after.isCheckmate()
      ? `The game is over — ${isWhite ? 'White' : 'Black'} wins!`
      : 'The game ended in a draw.';
  } else {
    nextPlan = generateNextPlan(afterFen, color);
  }

  // ── DEBUG INFO ───────────────────────────────────────────────────────────
  const debugInfo: DebugInfo = {
    hangingUserPieces:   userHangingVerified.map(h => `${h.name} on ${h.square}`),
    hangingOppPieces:    verifiedForkTargets.map(sq => {
      const p = after.get(sq as Square);
      return p ? `${PIECE_NAMES[p.type]} on ${sq}` : sq;
    }),
    oppFreeCaptureSAN:   oppFreeCapVerified ? `${oppFreeCapVerified.san} (takes ${PIECE_NAMES[oppFreeCapVerified.captured]} on ${oppFreeCapVerified.to})` : null,
    missedCaptureSAN:    freeBeforeVerified ? `${freeBeforeVerified.san} (takes ${PIECE_NAMES[freeBeforeVerified.captured]} on ${freeBeforeVerified.to})` : null,
    oppCheckMoves:       oppChecks.slice(0, 5),
    forkDetected:        verifiedForkTargets.length >= 2,
    rating,
  };

  return {
    movePlayed,
    bestMove: bestMoveSAN,
    rating,
    whatItDid:  sanitize(whatItDid),
    why:        sanitize(why),
    whatAllows: sanitize(whatAllows),
    beginnerPrinciple: sanitize(beginnerPrinciple),
    nextPlan:   sanitize(nextPlan),
    debugInfo,
  };
}

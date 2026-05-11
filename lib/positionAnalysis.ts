import { Chess, SQUARES } from 'chess.js';
import type { Square, Color, PieceSymbol, Move } from 'chess.js';

export const PIECE_NAMES: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

const PIECE_VALUE: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

export interface PieceInfo {
  square: Square;
  type: PieceSymbol;
  color: Color;
  name: string;
}

export interface HangingPiece extends PieceInfo {
  attackers: Square[];
}

export interface CaptureInfo {
  from: Square;
  to: Square;
  piece: PieceSymbol;
  captured: PieceSymbol;
  san: string;
  isFree: boolean;
}

export interface ForkInfo {
  piece: PieceSymbol;
  fromSquare: Square;
  toSquare: Square;
  targets: Square[];
}

/** Swap the active side in a FEN without changing the board. Clears en passant to avoid invalid positions. */
export function swapTurn(fen: string): string {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  return parts.join(' ');
}

/**
 * Validate that every "PIECE on SQUARE" claim in `text` is actually true on `chess`.
 *
 * Patterns checked:
 *   "your PIECE on SQUARE"       → must be userColor's piece of that type
 *   "opponent's PIECE on SQUARE" → must be oppColor's piece of that type
 *   "the PIECE on SQUARE"        → must be any piece of that type
 *
 * Returns false if ANY claim fails. Returns true if no "piece on square" patterns
 * are found, or all found patterns are verified.
 */
export function validateClaim(text: string, chess: Chess, userColor: Color): boolean {
  const oppColor = (userColor === 'w' ? 'b' : 'w') as Color;

  for (const m of text.matchAll(/\byour (pawn|knight|bishop|rook|queen|king) on ([a-h][1-8])\b/gi)) {
    const p = chess.get(m[2] as Square);
    if (!p || PIECE_NAMES[p.type] !== m[1].toLowerCase() || p.color !== userColor) return false;
  }

  for (const m of text.matchAll(/\bopponent'?s? (pawn|knight|bishop|rook|queen|king) on ([a-h][1-8])\b/gi)) {
    const p = chess.get(m[2] as Square);
    if (!p || PIECE_NAMES[p.type] !== m[1].toLowerCase() || p.color !== oppColor) return false;
  }

  for (const m of text.matchAll(/\bthe (pawn|knight|bishop|rook|queen|king) on ([a-h][1-8])\b/gi)) {
    const p = chess.get(m[2] as Square);
    if (!p || PIECE_NAMES[p.type] !== m[1].toLowerCase()) return false;
  }

  return true;
}

/**
 * Hanging pieces for `color`: attacked by the opponent AND not defended by own side.
 * Sorted by piece value descending (most valuable first).
 *
 * IMPORTANT: uses isAttacked, which does not account for pins on the attacker.
 * Always cross-check with actual legal moves before claiming the piece can be taken.
 */
export function getHangingPieces(chess: Chess, color: Color): HangingPiece[] {
  const opp = (color === 'w' ? 'b' : 'w') as Color;
  const result: HangingPiece[] = [];
  for (const sq of SQUARES) {
    const p = chess.get(sq as Square);
    if (!p || p.color !== color || p.type === 'k') continue;
    if (chess.isAttacked(sq as Square, opp) && !chess.isAttacked(sq as Square, color)) {
      result.push({ square: sq as Square, type: p.type, color: p.color, name: PIECE_NAMES[p.type], attackers: [] });
    }
  }
  return result.sort((a, b) => (PIECE_VALUE[b.type] ?? 0) - (PIECE_VALUE[a.type] ?? 0));
}

/** Legal captures for the side to move, including SAN and whether the capture is free (can't be recaptured). */
export function getLegalCaptures(chess: Chess): CaptureInfo[] {
  const color = chess.turn();
  const opp = (color === 'w' ? 'b' : 'w') as Color;
  return chess.moves({ verbose: true })
    .filter(m => m.isCapture())
    .map(m => ({
      from: m.from as Square,
      to: m.to as Square,
      piece: m.piece,
      captured: m.captured as PieceSymbol,
      san: m.san,
      isFree: !chess.isAttacked(m.to as Square, opp),
    }));
}

/** Most valuable free capture for the side to move. Based on legal moves — accounts for pins. */
export function getBestFreeCapture(chess: Chess): CaptureInfo | null {
  const free = getLegalCaptures(chess).filter(c => c.isFree);
  if (free.length === 0) return null;
  return free.reduce((best, c) =>
    (PIECE_VALUE[c.captured] ?? 0) > (PIECE_VALUE[best.captured] ?? 0) ? c : best
  );
}

/**
 * Returns SAN strings for moves the side-to-move can make that give check or checkmate.
 * Based on actual legal moves — always accurate.
 */
export function getOpponentChecks(chess: Chess): string[] {
  return chess.moves().filter(san => san.includes('+') || san.includes('#'));
}

/**
 * Detect if a move creates a fork (attacks 2+ opponent pieces simultaneously).
 *
 * Uses LEGAL moves of the landing piece (via swapped position) — NOT isAttacked.
 * This correctly excludes pins: a pinned piece cannot contribute to a real fork.
 * Only opponent pieces that are on squares the forking piece can LEGALLY reach are counted.
 */
export function detectFork(beforeFen: string, moveLAN: string): ForkInfo | null {
  try {
    const chess = new Chess(beforeFen);
    const moved = chess.move({
      from: moveLAN.slice(0, 2) as Square,
      to: moveLAN.slice(2, 4) as Square,
      promotion: (moveLAN[4] as PieceSymbol) ?? 'q',
    });
    if (!moved) return null;
    const moverColor = moved.color as Color;
    const oppColor = (moverColor === 'w' ? 'b' : 'w') as Color;
    const landingSq = moved.to as Square;

    // After the move it's the opponent's turn — swap to get mover's legal moves
    let legalTargets: Set<string>;
    try {
      const swapped = new Chess(swapTurn(chess.fen()));
      const movesFromLanding = (swapped.moves({ verbose: true }) as Move[])
        .filter((m: Move) => m.from === landingSq);
      legalTargets = new Set(movesFromLanding.map((m: Move) => m.to));
    } catch {
      return null;
    }

    // Count opponent pieces on squares the forking piece can LEGALLY reach
    const forkedSquares: Square[] = [];
    for (const sq of SQUARES) {
      const p = chess.get(sq as Square);
      if (!p || p.color !== oppColor) continue;
      if (legalTargets.has(sq)) forkedSquares.push(sq as Square);
    }

    if (forkedSquares.length >= 2) {
      return { piece: moved.piece, fromSquare: moved.from as Square, toSquare: landingSq, targets: forkedSquares };
    }
    return null;
  } catch { return null; }
}

/** Annotate a square with its area on the board. */
export function describeSquare(sq: string): string {
  const file = sq[0];
  const rank = parseInt(sq[1]);
  let area = '';
  if (['d', 'e'].includes(file) && [4, 5].includes(rank)) area = ' (center)';
  else if (['a', 'b', 'c'].includes(file)) area = ' (queenside)';
  else if (['f', 'g', 'h'].includes(file)) area = ' (kingside)';
  return sq + area;
}

const STARTING: Record<string, Record<string, string[]>> = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'], q: ['d1'], r: ['a1', 'h1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'], q: ['d8'], r: ['a8', 'h8'] },
};

export function isDevelopment(from: string, piece: string, color: string): boolean {
  if (piece === 'p' || piece === 'k') return false;
  return STARTING[color]?.[piece]?.includes(from) ?? false;
}

export function countDeveloped(chess: Chess, color: string): number {
  let count = 0;
  for (const [piece, squares] of Object.entries(STARTING[color] ?? {})) {
    for (const sq of squares) {
      const p = chess.get(sq as Square);
      if (!p || p.type !== piece || p.color !== color) count++;
    }
  }
  return count;
}

/**
 * Given a position and the Stockfish best move (LAN + SAN), simulate the move
 * and explain WHY it is good — not what it physically does.
 * Returns a coach-style explanation string, or null if no clear reason is found.
 */
export function explainStockfishMove(
  fen: string,
  bestMoveLAN: string,
  bestMoveSAN: string,
  userColor: Color,
): string | null {
  if (!bestMoveLAN || bestMoveLAN.length < 4) return null;
  try {
    const before = new Chess(fen);
    const opp = (userColor === 'w' ? 'b' : 'w') as Color;

    const fromSq = bestMoveLAN.slice(0, 2) as Square;
    const toSq   = bestMoveLAN.slice(2, 4) as Square;

    const movingPiece   = before.get(fromSq);
    const capturedPiece = before.get(toSq);
    if (!movingPiece) return null;

    const moverName    = PIECE_NAMES[movingPiece.type] ?? 'piece';
    const isCapture    = !!(capturedPiece && capturedPiece.color === opp);
    const capturedName = isCapture ? (PIECE_NAMES[capturedPiece!.type] ?? 'piece') : '';
    const capturedVal  = isCapture ? (PIECE_VALUE[capturedPiece!.type] ?? 0) : 0;
    const moverVal     = PIECE_VALUE[movingPiece.type] ?? 0;

    const after = new Chess(fen);
    const moveResult = after.move({
      from: fromSq,
      to: toSq,
      promotion: (bestMoveLAN[4] as PieceSymbol) ?? 'q',
    });
    if (!moveResult) return null;

    const isCheck     = after.inCheck();
    const isCheckmate = after.isCheckmate();

    // Pattern 1: Checkmate
    if (isCheckmate) {
      return `${bestMoveSAN} is checkmate: the king has no escape. Play it to end the game.`;
    }

    // Pattern 2: Capture + check
    if (isCapture && isCheck) {
      if (capturedVal > moverVal) {
        return `${bestMoveSAN} wins a ${capturedName} and gives check at the same time; your opponent must deal with the check and loses material.`;
      }
      if (capturedVal === moverVal) {
        return `${bestMoveSAN} trades ${moverName}s and gives check, forcing the king to move and keeping you in control of the position.`;
      }
      return `${bestMoveSAN} gives check by capturing on ${toSq}, forcing your opponent to respond immediately.`;
    }

    // Pattern 3: Capture
    if (isCapture) {
      const canBeRecaptured = after.isAttacked(toSq, opp);
      if (!canBeRecaptured) {
        if (capturedVal > moverVal) {
          return `${bestMoveSAN} wins a ${capturedName} for free: it has no protection, so you gain material with no risk.`;
        }
        return `${bestMoveSAN} takes the ${capturedName} on ${toSq} with no recapture: free material.`;
      }
      if (capturedVal > moverVal) {
        return `${bestMoveSAN} captures the ${capturedName} (worth more than your ${moverName}), winning material even after the recapture.`;
      }
      // Equal or losing trade — fall through to other patterns
    }

    // Pattern 4: Check without capture
    if (isCheck) {
      return `${bestMoveSAN} puts the king in check, forcing your opponent to respond and giving you control of the next move.`;
    }

    // Pattern 5: Fork
    const forkInfo = detectFork(fen, bestMoveLAN);
    if (forkInfo && forkInfo.targets.length >= 2) {
      const targetNames = forkInfo.targets.slice(0, 2).map(sq => {
        const p = after.get(sq as Square);
        return p ? `the ${PIECE_NAMES[p.type]} on ${sq}` : sq;
      });
      return `${bestMoveSAN} is a fork: your ${moverName} attacks ${targetNames.join(' and ')} at the same time. Your opponent can only save one.`;
    }

    // Pattern 6: Creates a winning threat (free capture available next turn)
    try {
      const swappedAfter = new Chess(swapTurn(after.fen()));
      const threat = getBestFreeCapture(swappedAfter);
      if (threat) {
        const threatTarget = after.get(threat.to as Square);
        if (threatTarget && threatTarget.color === opp) {
          return `${bestMoveSAN} threatens to win the ${PIECE_NAMES[threatTarget.type]} on ${threat.to} for free next move; your opponent must defend it or lose material.`;
        }
      }
    } catch { /* ignore */ }

    // Pattern 7: Castling
    if (moveResult.isKingsideCastle() || moveResult.isQueensideCastle()) {
      const side = moveResult.isKingsideCastle() ? 'kingside' : 'queenside';
      return `${bestMoveSAN} castles ${side}: your king reaches safety behind the pawns and your rook becomes active.`;
    }

    // Pattern 8: Development in the opening
    if (before.moveNumber() <= 15 && isDevelopment(fromSq, movingPiece.type, userColor)) {
      return `${bestMoveSAN} develops your ${moverName} toward the center, getting it off the back rank and into the game.`;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a specific, concrete next-move suggestion for `userColor`.
 * `afterFen` is the position after the user's move (opponent to move).
 *
 * All suggestions are verified against actual legal moves — no hallucinated claims.
 */
export function generateNextPlan(
  afterFen: string,
  userColor: Color,
  bestMoveLAN?: string,
  bestMoveSAN?: string,
): string {
  try {
    const after = new Chess(afterFen);
    const opp = (userColor === 'w' ? 'b' : 'w') as Color;

    if (after.isGameOver()) return '';

    // 1. Opponent's best free capture of user's pieces (verified via legal moves)
    const oppFreeCap = getBestFreeCapture(after);
    if (oppFreeCap) {
      // Double-check: the piece must exist in the after position
      const pieceCheck = after.get(oppFreeCap.to as Square);
      if (pieceCheck && pieceCheck.color === userColor && PIECE_NAMES[pieceCheck.type] === PIECE_NAMES[oppFreeCap.captured]) {
        return `Defend your ${PIECE_NAMES[oppFreeCap.captured]} on ${oppFreeCap.to}; your opponent can take it with ${oppFreeCap.san}.`;
      }
    }

    // 2. User piece that isAttacked + verified opponent has legal capture there
    const oppLegalMoves = after.moves({ verbose: true });
    for (const h of getHangingPieces(after, userColor)) {
      if (oppLegalMoves.some((m: Move) => m.to === h.square && m.isCapture())) {
        return `Defend your ${h.name} on ${h.square}: it is undefended and can be taken.`;
      }
    }

    // Swapped position for user's next-turn candidate moves
    let swapped: Chess;
    let swappedMoves: Move[];
    try {
      swapped = new Chess(swapTurn(afterFen));
      swappedMoves = swapped.moves({ verbose: true });
    } catch {
      return 'Look for checks, captures, or moves that threaten an opponent piece.';
    }

    // 3. Opponent piece user can take for free next turn
    //    Verify: piece exists AND user has a legal capture there
    for (const h of getHangingPieces(after, opp)) {
      const takingMove = swappedMoves.find((m: Move) => m.to === h.square && m.isCapture());
      if (!takingMove) continue;
      // Verify the piece still exists and is the right type
      const pieceCheck = after.get(h.square);
      if (pieceCheck && pieceCheck.color === opp && PIECE_NAMES[pieceCheck.type] === h.name) {
        return `Your opponent's ${h.name} on ${h.square} has no protection; take it with ${takingMove.san} if they don't defend it.`;
      }
    }

    // 4. Castling
    const castlingField = afterFen.split(' ')[2] ?? '';
    const hasCastling = userColor === 'w'
      ? castlingField.includes('K') || castlingField.includes('Q')
      : castlingField.includes('k') || castlingField.includes('q');
    if (hasCastling) {
      const kingSq: Square = userColor === 'w' ? 'e1' : 'e8';
      const king = after.get(kingSq);
      if (king && king.type === 'k' && king.color === userColor) {
        const castleMove = swappedMoves.find((m: Move) => m.isKingsideCastle() || m.isQueensideCastle());
        if (castleMove) {
          const side = castleMove.isKingsideCastle() ? 'kingside' : 'queenside';
          return `Castle ${side} (${castleMove.san}): your king is still in the center and needs to be tucked away.`;
        }
      }
    }

    // 5. Best free capture available next turn (legal-move-based)
    const nextFreeCap = getBestFreeCapture(swapped);
    if (nextFreeCap) {
      // Verify piece exists in after position (it won't have moved if opp doesn't take it)
      const pieceCheck = after.get(nextFreeCap.to as Square);
      if (pieceCheck && pieceCheck.color === opp && PIECE_NAMES[pieceCheck.type] === PIECE_NAMES[nextFreeCap.captured]) {
        return `Take the undefended ${PIECE_NAMES[nextFreeCap.captured]} on ${nextFreeCap.to} with ${nextFreeCap.san}: it has no protection.`;
      }
    }

    // 6. Stockfish-backed explanation — describe WHY the move is good, not just what it does
    if (bestMoveLAN && bestMoveSAN) {
      const explanation = explainStockfishMove(afterFen, bestMoveLAN, bestMoveSAN, userColor);
      if (explanation) return explanation;
    }

    // 7. Last resort
    return 'Look for checks, captures, or moves that threaten an opponent piece.';
  } catch {
    return 'Look for checks, captures, or moves that threaten an opponent piece.';
  }
}

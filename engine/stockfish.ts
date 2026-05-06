import { Chess } from 'chess.js';
import type { EngineResult } from '../types/chess';

export class StockfishEngine {
  private worker: Worker | null = null;
  private listeners: Set<(msg: string) => void> = new Set();
  private initialized = false;

  async init(): Promise<void> {
    if (typeof window === 'undefined' || this.initialized) return;

    // stockfish.js auto-detects worker context and loads stockfish.wasm from same path
    this.worker = new Worker('/stockfish.js');

    this.worker.onmessage = (e: MessageEvent<string>) => {
      for (const fn of this.listeners) fn(e.data);
    };

    this.worker.onerror = (e) => {
      console.error('Stockfish worker error:', e);
    };

    await this.sendAndWait('uci', 'uciok');
    await this.sendAndWait('isready', 'readyok');
    this.initialized = true;
  }

  private sendAndWait(cmd: string, waitFor: string): Promise<void> {
    return new Promise((resolve) => {
      const listener = (msg: string) => {
        if (msg.includes(waitFor)) {
          this.listeners.delete(listener);
          resolve();
        }
      };
      this.listeners.add(listener);
      this.worker?.postMessage(cmd);
    });
  }

  send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  async evaluate(fen: string, depth = 12): Promise<EngineResult> {
    this.worker?.postMessage('stop');

    return new Promise((resolve, reject) => {
      let scoreCP = 0;
      let isMate = false;

      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error('Engine timeout'));
      }, 15000);

      const listener = (msg: string) => {
        if (msg.startsWith('info') && msg.includes(' score ')) {
          const cpMatch = msg.match(/score cp (-?\d+)/);
          const mateMatch = msg.match(/score mate (-?\d+)/);
          if (cpMatch) {
            scoreCP = parseInt(cpMatch[1], 10);
            isMate = false;
          }
          if (mateMatch) {
            isMate = true;
            scoreCP = parseInt(mateMatch[1], 10) > 0 ? 30000 : -30000;
          }
        }
        if (msg.startsWith('bestmove')) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          const parts = msg.split(' ');
          const bestMove = parts[1] === '(none)' ? '' : (parts[1] ?? '');
          // Normalize score to always be from white's perspective.
          // Stockfish reports from the side-to-move's perspective (UCI standard):
          // positive = side to move is winning. When black is to move, we negate.
          const turn = new Chess(fen).turn();
          const whiteScore = turn === 'b' ? -scoreCP : scoreCP;
          resolve({ bestMove, scoreCP: whiteScore, isMate });
        }
      };

      this.listeners.add(listener);
      this.worker?.postMessage(`position fen ${fen}`);
      this.worker?.postMessage(`go depth ${depth}`);
    });
  }

  async getTopMoves(fen: string, numMoves: number, depth = 10): Promise<string[]> {
    this.worker?.postMessage('stop');
    this.worker?.postMessage(`setoption name MultiPV value ${numMoves}`);

    return new Promise((resolve, reject) => {
      const collected = new Map<number, string>(); // pvIndex → bestMove LAN

      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        this.worker?.postMessage('setoption name MultiPV value 1');
        reject(new Error('Engine timeout'));
      }, 15000);

      const listener = (msg: string) => {
        if (msg.startsWith('info') && msg.includes(' multipv ')) {
          const pvMatch = msg.match(/multipv (\d+)/);
          const moveMatch = msg.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
          const depthMatch = msg.match(/ depth (\d+)/);
          if (pvMatch && moveMatch && depthMatch) {
            const pvIdx = parseInt(pvMatch[1], 10);
            const currentDepth = parseInt(depthMatch[1], 10);
            if (currentDepth >= depth) {
              collected.set(pvIdx, moveMatch[1]);
            }
          }
        }
        if (msg.startsWith('bestmove')) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          this.worker?.postMessage('setoption name MultiPV value 1');
          const ordered: string[] = [];
          for (let i = 1; i <= numMoves; i++) {
            const m = collected.get(i);
            if (m) ordered.push(m);
          }
          resolve(ordered);
        }
      };

      this.listeners.add(listener);
      this.worker?.postMessage(`position fen ${fen}`);
      this.worker?.postMessage(`go depth ${depth}`);
    });
  }

  get isReady(): boolean {
    return this.initialized;
  }

  terminate(): void {
    this.worker?.postMessage('quit');
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }
}

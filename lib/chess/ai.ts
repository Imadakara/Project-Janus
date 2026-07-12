// Простейший шахматный "ИИ" для терминального мини-приложения CHESS.EXE — минимакс
// с альфа-бета отсечением по материальной оценке позиции. Чистая функция без побочных
// эффектов (не трогает БД/сеть), поэтому тестируется без живого Postgres — см. соглашение
// в CLAUDE.md про вынос логики из UI/роутов.

import { Chess } from "chess.js";

const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function evaluateBoard(game: Chess): number {
  let score = 0;
  for (const row of game.board()) {
    for (const square of row) {
      if (!square) continue;
      const value = PIECE_VALUES[square.type];
      score += square.color === "w" ? value : -value;
    }
  }
  return score;
}

function minimax(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
): number {
  if (depth === 0 || game.isGameOver()) {
    if (game.isCheckmate()) return maximizing ? -100000 - depth : 100000 + depth;
    if (game.isDraw()) return 0;
    return evaluateBoard(game);
  }

  const moves = game.moves();
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      game.move(move);
      best = Math.max(best, minimax(game, depth - 1, alpha, beta, false));
      game.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    game.move(move);
    best = Math.min(best, minimax(game, depth - 1, alpha, beta, true));
    game.undo();
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

/** Возвращает SAN-запись выбранного хода или null, если ходов нет (мат/пат). */
export function chooseAiMove(fen: string, depth = 2): string | null {
  const game = new Chess(fen);
  const moves = game.moves();
  if (moves.length === 0) return null;

  const maximizing = game.turn() === "w";
  let bestMove = moves[0];
  let bestScore = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    game.move(move);
    const score = minimax(game, depth - 1, -Infinity, Infinity, !maximizing);
    game.undo();
    if ((maximizing && score > bestScore) || (!maximizing && score < bestScore)) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

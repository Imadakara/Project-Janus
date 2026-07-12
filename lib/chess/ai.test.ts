import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { chooseAiMove } from "./ai";

describe("chooseAiMove", () => {
  it("returns null when there are no legal moves (checkmate)", () => {
    // Дурацкий мат (fool's mate) — чёрные объявили мат, у белых нет ходов.
    const game = new Chess();
    game.move("f3");
    game.move("e5");
    game.move("g4");
    game.move("Qh4");
    expect(game.isCheckmate()).toBe(true);

    expect(chooseAiMove(game.fen())).toBeNull();
  });

  it("returns a move that is legal in the given position", () => {
    const game = new Chess();
    const move = chooseAiMove(game.fen());
    expect(move).not.toBeNull();
    expect(game.moves()).toContain(move);
  });

  it("prefers capturing a free queen over an unrelated quiet move", () => {
    // Белый слон на b2 бьёт пустую чёрную ферзь на g7, ничем не защищённую.
    const fen = "4k3/6q1/8/8/8/8/1B6/4K3 w - - 0 1";
    const move = chooseAiMove(fen);
    expect(move).toBe("Bxg7");
  });
});

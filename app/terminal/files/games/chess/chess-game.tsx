"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Chess, type Move, type Square } from "chess.js";
import { TypedText } from "@/components/terminal/typed-text";
import { Modal } from "@/components/terminal/modal";
import { chooseAiMove } from "@/lib/chess/ai";

type PlayerColor = "w" | "b";
type Phase = "intro" | "assigning" | "playing" | "over";
type PromotionPiece = "q" | "r" | "b" | "n";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Юникод-глиф "залитых" фигур намеренно назначен белым, а "контурных" — чёрным: в
// монохромном янтарном терминале это читается правильнее, чем стандартное сопоставление
// (контурный глиф на тёмной клетке визуально теряется и выглядит менее "своим", чем залитый).
const PIECE_GLYPHS: Record<string, string> = {
  wk: "♚",
  wq: "♛",
  wr: "♜",
  wb: "♝",
  wn: "♞",
  wp: "♟",
  bk: "♔",
  bq: "♕",
  br: "♖",
  bb: "♗",
  bn: "♘",
  bp: "♙",
};

const PROMOTION_CHOICES: { piece: PromotionPiece; label: string }[] = [
  { piece: "q", label: "ФЕРЗЬ" },
  { piece: "r", label: "ЛАДЬЯ" },
  { piece: "b", label: "СЛОН" },
  { piece: "n", label: "КОНЬ" },
];

// Возвращает 8x8 клеток в порядке отображения (сверху вниз, слева направо) с учётом
// разворота доски под цвет игрока — так свои фигуры всегда снизу.
function buildDisplaySquares(playerColor: PlayerColor): Square[][] {
  const rows: Square[][] = [];
  for (let displayRow = 0; displayRow < 8; displayRow++) {
    const rank = playerColor === "b" ? displayRow + 1 : 8 - displayRow;
    const row: Square[] = [];
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      const file = playerColor === "b" ? FILES[7 - displayCol] : FILES[displayCol];
      row.push(`${file}${rank}` as Square);
    }
    rows.push(row);
  }
  return rows;
}

function isLightSquare(square: string): boolean {
  const fileIndex = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return (fileIndex + rank) % 2 === 0;
}

type Outcome = "win" | "loss" | "draw";
type GameResult = { outcome: Outcome; reason: string };

function buildGameResult(game: Chess, color: PlayerColor): GameResult | null {
  if (!game.isGameOver()) return null;

  if (game.isCheckmate()) {
    const loser = game.turn();
    return loser !== color
      ? { outcome: "win", reason: "ОППОНЕНТУ ОБЪЯВЛЕН МАТ. ХОДОВ НЕ ОСТАЛОСЬ." }
      : { outcome: "loss", reason: "ВАШЕМУ КОРОЛЮ ОБЪЯВЛЕН МАТ. ХОДОВ НЕ ОСТАЛОСЬ." };
  }
  if (game.isStalemate()) {
    return { outcome: "draw", reason: "ПАТ: У СТОРОНЫ, ЧЕЙ ХОД, НЕТ ДОПУСТИМЫХ ХОДОВ." };
  }
  if (game.isThreefoldRepetition()) {
    return { outcome: "draw", reason: "ТРОЕКРАТНОЕ ПОВТОРЕНИЕ ПОЗИЦИИ." };
  }
  if (game.isInsufficientMaterial()) {
    return { outcome: "draw", reason: "НЕДОСТАТОЧНО МАТЕРИАЛА ДЛЯ МАТА." };
  }
  return { outcome: "draw", reason: "НИЧЬЯ ПО ПРАВИЛУ 50 ХОДОВ БЕЗ ВЗЯТИЯ И ХОДА ПЕШКОЙ." };
}

type MovePair = { number: number; white: string; black?: string };

// Разбивает плоскую историю ходов (SAN) на пары бело/чёрный для отображения в виде
// стандартной шахматной нотации ("1. e4 e5").
function pairMoveHistory(history: string[]): MovePair[] {
  const pairs: MovePair[] = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({ number: i / 2 + 1, white: history[i], black: history[i + 1] });
  }
  return pairs;
}

export function ChessGame() {
  const router = useRouter();
  const gameRef = useRef(new Chess());
  const aiInFlightRef = useRef(false);
  const waitingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveLogRef = useRef<HTMLDivElement>(null);

  const [fen, setFen] = useState(STARTING_FEN);
  const [phase, setPhase] = useState<Phase>("intro");
  const [playerColor, setPlayerColor] = useState<PlayerColor | null>(null);
  const [assignReveal, setAssignReveal] = useState<PlayerColor>("w");
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [comment, setComment] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);

  const displaySquares = useMemo(() => buildDisplaySquares(playerColor ?? "w"), [playerColor]);
  const movePairs = useMemo(() => pairMoveHistory(moveHistory), [moveHistory]);

  useEffect(() => {
    moveLogRef.current?.scrollTo({ top: moveLogRef.current.scrollHeight });
  }, [moveHistory]);

  function clearWaitingTimeout() {
    if (waitingTimeoutRef.current) {
      clearTimeout(waitingTimeoutRef.current);
      waitingTimeoutRef.current = null;
    }
  }

  useEffect(() => clearWaitingTimeout, []);

  function checkAndHandleGameOver(color: PlayerColor) {
    const result = buildGameResult(gameRef.current, color);
    if (!result) return false;
    setGameResult(result);
    setPhase("over");
    return true;
  }

  function startNewGame() {
    gameRef.current = new Chess();
    aiInFlightRef.current = false;
    clearWaitingTimeout();
    setFen(gameRef.current.fen());
    setSelectedSquare(null);
    setLegalTargets([]);
    setComment("");
    setGameResult(null);
    setPendingPromotion(null);
    setAiThinking(false);
    setPlayerColor(null);
    setMoveHistory([]);
    setPhase("assigning");
  }

  // Жеребьёвка стороны: мигание бело/чёрным, затем фиксация случайного результата.
  // Кто получит белые — тот и ходит первым, по стандартным правилам.
  useEffect(() => {
    if (phase !== "assigning") return;

    const flickerInterval = setInterval(() => {
      setAssignReveal((prev) => (prev === "w" ? "b" : "w"));
    }, 90);

    const finalColor: PlayerColor = Math.random() < 0.5 ? "w" : "b";

    const stopFlickerTimeout = setTimeout(() => {
      clearInterval(flickerInterval);
      setAssignReveal(finalColor);
    }, 900);

    const commitTimeout = setTimeout(() => {
      setPlayerColor(finalColor);
      setPhase("playing");
      // Если первым ходит игрок — ждать нечего анонсировать заранее, сразу показываем
      // состояние ожидания. Если первым ходит ИИ — этот текст выставит эффект хода ИИ ниже.
      if (finalColor === "w") {
        setComment("ОЖИДАЮ ХОД ОПЕРАТОРА...");
      }
    }, 1600);

    return () => {
      clearInterval(flickerInterval);
      clearTimeout(stopFlickerTimeout);
      clearTimeout(commitTimeout);
    };
  }, [phase]);

  // Ход ИИ запускается автоматически, когда очередь не игрока (в т.ч. первый ход,
  // если игроку случайно достались чёрные).
  useEffect(() => {
    if (phase !== "playing" || !playerColor) return;
    if (gameRef.current.isGameOver()) return;
    if (gameRef.current.turn() === playerColor) return;
    if (aiInFlightRef.current) return;

    aiInFlightRef.current = true;
    clearWaitingTimeout();
    setAiThinking(true);
    setComment("ЯНУС ВЫЧИСЛЯЕТ ХОД...");

    const timeout = setTimeout(() => {
      const best = chooseAiMove(gameRef.current.fen(), 2);
      if (best) {
        gameRef.current.move(best);
        setFen(gameRef.current.fen());
        setMoveHistory(gameRef.current.history());
      }
      setComment("МОЙ ХОД");
      aiInFlightRef.current = false;
      setAiThinking(false);
      const isOver = checkAndHandleGameOver(playerColor);
      // Даём "МОЙ ХОД" повисеть секунду как анонс, затем переходим в состояние ожидания
      // хода оператора — если партия не закончилась этим же ходом.
      if (!isOver) {
        waitingTimeoutRef.current = setTimeout(() => {
          setComment("ОЖИДАЮ ХОД ОПЕРАТОРА...");
        }, 900);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [phase, playerColor, fen]);

  function selectSquare(square: Square) {
    const moves = gameRef.current.moves({ square, verbose: true }) as Move[];
    if (moves.length === 0) return;
    setSelectedSquare(square);
    setLegalTargets(moves.map((m) => m.to as Square));
  }

  function applyMove(from: Square, to: Square, promotion?: PromotionPiece) {
    if (!playerColor) return;
    try {
      gameRef.current.move({ from, to, promotion });
    } catch {
      return;
    }
    clearWaitingTimeout();
    setFen(gameRef.current.fen());
    setMoveHistory(gameRef.current.history());
    setSelectedSquare(null);
    setLegalTargets([]);
    setComment("ХОД ОПЕРАТОРА");
    checkAndHandleGameOver(playerColor);
  }

  function handleSquareClick(square: Square) {
    if (phase !== "playing" || aiThinking || pendingPromotion || !playerColor) return;
    if (gameRef.current.turn() !== playerColor) return;

    const piece = gameRef.current.get(square);

    if (selectedSquare) {
      if (square === selectedSquare) {
        setSelectedSquare(null);
        setLegalTargets([]);
        return;
      }
      if (legalTargets.includes(square)) {
        const movingPiece = gameRef.current.get(selectedSquare);
        const isPromotion = movingPiece?.type === "p" && (square[1] === "8" || square[1] === "1");
        if (isPromotion) {
          setPendingPromotion({ from: selectedSquare, to: square });
          setSelectedSquare(null);
          setLegalTargets([]);
          return;
        }
        applyMove(selectedSquare, square);
        return;
      }
      if (piece && piece.color === playerColor) {
        selectSquare(square);
      } else {
        setSelectedSquare(null);
        setLegalTargets([]);
      }
      return;
    }

    if (piece && piece.color === playerColor) {
      selectSquare(square);
    }
  }

  function confirmPromotion(piece: PromotionPiece) {
    if (!pendingPromotion) return;
    applyMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  }

  // Рендер читает позицию из fen (стейт), а не напрямую из gameRef.current — чтение
  // ref.current во время рендера запрещено правилом react-hooks/refs. gameRef остаётся
  // единственным источником истины для мутаций (ходы), но только внутри хендлеров/эффектов.
  const game = useMemo(() => new Chess(fen), [fen]);
  const isPlayerTurn = phase === "playing" && !aiThinking && game.turn() === playerColor;
  const inCheck = phase === "playing" && game.inCheck() && !game.isGameOver();

  return (
    <main className="flex min-h-screen flex-col gap-4 px-6 py-8 sm:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-lg">CHESS.EXE</h1>
        <button
          type="button"
          onClick={() => router.push("/terminal/files")}
          className="border px-3 py-1 text-sm"
          style={{ borderColor: "var(--color-amber-dim)" }}
        >
          ВЫХОД
        </button>
      </div>

      {phase === "intro" && (
        <div className="flex flex-col gap-4">
          <p className="opacity-80">ПОДПРОГРАММА CHESS.EXE ЗАГРУЖЕНА.</p>
          <p className="opacity-80">РЕЖИМ: КЛАССИЧЕСКИЕ ШАХМАТЫ. ПРОТИВНИК: ЯНУС.</p>
          <button
            type="button"
            onClick={startNewGame}
            className="w-fit border px-4 py-2"
            style={{ borderColor: "var(--color-amber-dim)" }}
          >
            НАЧАТЬ ИГРУ
          </button>
        </div>
      )}

      {phase === "assigning" && (
        <div className="flex flex-col items-center gap-4 py-16">
          <p className="opacity-80">ОПРЕДЕЛЕНИЕ СТОРОНЫ...</p>
          <p className="text-2xl">{assignReveal === "w" ? "БЕЛЫЕ" : "ЧЁРНЫЕ"}</p>
        </div>
      )}

      {(phase === "playing" || phase === "over") && playerColor && (
        <div className="flex flex-col gap-4">
          <p className="opacity-70">
            ВЫ ИГРАЕТЕ ЗА: {playerColor === "w" ? "БЕЛЫЕ" : "ЧЁРНЫЕ"}
            {phase === "playing" && (
              <>
                {" "}
                | ХОД: {isPlayerTurn ? "ОПЕРАТОР" : "ЯНУС"}
                {inCheck && " | ШАХ"}
              </>
            )}
          </p>

          <div
            className="relative mx-auto"
            style={{ width: "calc(min(92vw, 480px) + 24px + 280px)" }}
          >
            <div className="flex" style={{ width: "min(92vw, 480px)" }}>
              <div className="flex flex-col justify-around pr-1 text-xs opacity-70">
                {displaySquares.map((row) => (
                  <span key={row[0]}>{row[0][1]}</span>
                ))}
              </div>
              <div className="flex-1">
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: "repeat(8, 1fr)",
                    border: "2px solid var(--color-amber-dim)",
                  }}
                >
                  {displaySquares.map((row) =>
                    row.map((square) => {
                      const piece = game.get(square);
                      const glyph = piece ? PIECE_GLYPHS[`${piece.color}${piece.type}`] : "";
                      const isSelected = square === selectedSquare;
                      const isTarget = legalTargets.includes(square);
                      const style: CSSProperties = {
                        background: isLightSquare(square)
                          ? "var(--color-amber-dim)"
                          : "var(--color-crt-bg-raised)",
                        color:
                          piece?.color === "w" ? "var(--color-amber-bright)" : "var(--color-amber)",
                      };
                      if (isSelected) {
                        style.outline = "3px solid var(--color-amber-bright)";
                        style.outlineOffset = "-3px";
                      } else if (isTarget && piece) {
                        style.outline = "3px solid var(--color-amber)";
                        style.outlineOffset = "-3px";
                      }
                      return (
                        <button
                          key={square}
                          type="button"
                          onClick={() => handleSquareClick(square)}
                          className="relative aspect-square flex items-center justify-center text-3xl sm:text-4xl"
                          style={style}
                        >
                          {glyph}
                          {isTarget && !piece && (
                            <span
                              className="absolute h-2.5 w-2.5"
                              style={{ background: "var(--color-amber-bright)", opacity: 0.85 }}
                            />
                          )}
                        </button>
                      );
                    }),
                  )}
                </div>
                <div
                  className="mt-1 flex text-xs opacity-70"
                  style={{ justifyContent: "space-around" }}
                >
                  {displaySquares[0].map((square) => (
                    <span key={square}>{square[0].toUpperCase()}</span>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="absolute top-0 flex flex-col gap-3"
              style={{
                left: "calc(min(92vw, 480px) + 24px)",
                width: 280,
                height: "100%",
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              <div
                className="flex flex-col border p-2 text-sm"
                style={{ borderColor: "var(--color-amber-dim)", flex: "0 0 45%", minHeight: 0 }}
              >
                <p className="mb-1 flex-none opacity-70">ЯНУС&gt;</p>
                <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap">
                  {comment && <TypedText key={`${fen}-${comment}`} text={comment} />}
                </div>
              </div>

              <div
                className="flex flex-col border p-2 text-sm"
                style={{ borderColor: "var(--color-amber-dim)", flex: "1 1 auto", minHeight: 0 }}
              >
                <p className="mb-1 flex-none opacity-70">ЛОГ ХОДОВ:</p>
                <div ref={moveLogRef} className="min-h-0 flex-1 overflow-y-auto">
                  {movePairs.length === 0 ? (
                    <p className="opacity-50">ХОДОВ ЕЩЁ НЕ БЫЛО.</p>
                  ) : (
                    <ol>
                      {movePairs.map((pair) => (
                        <li key={pair.number}>
                          <span className="opacity-70">{pair.number}.</span> {pair.white}{" "}
                          {pair.black ?? ""}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingPromotion && (
        <Modal>
          <p className="mb-2">ВЫБЕРИТЕ ФИГУРУ ДЛЯ ПРЕВРАЩЕНИЯ ПЕШКИ:</p>
          <div className="flex gap-3">
            {PROMOTION_CHOICES.map(({ piece, label }) => (
              <button
                key={piece}
                type="button"
                onClick={() => confirmPromotion(piece)}
                className="border px-3 py-2 text-2xl"
                style={{ borderColor: "var(--color-amber-dim)" }}
                aria-label={label}
              >
                {PIECE_GLYPHS[`${playerColor}${piece}`]}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {phase === "over" && gameResult && (
        <Modal className="text-center">
          <p className="mb-2 text-2xl">
            {gameResult.outcome === "win" && "ПОБЕДА"}
            {gameResult.outcome === "loss" && "ПОРАЖЕНИЕ"}
            {gameResult.outcome === "draw" && "НИЧЬЯ"}
          </p>
          <p className="mb-4 opacity-80">{gameResult.reason}</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={startNewGame}
              className="border px-3 py-1"
              style={{ borderColor: "var(--color-amber-dim)" }}
            >
              НОВАЯ ИГРА
            </button>
            <button
              type="button"
              onClick={() => router.push("/terminal/files")}
              className="border px-3 py-1"
              style={{ borderColor: "var(--color-amber-dim)" }}
            >
              ВЫЙТИ
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

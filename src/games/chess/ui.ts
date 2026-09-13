import { mountTurnPage, type TurnGame } from "@/games/turnPage.ts";
import type { Role } from "@/games/turn.ts";
import {
  apply,
  findOrder,
  inCheck,
  initialState,
  type Kind,
  legalMoves,
  type Outcome,
  outcome,
  type Side,
  squareName,
  type State,
  turn,
} from "./logic.ts";
import { decodeOrder, describeOrder, encodeOrder } from "./codec.ts";

const SIDE_LENGTH = 8;
const KIND_NAMES: Record<Kind, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

const sideOf = (role: Role): Side => role === "host" ? "white" : "black";
const other = (side: Side): Side => side === "white" ? "black" : "white";

const boardEl = document.getElementById("board") as HTMLElement;

/**
 * Cells run left to right, top to bottom. Each player sees their own back rank
 * at the bottom: white has a1 bottom-left, black has h8 bottom-left.
 */
function squareAt(cell: number, role: Role): number {
  const row = cell >> 3;
  const column = cell & 7;
  return role === "host"
    ? (SIDE_LENGTH - 1 - row) * SIDE_LENGTH + column
    : row * SIDE_LENGTH + (SIDE_LENGTH - 1 - column);
}

const isDark = (square: number) => ((square >> 3) + (square & 7)) % 2 === 0;

let view: Role = "host";
let selected: number | undefined;
/** The state the selection was built on: any other state invalidates it. */
let selectedState: State | undefined;
/** The two squares of the move that produced each state. */
const lastMove = new WeakMap<State, number[]>();

const SVG_NS = "http://www.w3.org/2000/svg";

const cells = Array.from({ length: SIDE_LENGTH * SIDE_LENGTH }, (_, cell) => {
  const el = document.createElement("button");
  const piece = document.createElementNS(SVG_NS, "svg");
  piece.setAttribute("class", "piece");
  piece.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  piece.append(use);
  const file = document.createElement("span");
  file.className = "coord file";
  const rank = document.createElement("span");
  rank.className = "coord rank";
  el.append(file, rank);
  el.onclick = () => tap(squareAt(cell, view));
  boardEl.append(el);
  return { el, piece, use, file, rank };
});

const movesFrom = (state: State, square: number) =>
  legalMoves(state).filter((move) => move.from === square);

function kingInCheck(state: State): number {
  if (!inCheck(state)) return -1;
  const side = turn(state);
  return state.board.findIndex((piece) =>
    piece !== null && piece.side === side && piece.kind === "k"
  );
}

function render(state: State, role: Role) {
  view = role;
  if (state !== selectedState) selected = undefined;
  const targets = new Set(
    selected === undefined
      ? []
      : movesFrom(state, selected).map((move) => move.to),
  );
  const last = lastMove.get(state) ?? [];
  const check = kingInCheck(state);
  cells.forEach(({ el, piece, use, file, rank }, cell) => {
    const square = squareAt(cell, role);
    const occupant = state.board[square];
    const classes = [isDark(square) ? "dark" : "light"];
    if (occupant) classes.push(occupant.side === "white" ? "x" : "o");
    if (square === selected) classes.push("from");
    if (targets.has(square)) classes.push("to");
    if (last.includes(square)) classes.push("last");
    if (square === check) classes.push("check");
    el.className = classes.join(" ");
    if (occupant) {
      use.setAttribute("href", `#piece-${occupant.kind}`);
      if (!piece.isConnected) el.append(piece);
    } else {
      piece.remove();
    }
    const name = squareName(square);
    file.textContent = cell >> 3 === SIDE_LENGTH - 1 ? name[0] : "";
    rank.textContent = (cell & 7) === 0 ? name[1] : "";
    el.setAttribute(
      "aria-label",
      `${name}, ${
        occupant ? `${occupant.side} ${KIND_NAMES[occupant.kind]}` : "empty"
      }`,
    );
  });
  boardEl.classList.toggle("over", outcome(state) !== null);
}

function verdict(result: Outcome, side: Side): string {
  const you = (winner: Side) => `you ${winner === side ? "win" : "lose"}`;
  switch (result.kind) {
    case "checkmate":
      return `checkmate, ${you(result.winner)}`;
    case "resigned":
      return `${other(result.winner)} resigns, ${you(result.winner)}`;
    case "draw":
      switch (result.reason) {
        case "stalemate":
          return "stalemate, draw";
        case "repetition":
          return "draw by repetition";
        case "moves":
          return "draw by the 50-move rule";
        case "material":
          return "dead position, draw";
        case "agreed":
          return "draw agreed";
      }
  }
}

const chess: TurnGame<State> = {
  initial: initialState,
  moveCount: (state) => state.messages,
  turn: (state) => turn(state) === "white" ? "host" : "guest",
  over: (state) => outcome(state) !== null,
  play(state, payload) {
    const decoded = decodeOrder(payload);
    const order = decoded && findOrder(state, decoded);
    if (!order) return null;
    const next = apply(state, order);
    lastMove.set(
      next,
      order.kind === "move"
        ? [order.move.from, order.move.to]
        : lastMove.get(state) ?? [],
    );
    return next;
  },
  describe: (payload) => describeOrder(decodeOrder(payload)),
  render,
  result: (state, role) => verdict(outcome(state)!, sideOf(role)),
  prompt: (state) =>
    inCheck(state)
      ? "check, your move"
      : state.offered
      ? "draw offered, accept or move"
      : "your move",
  label: sideOf,
};

const page = mountTurnPage(chess);

function tap(square: number) {
  const state = page.state;
  if (!page.canMove()) return;
  selectedState = state;
  const target = selected === undefined ? undefined : movesFrom(state, selected)
    .find((move) =>
      move.to === square &&
      (move.promotion === undefined || move.promotion === "q")
    );
  if (target) {
    page.move(encodeOrder({ kind: "move", move: target, offer: false }));
    selected = undefined;
  } else {
    selected = movesFrom(state, square).length > 0 ? square : undefined;
  }
  render(page.state, page.role);
}

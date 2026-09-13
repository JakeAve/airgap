import { mountTurnPage, type TurnGame } from "@/games/turnPage.ts";
import type { Role } from "@/games/turn.ts";
import {
  apply,
  findMove,
  initialState,
  legalMoves,
  outcome,
  type Side,
  type State,
  turn,
} from "./logic.ts";
import { decodeMove, encodeMove } from "./codec.ts";

const SIDE_LENGTH = 8;

const sideOf = (role: Role): Side => role === "host" ? "dark" : "light";

const boardEl = document.getElementById("board") as HTMLElement;

/** Each player sees their own back rank at the bottom, so the host's view is the board turned around. */
function coords(cell: number, role: Role): { row: number; column: number } {
  const turned = role === "host";
  const row = cell >> 3;
  const column = cell & 7;
  return turned
    ? { row: SIDE_LENGTH - 1 - row, column: SIDE_LENGTH - 1 - column }
    : { row, column };
}

const playable = (row: number, column: number) => (row + column) % 2 === 1;
const squareAt = (row: number, column: number) => row * 4 + (column >> 1);

let view: Role = "host";
let path: number[] = [];
/** The state the selection was built on: any other state invalidates it. */
let pathState: State | undefined;

const cells = Array.from({ length: SIDE_LENGTH * SIDE_LENGTH }, (_, cell) => {
  const el = document.createElement("button");
  el.onclick = () => {
    const { row, column } = coords(cell, view);
    if (playable(row, column)) tap(squareAt(row, column));
  };
  boardEl.append(el);
  return el;
});

const starts = (state: State, prefix: number[]) =>
  legalMoves(state).filter((move) =>
    move.path.length >= prefix.length &&
    prefix.every((square, i) => move.path[i] === square)
  );

/** The squares that would carry the current selection one hop further. */
function nextSquares(state: State): Set<number> {
  const out = new Set<number>();
  for (const move of starts(state, path)) {
    if (move.path.length > path.length) out.add(move.path[path.length]);
  }
  return out;
}

function render(state: State, role: Role) {
  view = role;
  if (state !== pathState) path = [];
  const targets = path.length > 0 ? nextSquares(state) : new Set<number>();
  cells.forEach((el, cell) => {
    const { row, column } = coords(cell, role);
    const dark = playable(row, column);
    const square = dark ? squareAt(row, column) : -1;
    const piece = dark ? state.board[square] : null;
    const classes = [];
    if (piece) classes.push(piece.side === "dark" ? "x" : "o");
    if (piece?.king) classes.push("king");
    if (path.includes(square)) classes.push("from");
    if (targets.has(square)) classes.push("to");
    el.className = classes.join(" ");
    el.disabled = !dark;
    const contents = !dark
      ? "not playable"
      : piece
      ? `${piece.side} ${piece.king ? "king" : "man"}`
      : "empty";
    el.setAttribute(
      "aria-label",
      `row ${row + 1} column ${column + 1}, ${contents}`,
    );
  });
  boardEl.classList.toggle("over", outcome(state) !== null);
}

const checkers: TurnGame<State> = {
  initial: initialState,
  moveCount: (state) => state.moves,
  turn: (state) => turn(state) === "dark" ? "host" : "guest",
  over: (state) => outcome(state) !== null,
  play(state, payload) {
    const decoded = decodeMove(payload);
    const move = decoded && findMove(state, decoded);
    return move ? apply(state, move) : null;
  },
  describe: (payload) => `move ${decodeMove(payload)?.join("-") ?? "unknown"}`,
  render,
  result(state, role) {
    const winner = outcome(state);
    return `${winner} wins, you ${winner === sideOf(role) ? "win" : "lose"}`;
  },
  prompt: (state) =>
    legalMoves(state).every((move) => move.captures.length > 0)
      ? "you must jump"
      : "your move",
  label: sideOf,
};

const page = mountTurnPage(checkers);

function tap(square: number) {
  const state = page.state;
  if (!page.canMove()) return;
  pathState = state;
  if (path.length === 0) {
    if (starts(state, [square]).length > 0) path = [square];
  } else if (nextSquares(state).has(square)) {
    path = [...path, square];
    if (findMove(state, path)) {
      page.move(encodeMove(path));
      path = [];
    }
  } else {
    path = starts(state, [square]).length > 0 ? [square] : [];
  }
  render(page.state, page.role);
}

import { mountTurnPage, type TurnGame } from "@/games/turnPage.ts";
import type { Role } from "@/games/turn.ts";
import {
  type Board,
  emptyBoard,
  isLegal,
  type Mark,
  moveCount,
  outcome,
  play,
  turn,
  winningLine,
} from "./logic.ts";
import { decodeMove, encodeMove } from "./codec.ts";

const markOf = (role: Role): Mark => role === "host" ? "X" : "O";

const boardEl = document.getElementById("board") as HTMLElement;

const cells = Array.from({ length: 9 }, (_, cell) => {
  const el = document.createElement("button");
  el.onclick = () => tap(cell);
  boardEl.append(el);
  return el;
});

const strike = document.createElement("span");
strike.className = "strike";
strike.hidden = true;
boardEl.append(strike);

function render(board: Board) {
  cells.forEach((el, cell) => {
    const mark = board[cell];
    el.textContent = mark ?? "";
    el.className = mark?.toLowerCase() ?? "";
    el.setAttribute(
      "aria-label",
      `row ${Math.floor(cell / 3) + 1} column ${(cell % 3) + 1}, ${
        mark ?? "empty"
      }`,
    );
  });
  const result = outcome(board);
  const line = winningLine(board);
  boardEl.classList.toggle("over", result !== null);
  boardEl.classList.toggle("draw", result === "draw");
  line?.forEach((cell) => cells[cell].classList.add("win"));
  strike.hidden = !line;
  if (line) drawStrike(board, line);
}

/** Runs from the centre of the first winning cell to the centre of the last. */
function drawStrike(board: Board, [first, , last]: number[]) {
  const from = cells[first];
  const to = cells[last];
  const origin = boardEl.getBoundingClientRect();
  const centre = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return [r.x + r.width / 2 - origin.x, r.y + r.height / 2 - origin.y];
  };
  const [x1, y1] = centre(from);
  const [x2, y2] = centre(to);
  const pad = from.offsetWidth / 3;
  const length = Math.hypot(x2 - x1, y2 - y1) + 2 * pad;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  strike.className = `strike ${board[first]?.toLowerCase()}`;
  strike.style.width = `${length}px`;
  strike.style.left = `${x1 - Math.cos(angle) * pad}px`;
  strike.style.top = `${y1 - Math.sin(angle) * pad}px`;
  strike.style.rotate = `${angle}rad`;
}

const ticTacToe: TurnGame<Board> = {
  id: "tictactoe",
  initial: emptyBoard,
  moveCount,
  turn: (board) => turn(board) === "X" ? "host" : "guest",
  over: (board) => outcome(board) !== null,
  play(board, payload) {
    const cell = decodeMove(payload);
    return cell !== null && isLegal(board, cell) ? play(board, cell) : null;
  },
  describe: (payload) => `cell ${decodeMove(payload)}`,
  render,
  result(board, role) {
    const result = outcome(board);
    if (result === "draw") return "draw";
    return `${result} wins, you ${result === markOf(role) ? "win" : "lose"}`;
  },
  label: markOf,
};

const page = mountTurnPage(ticTacToe);

function tap(cell: number) {
  page.move(encodeMove(cell));
}

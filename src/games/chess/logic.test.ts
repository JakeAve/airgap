import { assertEquals } from "@std/assert";
import {
  apply,
  type Board,
  claimable,
  findOrder,
  inCheck,
  initialState,
  type Kind,
  legalMoves,
  type Move,
  type Order,
  type Outcome,
  outcome,
  positionKey,
  squareName,
  type State,
  turn,
} from "./logic.ts";

function square(name: string): number {
  return (Number(name[1]) - 1) * 8 + "abcdefgh".indexOf(name[0]);
}

function fromFen(fen: string): State {
  const [placement, side, castling, enPassant] = fen.split(" ");
  const board: Board = new Array(64).fill(null);
  placement.split("/").forEach((row, i) => {
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char);
        continue;
      }
      board[(7 - i) * 8 + file] = {
        side: char === char.toUpperCase() ? "white" : "black",
        kind: char.toLowerCase() as Kind,
      };
      file++;
    }
  });
  const rights = (castling.includes("K") ? 1 : 0) |
    (castling.includes("Q") ? 2 : 0) | (castling.includes("k") ? 4 : 0) |
    (castling.includes("q") ? 8 : 0);
  const state: State = {
    board,
    messages: side === "w" ? 0 : 1,
    castling: rights,
    enPassant: enPassant === "-" ? null : square(enPassant),
    halfmove: 0,
    history: [],
    offered: false,
    ended: null,
  };
  return { ...state, history: [positionKey(state)] };
}

function perft(state: State, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    nodes += perft(
      apply(state, { kind: "move", move, offer: false }),
      depth - 1,
    );
  }
  return nodes;
}

function move(from: string, to: string, promotion?: Kind): Order {
  const move: Move = { from: square(from), to: square(to) };
  if (promotion) move.promotion = promotion;
  return { kind: "move", move, offer: false };
}

function playAll(state: State, ...orders: Order[]): State {
  for (const order of orders) {
    const found = findOrder(state, order);
    if (!found) throw new Error(`illegal ${JSON.stringify(order)}`);
    state = apply(state, found);
  }
  return state;
}

function has(state: State, order: Order): boolean {
  return findOrder(state, order) !== null;
}

function offering(order: Order): Order {
  return order.kind === "move" ? { ...order, offer: true } : order;
}

Deno.test("squareName maps a1, e2 and h8", () => {
  assertEquals(squareName(0), "a1");
  assertEquals(squareName(12), "e2");
  assertEquals(squareName(63), "h8");
  assertEquals(square("e2"), 12);
});

Deno.test("the initial position has sixteen pieces a side and white to move", () => {
  const state = initialState();
  assertEquals(state.board.filter((p) => p?.side === "white").length, 16);
  assertEquals(state.board.filter((p) => p?.side === "black").length, 16);
  assertEquals(state.board[4], { side: "white", kind: "k" });
  assertEquals(state.board[60], { side: "black", kind: "k" });
  assertEquals(turn(state), "white");
  assertEquals(state.castling, 15);
  assertEquals(state.history.length, 1);
  assertEquals(turn(playAll(state, move("e2", "e4"))), "black");
});

Deno.test("perft from the initial position", () => {
  const state = initialState();
  assertEquals(perft(state, 1), 20);
  assertEquals(perft(state, 2), 400);
  assertEquals(perft(state, 3), 8902);
  assertEquals(perft(state, 4), 197281);
});

Deno.test("perft from kiwipete", () => {
  const state = fromFen(
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -",
  );
  assertEquals(perft(state, 1), 48);
  assertEquals(perft(state, 2), 2039);
  assertEquals(perft(state, 3), 97862);
});

Deno.test("perft from a promotion-heavy position", () => {
  const state = fromFen("n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - -");
  assertEquals(perft(state, 1), 24);
  assertEquals(perft(state, 2), 496);
  assertEquals(perft(state, 3), 9483);
});

Deno.test("castling is refused through check", () => {
  const throughCheck = fromFen("5r1k/8/8/8/8/8/8/4K2R w K -");
  assertEquals(has(throughCheck, move("e1", "g1")), false);

  const intoCheck = fromFen("6rk/8/8/8/8/8/8/4K2R w K -");
  assertEquals(has(intoCheck, move("e1", "g1")), false);

  const fromCheck = fromFen("4r2k/8/8/8/8/8/8/4K2R w K -");
  assertEquals(has(fromCheck, move("e1", "g1")), false);

  const rookPathOnly = fromFen("1r5k/8/8/8/8/8/8/R3K3 w Q -");
  assertEquals(has(rookPathOnly, move("e1", "c1")), true);

  const clear = fromFen("7k/8/8/8/8/8/8/R3K2R w KQ -");
  assertEquals(has(clear, move("e1", "g1")), true);
  assertEquals(has(clear, move("e1", "c1")), true);
  assertEquals(has({ ...clear, castling: 0 }, move("e1", "g1")), false);
});

Deno.test("castling moves the rook and spends the right", () => {
  const state = fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq -");
  const castled = playAll(state, move("e1", "g1"));
  assertEquals(castled.board[square("g1")], { side: "white", kind: "k" });
  assertEquals(castled.board[square("f1")], { side: "white", kind: "r" });
  assertEquals(castled.board[square("h1")], null);
  assertEquals(castled.castling, 12);

  const rookMoved = playAll(state, move("a1", "a2"));
  assertEquals(rookMoved.castling, 13);

  const rookTaken = playAll(state, move("a1", "a8"));
  assertEquals(rookTaken.castling, 5);
});

Deno.test("en passant is legal only on the very next ply", () => {
  const start = fromFen("4k3/3p4/8/4P3/8/8/8/4K3 b - -");
  const pushed = playAll(start, move("d7", "d5"));
  assertEquals(pushed.enPassant, square("d6"));
  assertEquals(has(pushed, move("e5", "d6")), true);

  const taken = playAll(pushed, move("e5", "d6"));
  assertEquals(taken.board[square("d5")], null);
  assertEquals(taken.board[square("d6")], { side: "white", kind: "p" });
  assertEquals(taken.halfmove, 0);

  const later = playAll(pushed, move("e1", "e2"), move("e8", "e7"));
  assertEquals(later.enPassant, null);
  assertEquals(has(later, move("e5", "d6")), false);
});

Deno.test("stalemate is a draw and checkmate a win", () => {
  const stalemate = fromFen("7k/5Q2/6K1/8/8/8/8/8 b - -");
  assertEquals(legalMoves(stalemate), []);
  assertEquals(inCheck(stalemate), false);
  assertEquals(outcome(stalemate), { kind: "draw", reason: "stalemate" });

  const mated = playAll(
    initialState(),
    move("f2", "f3"),
    move("e7", "e5"),
    move("g2", "g4"),
    move("d8", "h4"),
  );
  assertEquals(inCheck(mated), true);
  assertEquals(outcome(mated), { kind: "checkmate", winner: "black" });
  assertEquals(findOrder(mated, { kind: "resign" }), null);
  assertEquals(outcome(initialState()), null);
});

Deno.test("each dead position is a draw", () => {
  const material: Outcome = { kind: "draw", reason: "material" };
  assertEquals(outcome(fromFen("4k3/8/8/8/8/8/8/4K3 w - -")), material);
  assertEquals(outcome(fromFen("4k3/8/8/8/8/8/8/2B1K3 w - -")), material);
  assertEquals(outcome(fromFen("4k3/8/8/8/8/8/8/1N2K3 w - -")), material);
  assertEquals(outcome(fromFen("1b2k3/8/8/8/8/8/8/2B1K3 w - -")), material);
  assertEquals(outcome(fromFen("2b1k3/8/8/8/8/8/8/5BK1 w - -")), material);
  assertEquals(outcome(fromFen("2b1k3/8/8/8/8/8/8/2B1K3 w - -")), null);
  assertEquals(outcome(fromFen("4k3/8/8/8/8/8/8/R3K3 w - -")), null);
  assertEquals(outcome(fromFen("4k3/8/8/8/8/8/8/1NN1K3 w - -")), null);
});

Deno.test("threefold is claimable and fivefold ends the game", () => {
  const shuffle = [
    move("g1", "f3"),
    move("g8", "f6"),
    move("f3", "g1"),
    move("f6", "g8"),
  ];
  let state = initialState();
  assertEquals(claimable(state), false);
  state = playAll(state, ...shuffle);
  assertEquals(claimable(state), false);
  state = playAll(state, ...shuffle);
  assertEquals(claimable(state), true);
  assertEquals(outcome(state), null);
  assertEquals(findOrder(state, { kind: "draw" }), { kind: "draw" });
  state = playAll(state, ...shuffle, ...shuffle);
  assertEquals(outcome(state), { kind: "draw", reason: "repetition" });
});

Deno.test("a capture or pawn move clears the history", () => {
  const state = playAll(initialState(), move("e2", "e4"));
  assertEquals(state.history.length, 1);
  assertEquals(state.halfmove, 0);
  const knights = playAll(state, move("g8", "f6"), move("g1", "f3"));
  assertEquals(knights.history.length, 3);
  assertEquals(knights.halfmove, 2);
});

Deno.test("the 50-move rule is claimable and the 75-move rule ends the game", () => {
  const near = { ...initialState(), halfmove: 99 };
  assertEquals(claimable(near), false);
  const fifty = playAll(near, move("g1", "f3"));
  assertEquals(fifty.halfmove, 100);
  assertEquals(claimable(fifty), true);
  assertEquals(outcome(fifty), null);
  assertEquals(findOrder(fifty, { kind: "draw" }), { kind: "draw" });

  const seventyFive = playAll(
    { ...initialState(), halfmove: 149 },
    move("g1", "f3"),
  );
  assertEquals(outcome(seventyFive), { kind: "draw", reason: "moves" });
  assertEquals(findOrder(seventyFive, { kind: "draw" }), null);
});

Deno.test("a draw is legal after an offer and illegal without grounds", () => {
  const state = initialState();
  assertEquals(findOrder(state, { kind: "draw" }), null);

  const offered = playAll(state, offering(move("e2", "e4")));
  assertEquals(offered.offered, true);
  assertEquals(findOrder(offered, { kind: "draw" }), { kind: "draw" });

  const agreed = apply(offered, { kind: "draw" });
  assertEquals(agreed.messages, 2);
  assertEquals(outcome(agreed), { kind: "draw", reason: "agreed" });
  assertEquals(findOrder(agreed, move("e7", "e5")), null);
  assertEquals(findOrder(agreed, { kind: "resign" }), null);
});

Deno.test("a move declines the offer", () => {
  const offered = playAll(initialState(), offering(move("e2", "e4")));
  const declined = playAll(offered, move("e7", "e5"));
  assertEquals(declined.offered, false);
  assertEquals(findOrder(declined, { kind: "draw" }), null);
});

Deno.test("resign names the other side the winner", () => {
  const state = initialState();
  assertEquals(findOrder(state, { kind: "resign" }), { kind: "resign" });
  const white = apply(state, { kind: "resign" });
  assertEquals(white.messages, 1);
  assertEquals(outcome(white), { kind: "resigned", winner: "black" });

  const black = apply(playAll(state, move("e2", "e4")), { kind: "resign" });
  assertEquals(outcome(black), { kind: "resigned", winner: "white" });
  assertEquals(findOrder(black, move("e7", "e5")), null);
});

Deno.test("findOrder returns the canonical move and keeps the offer", () => {
  const state = initialState();
  const found = findOrder(state, {
    kind: "move",
    move: { from: 12, to: 28, promotion: "q" },
    offer: true,
  });
  assertEquals(found, {
    kind: "move",
    move: { from: 12, to: 28 },
    offer: true,
  });
  assertEquals(findOrder(state, move("e2", "e5")), null);
  assertEquals(findOrder(state, move("e7", "e5")), null);

  const promoting = fromFen("4k3/P7/8/8/8/8/8/4K3 w - -");
  assertEquals(findOrder(promoting, move("a7", "a8")), null);
  assertEquals(findOrder(promoting, move("a7", "a8", "n")), {
    kind: "move",
    move: { from: square("a7"), to: square("a8"), promotion: "n" },
    offer: false,
  });
  const promoted = playAll(promoting, move("a7", "a8", "r"));
  assertEquals(promoted.board[square("a8")], { side: "white", kind: "r" });
  assertEquals(
    legalMoves(promoting).filter((m) => m.to === square("a8")).length,
    4,
  );
});

Deno.test("a stale en passant square does not spoil a repetition", () => {
  const shuffle = [
    move("g1", "f3"),
    move("g8", "f6"),
    move("f3", "g1"),
    move("f6", "g8"),
  ];
  let state = playAll(initialState(), move("e2", "e4"), move("e7", "e5"));
  assertEquals(state.enPassant, square("e6"));
  state = playAll(state, ...shuffle);
  assertEquals(claimable(state), false);
  state = playAll(state, ...shuffle);
  assertEquals(claimable(state), true);
});

Deno.test("a claimed draw records its ground", () => {
  const fifty = playAll({ ...initialState(), halfmove: 99 }, move("g1", "f3"));
  assertEquals(
    outcome(apply(fifty, { kind: "draw" })),
    { kind: "draw", reason: "moves" },
  );

  const shuffle = [
    move("g1", "f3"),
    move("g8", "f6"),
    move("f3", "g1"),
    move("f6", "g8"),
  ];
  const threefold = playAll(initialState(), ...shuffle, ...shuffle);
  assertEquals(
    outcome(apply(threefold, { kind: "draw" })),
    { kind: "draw", reason: "repetition" },
  );

  const offered = playAll(initialState(), offering(move("e2", "e4")));
  assertEquals(
    outcome(apply(offered, { kind: "draw" })),
    { kind: "draw", reason: "agreed" },
  );
});

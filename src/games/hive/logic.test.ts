import { assertEquals } from "@std/assert";
import {
  apply,
  direction,
  findMove,
  type Hex,
  hexOf,
  initialState,
  key,
  kindOf,
  legalMoves,
  type Move,
  neighbour,
  type Options,
  outcome,
  pieceId,
  type Side,
  type State,
  turn,
} from "./logic.ts";

const OFF: Options = { fpga: false, probe: false, crane: false };

const h = (slot: number) => pieceId("host", slot);
const g = (slot: number) => pieceId("guest", slot);
const MB = 0;
const CK = 1;
const HS = 3;
const JP = 5;
const PK = 8;

const at = (q: number, r: number): Hex => ({ q, r });

function position(
  pieces: [number, Hex][],
  toMove: Side = "host",
  options = OFF,
): State {
  const state = initialState(options);
  for (const [piece, hex] of pieces) {
    state.stacks.set(key(hex), [...(state.stacks.get(key(hex)) ?? []), piece]);
  }
  return { ...state, toMove };
}

function move(piece: number, to: Hex): Move {
  return { piece, to, thrown: false };
}

function hexes(moves: Move[]): string[] {
  return [...new Set(moves.map((m) => key(m.to)))].sort();
}

Deno.test("host opens at the origin with anything but the Motherboard", () => {
  const moves = legalMoves(initialState(OFF));
  assertEquals(moves.length, 10);
  assertEquals(hexes(moves), ["0,0"]);
  assertEquals(moves.some((m) => kindOf(m.piece) === "motherboard"), false);
  assertEquals(moves.some((m) => kindOf(m.piece) === "fpga"), false);
  assertEquals(legalMoves(initialState({ ...OFF, crane: true })).length, 11);
});

Deno.test("guest's first piece must touch host's piece", () => {
  const state = position([[h(JP), at(0, 0)]], "guest");
  const moves = legalMoves(state);
  assertEquals(moves.length, 60);
  assertEquals(
    moves.every((m) => direction(at(0, 0), m.to) !== null),
    true,
  );
});

Deno.test("afterwards a placement touches own pieces only", () => {
  const state = position([[h(JP), at(0, 0)], [g(JP), at(1, 0)]]);
  const moves = legalMoves(state);
  assertEquals(moves.length > 0, true);
  for (const m of moves) {
    assertEquals(hexOf(state, m.piece), null);
    assertEquals(direction(at(0, 0), m.to) !== null, true);
    assertEquals(direction(at(1, 0), m.to), null);
  }
});

Deno.test("the Motherboard is forced by the fourth turn", () => {
  const three = position([
    [h(JP), at(0, 0)],
    [h(CK), at(-1, 0)],
    [h(PK), at(-2, 0)],
    [g(JP), at(1, 0)],
    [g(CK), at(2, 0)],
    [g(PK), at(3, 0)],
  ]);
  const moves = legalMoves(three);
  assertEquals(moves.length > 0, true);
  assertEquals(moves.every((m) => m.piece === h(MB)), true);

  const two = position([
    [h(JP), at(0, 0)],
    [h(CK), at(-1, 0)],
    [g(JP), at(1, 0)],
    [g(CK), at(2, 0)],
  ]);
  const kinds = new Set(legalMoves(two).map((m) => kindOf(m.piece)));
  assertEquals(kinds.has("motherboard"), true);
  assertEquals(kinds.has("packet"), true);
});

Deno.test("nothing moves before the Motherboard is down", () => {
  const before = position([
    [h(JP), at(0, 0)],
    [h(CK), at(-1, 0)],
    [g(MB), at(1, 0)],
  ]);
  assertEquals(
    legalMoves(before).every((m) => hexOf(before, m.piece) === null),
    true,
  );
  const after = apply(before, findMove(before, move(h(MB), at(-2, 0)))!);
  const again = { ...after, toMove: "host" as const };
  assertEquals(legalMoves(again).some((m) => m.piece === h(MB)), true);
});

Deno.test("a bridge piece cannot lift (One Hive)", () => {
  const state = position([
    [h(JP), at(-1, 0)],
    [h(MB), at(0, 0)],
    [g(MB), at(1, 0)],
  ]);
  const moves = legalMoves(state);
  assertEquals(moves.some((m) => m.piece === h(MB)), false);
  assertEquals(findMove(state, move(h(JP), at(2, 0))) !== null, true);
});

const POCKET: [number, Hex][] = [
  [h(MB), at(0, -1)],
  [g(MB), at(1, -2)],
  [g(PK), at(2, -2)],
  [g(PK + 1), at(2, -1)],
  [g(JP), at(1, 0)],
];

Deno.test("the gate blocks a slide but not a Jumper", () => {
  const state = position([...POCKET, [h(PK), at(0, 0)], [h(JP), at(1, -3)]]);
  assertEquals(findMove(state, move(h(PK), at(1, -1))), null);
  assertEquals(findMove(state, move(h(PK), at(-1, 0))) !== null, true);
  assertEquals(findMove(state, move(h(JP), at(1, -1))) !== null, true);
});

Deno.test("a Clock slides exactly three without revisiting", () => {
  const state = position([
    [h(CK), at(-1, 0)],
    [h(MB), at(0, 0)],
    [g(MB), at(1, 0)],
  ]);
  const clock = legalMoves(state).filter((m) => m.piece === h(CK));
  assertEquals(hexes(clock), ["1,1", "2,-1"]);
});

Deno.test("a Heatsink climbs, pins, and passes the beetle gate from height", () => {
  const state = position([
    [h(HS), at(-1, 0)],
    [h(MB), at(0, 0)],
    [g(MB), at(1, 0)],
  ]);
  const heatsink = legalMoves(state).filter((m) => m.piece === h(HS));
  assertEquals(hexes(heatsink), ["-1,1", "0,-1", "0,0"]);

  const climbed = apply(state, move(h(HS), at(0, 0)));
  assertEquals(climbed.stacks.get("0,0"), [h(MB), h(HS)]);
  assertEquals(hexOf(climbed, h(HS)), at(0, 0));
  assertEquals(state.stacks.get("0,0"), [h(MB)]);
  const again = { ...climbed, toMove: "host" as const };
  assertEquals(legalMoves(again).some((m) => m.piece === h(MB)), false);

  const low = position([...POCKET, [h(HS), at(0, 0)]]);
  assertEquals(findMove(low, move(h(HS), at(1, -1))), null);
  const high = position([...POCKET, [g(CK), at(0, 0)], [h(HS), at(0, 0)]]);
  assertEquals(findMove(high, move(h(HS), at(1, -1))) !== null, true);
});

Deno.test("a Packet reaches every perimeter hex", () => {
  const state = position([
    [h(PK), at(-1, 0)],
    [h(MB), at(0, 0)],
    [g(MB), at(1, 0)],
  ]);
  const packet = legalMoves(state).filter((m) => m.piece === h(PK));
  assertEquals(
    hexes(packet),
    ["-1,1", "0,-1", "0,1", "1,-1", "1,1", "2,-1", "2,0"],
  );
});

function ring(centre: Hex, pieces: number[]): [number, Hex][] {
  return pieces.map((piece, dir) => [piece, neighbour(centre, dir)]);
}

Deno.test("a surrounded Motherboard loses; both at once is a draw", () => {
  const win = position([
    [g(MB), at(0, 0)],
    ...ring(at(0, 0), [h(MB), h(CK), h(HS), g(CK), g(HS), g(JP)]),
  ]);
  assertEquals(outcome(win), "host");
  assertEquals(legalMoves(win), []);

  const draw = position([
    [h(MB), at(0, 0)],
    [g(MB), at(1, 0)],
    ...ring(at(0, 0), [h(CK), g(MB), h(HS), g(CK), g(HS), g(JP)]).filter((
      [piece],
    ) => piece !== g(MB)),
    [h(JP), at(2, -1)],
    [h(PK), at(2, 0)],
    [h(CK + 1), at(1, 1)],
  ]);
  assertEquals(outcome(draw), "draw");
  assertEquals(outcome(initialState(OFF)), null);
});

Deno.test("a locked side's turn passes back to the mover", () => {
  const state = position([
    [h(HS), at(-1, 0)],
    [g(MB), at(0, 0)],
    [h(MB), at(1, 0)],
  ]);
  const next = apply(state, findMove(state, move(h(HS), at(0, 0)))!);
  assertEquals(next.moves, 1);
  assertEquals(next.last, { piece: h(HS), thrown: false });
  assertEquals(turn(next), "host");
  assertEquals(outcome(next), null);
  assertEquals(legalMoves({ ...next, toMove: "guest" }), []);

  const open = apply(state, findMove(state, move(h(HS), at(0, -1)))!);
  assertEquals(turn(open), "guest");
});

Deno.test("direction inverts neighbour for every direction", () => {
  const from = at(3, -2);
  for (let dir = 0; dir < 6; dir++) {
    assertEquals(direction(from, neighbour(from, dir)), dir);
  }
  assertEquals(direction(from, from), null);
  assertEquals(direction(from, at(5, -2)), null);
});

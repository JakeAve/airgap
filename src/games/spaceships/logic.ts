import type { Leg } from "@/lib/frames/frames.ts";

/** Message kinds: a turn's shot, and the fleet shown once the game is over. */
export const SHOT = 0;
export const REVEAL = 1;

export const GRID = 10;
const CELLS = GRID * GRID;

export const SHIPS: readonly { name: string; length: number }[] = [
  { name: "Mothership", length: 5 },
  { name: "Dreadnought", length: 4 },
  { name: "Cruiser", length: 3 },
  { name: "Scout", length: 3 },
  { name: "Probe", length: 2 },
];

/** Bow is the top cell of a vertical ship, the left cell of a horizontal one. */
export interface Placement {
  bow: number;
  vertical: boolean;
}

export type Fleet = Placement[];

/** Empty when the ship leaves the grid; a horizontal ship may not wrap a row. */
export function cells(ship: number, p: Placement): number[] {
  const length = SHIPS[ship]?.length;
  if (!length || !Number.isInteger(p.bow) || p.bow < 0 || p.bow >= CELLS) {
    return [];
  }
  const step = p.vertical ? GRID : 1;
  const stern = p.bow + step * (length - 1);
  if (stern >= CELLS) return [];
  if (!p.vertical && Math.floor(stern / GRID) !== Math.floor(p.bow / GRID)) {
    return [];
  }
  return Array.from({ length }, (_, i) => p.bow + step * i);
}

export function canPlace(
  fleet: (Placement | null)[],
  ship: number,
  p: Placement,
): boolean {
  const taken = cells(ship, p);
  if (taken.length === 0) return false;
  return fleet.every((other, i) =>
    i === ship || !other || !cells(i, other).some((c) => taken.includes(c))
  );
}

export function randomFleet(random: () => number = Math.random): Fleet {
  const fleet: (Placement | null)[] = new Array(SHIPS.length).fill(null);
  for (let ship = 0; ship < SHIPS.length; ship++) {
    const options: Placement[] = [];
    for (let bow = 0; bow < CELLS; bow++) {
      for (const vertical of [false, true]) {
        if (canPlace(fleet, ship, { bow, vertical })) {
          options.push({ bow, vertical });
        }
      }
    }
    fleet[ship] = options[
      Math.min(options.length - 1, Math.floor(random() * options.length))
    ];
  }
  return fleet as Fleet;
}

/** `ship` is named only when the shot sank it: a hit never says what it hit. */
export interface Result {
  outcome: "miss" | "hit" | "sunk";
  ship: number | null;
}

export function shipAt(fleet: Fleet, cell: number): number {
  return fleet.findIndex((p, i) => cells(i, p).includes(cell));
}

export function fire(fleet: Fleet, before: number[], cell: number): Result {
  const ship = shipAt(fleet, cell);
  if (ship < 0) return { outcome: "miss", ship: null };
  const hit = new Set(before).add(cell);
  return cells(ship, fleet[ship]).every((c) => hit.has(c))
    ? { outcome: "sunk", ship }
    : { outcome: "hit", ship: null };
}

export function allSunk(fleet: Fleet, shots: number[]): boolean {
  const hit = new Set(shots);
  return fleet.every((p, i) => cells(i, p).every((c) => hit.has(c)));
}

export interface Game {
  fleet: Fleet;
  /** My shots at their fleet; the newest is pending until their reply names it. */
  mine: { cell: number; result: Result | null }[];
  theirs: { cell: number; result: Result }[];
  count: number;
}

export function newGame(fleet: Fleet): Game {
  return { fleet, mine: [], theirs: [], count: 0 };
}

export function myTurn(game: Game, role: "host" | "guest"): boolean {
  return (game.count % 2 === 0) === (role === "host");
}

export function isLegalShot(game: Game, cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < CELLS &&
    !game.mine.some((shot) => shot.cell === cell) && outcome(game) === null;
}

export function shoot(game: Game, cell: number): Game {
  if (!isLegalShot(game, cell)) {
    throw new Error(`illegal shot: ${cell}`);
  }
  return {
    ...game,
    mine: [...game.mine, { cell, result: null }],
    count: game.count + 1,
  };
}

export function receiveShot(
  game: Game,
  result: Result | null,
  cell: number,
): Game {
  const mine = game.mine.slice();
  const pending = mine.length - 1;
  if (pending >= 0 && mine[pending].result === null) {
    mine[pending] = { cell: mine[pending].cell, result };
  }
  const before = game.theirs.map((shot) => shot.cell);
  return {
    ...game,
    mine,
    theirs: [...game.theirs, { cell, result: fire(game.fleet, before, cell) }],
    count: game.count + 1,
  };
}

/** The loser's reveal ends its game; it counts as one message like a shot. */
export function reveal(game: Game): Game {
  return { ...game, count: game.count + 1 };
}

/** A reveal carries no result, so my pending shot is scored from the fleet shown. */
export function receiveReveal(game: Game, fleet: Fleet): Game {
  const mine = game.mine.slice();
  const last = mine.at(-1);
  if (last && last.result === null) {
    const before = mine.slice(0, -1).map((shot) => shot.cell);
    mine[mine.length - 1] = {
      cell: last.cell,
      result: fire(fleet, before, last.cell),
    };
  }
  return { ...game, mine, count: game.count + 1 };
}

export function lastResult(game: Game): Result | null {
  return game.theirs.at(-1)?.result ?? null;
}

export function shipsLeft(game: Game): number {
  return SHIPS.length -
    game.mine.filter((shot) => shot.result?.outcome === "sunk").length;
}

export function outcome(game: Game): "won" | "lost" | null {
  if (shipsLeft(game) === 0) return "won";
  return allSunk(game.fleet, game.theirs.map((shot) => shot.cell))
    ? "lost"
    : null;
}

/**
 * The counts the next incoming message may carry: the peer's next message,
 * and once the game is over, a repeat of its last one, which means my reply
 * was lost and should go again. Nothing answers the winner's reveal, so only
 * the repeat is left for it.
 */
export function awaitedCounts(game: Game): number[] {
  switch (outcome(game)) {
    case "won":
      return [game.count - 2];
    case "lost":
      return [game.count, game.count - 2];
    default:
      return [game.count];
  }
}

/**
 * `previous` is the last game's session: after a replay its final shot can
 * still be in the air, and on a fresh game it would pass for shot 0.
 */
export function accepts(
  counts: number[],
  session: number | undefined,
  leg: Leg,
  previous?: number,
): boolean {
  if (leg.type !== SHOT && leg.type !== REVEAL) return false;
  const count = counts.find((c) => c >= 0 && leg.seq === c % 4);
  if (count === undefined) return false;
  return session === undefined
    ? count === 0 && leg.session !== previous
    : leg.session === session;
}

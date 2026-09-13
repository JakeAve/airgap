// A SHOT carries the result of their last shot at my fleet plus the cell I am
// firing at, so one message per turn does both jobs. A REVEAL shows my fleet
// once the game is over.
import {
  canPlace,
  type Fleet,
  type Placement,
  type Result,
  SHIPS,
} from "./logic.ts";

export { REVEAL, SHOT } from "./logic.ts";

const OUTCOMES = ["miss", "hit", "sunk"] as const;

/** Byte 0: result in bits 0-1, ship in bits 2-4 when sunk. Byte 1: cell 0-99. */
export function encodeShot(result: Result | null, cell: number): Uint8Array {
  const code = result === null ? 0 : OUTCOMES.indexOf(result.outcome) + 1;
  const ship = result?.outcome === "sunk" ? result.ship ?? 0 : 0;
  return new Uint8Array([code | (ship << 2), cell]);
}

export function decodeShot(
  payload: Uint8Array,
): { result: Result | null; cell: number } | null {
  if (payload.length < 2) return null;
  const code = payload[0] & 3;
  const ship = payload[0] >> 2;
  const cell = payload[1];
  if (cell > 99) return null;
  if (code === 3 ? ship >= SHIPS.length : ship !== 0) return null;
  return {
    result: code === 0
      ? null
      : { outcome: OUTCOMES[code - 1], ship: code === 3 ? ship : null },
    cell,
  };
}

/** One byte per ship, in SHIPS order: bow, plus 0x80 when vertical. */
export function encodeReveal(fleet: Fleet): Uint8Array {
  return new Uint8Array(fleet.map((p) => p.bow | (p.vertical ? 0x80 : 0)));
}

/** Null for any fleet `canPlace` would reject; padding past the fleet is ignored. */
export function decodeReveal(payload: Uint8Array): Fleet | null {
  if (payload.length < SHIPS.length) return null;
  const fleet: (Placement | null)[] = new Array(SHIPS.length).fill(null);
  for (let ship = 0; ship < SHIPS.length; ship++) {
    const byte = payload[ship];
    const p = { bow: byte & 0x7f, vertical: (byte & 0x80) !== 0 };
    if (!canPlace(fleet, ship, p)) return null;
    fleet[ship] = p;
  }
  return fleet as Fleet;
}

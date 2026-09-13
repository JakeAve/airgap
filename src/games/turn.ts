import type { Leg } from "@/lib/frames/frames.ts";

export type Role = "host" | "guest";

/** The only leg type a turn game sends: one move, no handshake. */
export const MOVE = 0;

/**
 * `previous` is the last game's session: after a replay its final move can
 * still be in the air, and before the first move it would pass for move 0.
 */
export function accepts(
  moveCount: number,
  session: number | undefined,
  leg: Leg,
  previous?: number,
): boolean {
  if (leg.type !== MOVE || leg.seq !== moveCount % 4) return false;
  return session === undefined
    ? moveCount === 0 && leg.session !== previous
    : leg.session === session;
}

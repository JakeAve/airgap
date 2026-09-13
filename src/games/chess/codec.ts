// Wire layout, 16 bits: kind 2 | from 6 | to 6 | promotion 2. kind 0 move,
// 1 move with a draw offer, 2 draw, 3 resign; promotion 0 queen, 1 rook,
// 2 bishop, 3 knight. A decoded move always carries a promotion, even when
// none applies; findOrder is what decides whether it does.

import { BitReader, BitWriter } from "@/lib/bits/mod.ts";
import type { Kind, Order } from "./logic.ts";
import { squareName } from "./logic.ts";

const KIND_BITS = 2;
const SQUARE_BITS = 6;
const PROMOTION_BITS = 2;

export const PROMOTIONS: readonly Kind[] = ["q", "r", "b", "n"];

export function encodeOrder(order: Order): Uint8Array {
  const writer = new BitWriter();
  switch (order.kind) {
    case "move": {
      const promotion = PROMOTIONS.indexOf(order.move.promotion ?? "q");
      writer
        .write(order.offer ? 1 : 0, KIND_BITS)
        .write(order.move.from, SQUARE_BITS)
        .write(order.move.to, SQUARE_BITS)
        .write(promotion, PROMOTION_BITS);
      break;
    }
    case "draw":
      writer.write(2, KIND_BITS).write(0, SQUARE_BITS).write(0, SQUARE_BITS)
        .write(0, PROMOTION_BITS);
      break;
    case "resign":
      writer.write(3, KIND_BITS).write(0, SQUARE_BITS).write(0, SQUARE_BITS)
        .write(0, PROMOTION_BITS);
      break;
  }
  return writer.bytes();
}

export function decodeOrder(payload: Uint8Array): Order | null {
  if (payload.length < 2) return null;
  const reader = new BitReader(payload);
  const kind = reader.read(KIND_BITS);
  const from = reader.read(SQUARE_BITS);
  const to = reader.read(SQUARE_BITS);
  const promotion = reader.read(PROMOTION_BITS);
  switch (kind) {
    case 0:
    case 1:
      return {
        kind: "move",
        move: { from, to, promotion: PROMOTIONS[promotion] },
        offer: kind === 1,
      };
    case 2:
      return from === 0 && to === 0 && promotion === 0
        ? { kind: "draw" }
        : null;
    default:
      return from === 0 && to === 0 && promotion === 0
        ? { kind: "resign" }
        : null;
  }
}

export function describeOrder(order: Order | null): string {
  if (order === null) return "unknown";
  switch (order.kind) {
    case "draw":
      return "draw";
    case "resign":
      return "resign";
    case "move": {
      let text = squareName(order.move.from) + squareName(order.move.to);
      if (order.move.promotion && order.move.promotion !== "q") {
        text += order.move.promotion;
      }
      if (order.offer) text += " offering a draw";
      return text;
    }
  }
}

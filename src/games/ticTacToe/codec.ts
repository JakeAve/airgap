// Tic-tac-toe's move payload: one byte holding the cell index, 0-8.

export function encodeMove(cell: number): Uint8Array {
  return new Uint8Array([cell]);
}

/** Null when the first byte is not 0-8, or the payload is empty. */
export function decodeMove(payload: Uint8Array): number | null {
  if (payload.length === 0) return null;
  const cell = payload[0];
  return cell <= 8 ? cell : null;
}

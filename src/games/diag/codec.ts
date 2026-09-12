// The diagnostics page's "game": free text, five bits a character, zero for
// padding. Three characters per frame, twelve per message.
import { BitReader, BitWriter } from "@/lib/bits/mod.ts";
import { MAX_PAYLOAD_BYTES } from "@/lib/protocol.ts";

export const ALPHABET = " abcdefghijklmnopqrstuvwxyz.,?!";
const CHAR_BITS = 5;
export const MAX_TEXT_LENGTH = Math.floor(MAX_PAYLOAD_BYTES * 8 / CHAR_BITS);

/** Characters outside the alphabet become spaces; case is dropped. */
export function encodeText(text: string): Uint8Array {
  const w = new BitWriter();
  for (const ch of text.toLowerCase().slice(0, MAX_TEXT_LENGTH)) {
    const i = ALPHABET.indexOf(ch);
    w.write(i < 0 ? 1 : i + 1, CHAR_BITS);
  }
  return w.bytes();
}

export function decodeText(payload: Uint8Array): string {
  const r = new BitReader(payload);
  let out = "";
  while (r.remaining >= CHAR_BITS) {
    const i = r.read(CHAR_BITS);
    if (i === 0) break;
    out += ALPHABET[i - 1];
  }
  return out;
}

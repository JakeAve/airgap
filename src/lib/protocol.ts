// Wire protocol constants shared by every game and transport. Both devices in
// a session must run the same build; there is no version field, because a
// build with a different frame layout simply never decodes.

/**
 * Every transport moves frames of exactly this many bytes. Sound sends one
 * frame per ggwave transmission; QR packs a whole message into one code.
 * ggwave costs one transmit slot per 3 bytes of frame plus error correction,
 * so 5 bytes is the largest frame that fits in 3 slots.
 */
export const FRAME_BYTES = 5;
export const FRAME_BITS = FRAME_BYTES * 8;

/** Frame layout: type 2 | seq 2 | session 8 | index 2 | total-1 2 | payload 16 | crc8. */
export const TYPE_BITS = 2;
export const SEQ_BITS = 2;
export const SESSION_BITS = 8;
export const INDEX_BITS = 2;
export const FRAME_PAYLOAD_BYTES = 2;
export const FRAME_CRC_BYTES = 1;

export const MAX_TYPE = 2 ** TYPE_BITS - 1;
export const MAX_SEQ = 2 ** SEQ_BITS - 1;
export const MAX_SESSION = 2 ** SESSION_BITS - 1;
export const MAX_FRAMES_PER_MESSAGE = 2 ** INDEX_BITS;
export const MAX_PAYLOAD_BYTES = MAX_FRAMES_PER_MESSAGE * FRAME_PAYLOAD_BYTES;

/** Largest ggwave fixed-length payload. */
export const GGWAVE_MAX_FIXED_PAYLOAD_BYTES = 64;

/** Sample rate ggwave is configured for; AudioContexts are created at this rate. */
export const SOUND_SAMPLE_RATE = 48_000;

/** ggwave only consumes audio in blocks of this many samples; smaller pushes are dropped. */
export const SOUND_SAMPLES_PER_BLOCK = 1024;

// Wire protocol constants shared by every game and transport. Both devices in
// a session must run the same PROTOCOL_VERSION; changing any constant here that
// affects bytes on the wire requires bumping it.

export const PROTOCOL_VERSION = 1;

/**
 * Every transport moves frames of exactly this many bytes. Sound sends one
 * frame per ggwave transmission; QR packs several frames into one code.
 */
export const FRAME_BYTES = 16;
export const FRAME_HEADER_BYTES = 2;
export const FRAME_CRC_BYTES = 1;
export const FRAME_PAYLOAD_BYTES = FRAME_BYTES - FRAME_HEADER_BYTES -
  FRAME_CRC_BYTES;

/** Frame index and total are 6-bit fields. */
export const MAX_FRAMES_PER_MESSAGE = 64;
export const MAX_MESSAGE_BYTES = MAX_FRAMES_PER_MESSAGE * FRAME_PAYLOAD_BYTES;

/** Message ids are 4-bit; the sender increments per message so a receiver can tell a new message from stale frames of the previous one. */
export const MAX_MESSAGE_ID = 15;

export const ENVELOPE_HEADER_BYTES = 5;
export const MAX_ENVELOPE_PAYLOAD_BYTES = MAX_MESSAGE_BYTES -
  ENVELOPE_HEADER_BYTES;

/** Largest ggwave fixed-length payload. */
export const GGWAVE_MAX_FIXED_PAYLOAD_BYTES = 64;

/** Sample rate ggwave is configured for; AudioContexts are created at this rate. */
export const SOUND_SAMPLE_RATE = 48_000;

/** ggwave only consumes audio in blocks of this many samples; smaller pushes are dropped. */
export const SOUND_SAMPLES_PER_BLOCK = 1024;

/** Frames per QR code; 32 frames is 512 bytes, which phones scan reliably at close range. */
export const QR_MAX_FRAMES_PER_CODE = 32;

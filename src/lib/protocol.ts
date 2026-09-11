// Wire protocol constants shared by every game and transport. Both devices in
// a session must run the same PROTOCOL_VERSION; changing any constant here that
// affects bytes on the wire requires bumping it.

export const PROTOCOL_VERSION = 1;

/** Bytes per sound frame. ggwave fixed-length payloads cap at 64. */
export const SOUND_FRAME_BYTES = 16;

/** Largest ggwave fixed-length payload. */
export const SOUND_FRAME_MAX_BYTES = 64;

/** Sample rate ggwave is configured for; AudioContexts are created at this rate. */
export const SOUND_SAMPLE_RATE = 48_000;

/** Upper bound on bytes per QR frame, well under the 2,953-byte QR limit for reliable phone scanning. */
export const QR_FRAME_MAX_BYTES = 512;

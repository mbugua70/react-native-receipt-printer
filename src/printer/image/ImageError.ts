/**
 * Why an image couldn't be prepared for printing.
 *
 * - `INVALID_SOURCE`      — the source is missing, malformed, or the file/asset doesn't exist
 * - `NETWORK`             — downloading a remote image failed
 * - `UNSUPPORTED_FORMAT`  — the bytes aren't an image format the device can decode
 * - `DECODE_FAILED`       — the image looks valid but is corrupted / couldn't be decoded
 * - `INVALID_DIMENSIONS`  — width, height, threshold or a bitmap's size is invalid
 * - `TOO_LARGE`           — wider than the paper (with `overflow: 'error'`), or too big to process
 * - `NATIVE_UNAVAILABLE`  — the installed app binary predates image support; rebuild the app
 * - `NOT_PREPARED`        — `encode()` / `encodeBytes()` got an image that wasn't prepared first
 */
export type ImageErrorCode =
  | 'INVALID_SOURCE'
  | 'NETWORK'
  | 'UNSUPPORTED_FORMAT'
  | 'DECODE_FAILED'
  | 'INVALID_DIMENSIONS'
  | 'TOO_LARGE'
  | 'NATIVE_UNAVAILABLE'
  | 'NOT_PREPARED';

/**
 * Thrown when an image line can't be turned into printable data. Nothing is
 * sent to the printer when this is thrown — a receipt never prints with a
 * missing or half-decoded image.
 */
export class ImageError extends Error {
  readonly code: ImageErrorCode;
  readonly cause: unknown;

  constructor(code: ImageErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ImageError';
    this.code = code;
    this.cause = cause;
  }
}

const NATIVE_CODES: readonly ImageErrorCode[] = [
  'INVALID_SOURCE',
  'NETWORK',
  'UNSUPPORTED_FORMAT',
  'DECODE_FAILED',
  'TOO_LARGE',
];

/** Turn a native promise rejection into an `ImageError`. */
export function toImageError(err: unknown): ImageError {
  if (err instanceof ImageError) return err;
  const code = (err as { code?: unknown } | null)?.code;
  const message =
    (err as { message?: unknown } | null)?.message ?? String(err ?? '');
  const known = NATIVE_CODES.find((c) => c === code);
  return new ImageError(
    known ?? 'DECODE_FAILED',
    String(message) || 'The image could not be processed.',
    err
  );
}

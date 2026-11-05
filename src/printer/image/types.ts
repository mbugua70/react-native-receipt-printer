// ─── Image types ──────────────────────────────────────────────────────────────
//
// Shared by the builder, the encoder and the image pipeline. Kept free of
// runtime code so any module can import them without pulling in native bits.

/**
 * A ready-to-print 1-bit image.
 *
 * Rows are packed left to right, 8 pixels per byte, most significant bit
 * first; a set bit (1) prints black. Each row is `Math.ceil(width / 8)`
 * bytes, and unused bits at the end of a row are 0 (white).
 *
 * `data` may be a `Uint8Array` or — for backend JSON — a base64 string of
 * the same bytes.
 */
export type MonochromeBitmap = {
  width: number;
  height: number;
  data: Uint8Array | string;
};

/**
 * Where an image comes from.
 *
 * - `'https://…'` / `'http://…'` — downloaded by the native side
 * - `'file://…'`, `'content://…'` — a local file (Android content URIs too)
 * - `'data:image/png;base64,…'`  — inline base64
 * - `{ uri }`                     — same as a URI string
 * - `{ base64 }`                  — raw base64 PNG / JPEG bytes (no `data:` prefix)
 * - `require('./logo.png')`       — a bundled asset (number)
 * - a `MonochromeBitmap`          — already processed (e.g. from `prepareImage()`),
 *                                   printed as-is with no decoding
 */
export type ImageSource =
  | string
  | number
  | { uri: string }
  | { base64: string }
  | MonochromeBitmap;

/**
 * How grayscale becomes black and white.
 *
 * - `threshold`       — every pixel darker than `threshold` prints black.
 *                       Sharpest result for logos and text. (default)
 * - `floyd-steinberg` — error diffusion; best for photos and gradients.
 * - `atkinson`        — lighter error diffusion; keeps highlights clean.
 */
export type DitherMode = 'threshold' | 'floyd-steinberg' | 'atkinson';

/**
 * Which ESC/POS command prints the image.
 *
 * - `raster`   — `GS v 0`, supported by most modern ESC/POS printers. (default)
 * - `bitImage` — `ESC *` 24-dot double density, for older printers that
 *                ignore `GS v 0`.
 */
export type ImageMode = 'raster' | 'bitImage';

/** Options that control how an image source is turned into a bitmap. */
export type ImageProcessingOptions = {
  /** Target width in printer dots. Default: the image's own width, capped at the printable width. */
  width?: number;
  /** Target height in dots. Default: follows `width` to keep the aspect ratio. */
  height?: number;
  /**
   * When both `width` and `height` are set:
   * - `contain` — fit inside the box, keeping the aspect ratio (default)
   * - `stretch` — use exactly `width` × `height`
   */
  fit?: 'contain' | 'stretch';
  /**
   * When the image is wider than the printable width:
   * - `shrink` — scale it down to fit, keeping the aspect ratio (default)
   * - `error`  — throw an `ImageError` with code `TOO_LARGE`
   */
  overflow?: 'shrink' | 'error';
  /** Default: `threshold`. */
  dither?: DitherMode;
  /** 0–255 cut-off for `threshold` dithering. Default: 128. */
  threshold?: number;
  /** Swap black and white. Default: false. */
  invert?: boolean;
  /**
   * Extra cache identity — bump it when the image behind the same URL
   * changes (e.g. a new logo version) so the old bitmap isn't reused.
   */
  cacheKey?: string;
};

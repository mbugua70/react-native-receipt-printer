/* eslint-disable no-bitwise -- packing pixels into ESC/POS bytes */
import { base64ToBytes } from './binary';
import { ImageError } from './ImageError';
import type {
  DitherMode,
  ImageProcessingOptions,
  MonochromeBitmap,
} from './types';

// ─── Limits ───────────────────────────────────────────────────────────────────

/** Tallest image we'll print, in dots (≈ 51cm at 203 DPI). */
export const MAX_IMAGE_HEIGHT = 4096;

/** Widest printable area we accept for any printer, in dots. */
export const MAX_PRINTABLE_DOTS = 2048;

// ─── Validation ───────────────────────────────────────────────────────────────

function checkDimension(name: string, value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value <= 0) {
    throw new ImageError(
      'INVALID_DIMENSIONS',
      `Image ${name} must be a positive whole number of dots, got ${value}.`
    );
  }
}

/** Throws `ImageError('INVALID_DIMENSIONS')` for any out-of-range option. */
export function validateProcessingOptions(
  options: ImageProcessingOptions
): void {
  checkDimension('width', options.width);
  checkDimension('height', options.height);
  const t = options.threshold;
  if (t !== undefined && !(Number.isFinite(t) && t >= 0 && t <= 255)) {
    throw new ImageError(
      'INVALID_DIMENSIONS',
      `Image threshold must be between 0 and 255, got ${t}.`
    );
  }
  if (
    options.dither !== undefined &&
    !['threshold', 'floyd-steinberg', 'atkinson'].includes(options.dither)
  ) {
    throw new ImageError(
      'INVALID_DIMENSIONS',
      `Unknown dither mode "${options.dither}".`
    );
  }
}

export function validatePrintableDots(dots: number): void {
  if (!Number.isInteger(dots) || dots <= 0 || dots > MAX_PRINTABLE_DOTS) {
    throw new ImageError(
      'INVALID_DIMENSIONS',
      `printableDots must be a whole number between 1 and ${MAX_PRINTABLE_DOTS}, got ${dots}.`
    );
  }
}

// ─── Target size ──────────────────────────────────────────────────────────────

/**
 * The size an image of `naturalWidth` × `naturalHeight` will print at.
 * Keeps the aspect ratio unless both sides are given with `fit: 'stretch'`,
 * and never exceeds `printableDots` (shrinks, or throws with `overflow: 'error'`).
 */
export function computeTargetSize(
  naturalWidth: number,
  naturalHeight: number,
  options: ImageProcessingOptions,
  printableDots: number
): { width: number; height: number } {
  if (!(naturalWidth > 0 && naturalHeight > 0)) {
    throw new ImageError(
      'DECODE_FAILED',
      `Decoded image has no pixels (${naturalWidth}×${naturalHeight}).`
    );
  }

  const { width: w0, height: h0, fit = 'contain' } = options;
  let width: number;
  let height: number;

  if (w0 && h0) {
    if (fit === 'stretch') {
      width = w0;
      height = h0;
    } else {
      const scale = Math.min(w0 / naturalWidth, h0 / naturalHeight);
      width = Math.round(naturalWidth * scale);
      height = Math.round(naturalHeight * scale);
    }
  } else if (w0) {
    width = w0;
    height = Math.round((naturalHeight * w0) / naturalWidth);
  } else if (h0) {
    height = h0;
    width = Math.round((naturalWidth * h0) / naturalHeight);
  } else {
    width = naturalWidth;
    height = naturalHeight;
  }

  width = Math.max(1, width);
  height = Math.max(1, height);

  if (width > printableDots) {
    if (options.overflow === 'error') {
      throw new ImageError(
        'TOO_LARGE',
        `Image is ${width} dots wide but the paper prints at most ${printableDots}.`
      );
    }
    height = Math.max(1, Math.round((height * printableDots) / width));
    width = printableDots;
  }

  if (height > MAX_IMAGE_HEIGHT) {
    throw new ImageError(
      'TOO_LARGE',
      `Image would be ${height} dots tall; the limit is ${MAX_IMAGE_HEIGHT}.`
    );
  }

  return { width, height };
}

// ─── Resize ───────────────────────────────────────────────────────────────────
//
// Area-averaging (box) resampling, done as two 1-D passes. Each output pixel
// is the coverage-weighted mean of the source pixels under it — clean
// downscaling without aliasing, and a plain nearest-pixel blow-up when
// enlarging (fine for 1-bit output).

type Weights = { start: Int32Array; count: Int32Array; w: Float32Array };

function buildWeights(srcLen: number, dstLen: number): Weights {
  const scale = srcLen / dstLen;
  const start = new Int32Array(dstLen);
  const count = new Int32Array(dstLen);
  const maxTaps = Math.ceil(scale) + 1;
  const w = new Float32Array(dstLen * maxTaps);

  for (let d = 0; d < dstLen; d++) {
    const x0 = d * scale;
    const x1 = Math.min(srcLen, (d + 1) * scale);
    const first = Math.floor(x0);
    const last = Math.min(srcLen - 1, Math.ceil(x1) - 1);
    let total = 0;
    let n = 0;
    for (let s = first; s <= last && n < maxTaps; s++, n++) {
      const cover = Math.min(x1, s + 1) - Math.max(x0, s);
      w[d * maxTaps + n] = cover;
      total += cover;
    }
    for (let k = 0; k < n; k++) w[d * maxTaps + k]! /= total || 1;
    start[d] = first;
    count[d] = n;
  }
  return { start, count, w };
}

/** Resize an 8-bit grayscale image (row-major, 0 = black, 255 = white). */
export function resizeGray(
  src: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Uint8Array {
  if (srcWidth === dstWidth && srcHeight === dstHeight) return src;

  const hw = buildWeights(srcWidth, dstWidth);
  const hTaps = hw.w.length / dstWidth;
  const tmp = new Float32Array(dstWidth * srcHeight);

  for (let y = 0; y < srcHeight; y++) {
    const row = y * srcWidth;
    for (let x = 0; x < dstWidth; x++) {
      let acc = 0;
      const s = hw.start[x]!;
      const n = hw.count[x]!;
      for (let k = 0; k < n; k++)
        acc += src[row + s + k]! * hw.w[x * hTaps + k]!;
      tmp[y * dstWidth + x] = acc;
    }
  }

  const vw = buildWeights(srcHeight, dstHeight);
  const vTaps = vw.w.length / dstHeight;
  const out = new Uint8Array(dstWidth * dstHeight);

  for (let y = 0; y < dstHeight; y++) {
    const s = vw.start[y]!;
    const n = vw.count[y]!;
    for (let x = 0; x < dstWidth; x++) {
      let acc = 0;
      for (let k = 0; k < n; k++) {
        acc += tmp[(s + k) * dstWidth + x]! * vw.w[y * vTaps + k]!;
      }
      out[y * dstWidth + x] = Math.max(0, Math.min(255, Math.round(acc)));
    }
  }
  return out;
}

// ─── Monochrome conversion ────────────────────────────────────────────────────

/** Bytes in one packed row of a `width`-dot bitmap. */
export function bytesPerRow(width: number): number {
  return Math.ceil(width / 8);
}

function diffuse(
  buf: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  error: number,
  mode: Exclude<DitherMode, 'threshold'>
): void {
  const add = (dx: number, dy: number, f: number) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= width || ny >= height) return;
    buf[ny * width + nx]! += error * f;
  };
  if (mode === 'floyd-steinberg') {
    add(1, 0, 7 / 16);
    add(-1, 1, 3 / 16);
    add(0, 1, 5 / 16);
    add(1, 1, 1 / 16);
  } else {
    // Atkinson spreads only 6/8 of the error — highlights stay white
    const f = 1 / 8;
    add(1, 0, f);
    add(2, 0, f);
    add(-1, 1, f);
    add(0, 1, f);
    add(1, 1, f);
    add(0, 2, f);
  }
}

/**
 * Grayscale (0 = black, 255 = white) → packed 1-bit bitmap.
 * A pixel prints black when its (dithered) value is below `threshold`.
 */
export function grayToMonochrome(
  gray: Uint8Array,
  width: number,
  height: number,
  options: Pick<ImageProcessingOptions, 'dither' | 'threshold' | 'invert'> = {}
): MonochromeBitmap {
  const { dither = 'threshold', threshold = 128, invert = false } = options;
  const bpr = bytesPerRow(width);
  const data = new Uint8Array(bpr * height);

  if (dither === 'threshold') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let v = gray[y * width + x]!;
        if (invert) v = 255 - v;
        if (v < threshold) data[y * bpr + (x >> 3)]! |= 0x80 >> (x & 7);
      }
    }
    return { width, height, data };
  }

  const buf = new Float32Array(width * height);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = invert ? 255 - gray[i]! : gray[i]!;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const old = buf[y * width + x]!;
      const black = old < threshold;
      if (black) data[y * bpr + (x >> 3)]! |= 0x80 >> (x & 7);
      diffuse(buf, width, height, x, y, old - (black ? 0 : 255), dither);
    }
  }
  return { width, height, data };
}

// ─── Bitmap normalisation ─────────────────────────────────────────────────────

/** Whether `value` looks like a `MonochromeBitmap`. */
export function isMonochromeBitmap(value: unknown): value is MonochromeBitmap {
  const v = value as MonochromeBitmap | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.width === 'number' &&
    typeof v.height === 'number' &&
    (v.data instanceof Uint8Array || typeof v.data === 'string')
  );
}

/**
 * Check a bitmap's size and return its packed bytes (decoding base64 data).
 * Throws `INVALID_DIMENSIONS` when the byte count doesn't match the size.
 */
export function bitmapBytes(bitmap: MonochromeBitmap): Uint8Array {
  const { width, height } = bitmap;
  checkDimension('bitmap width', width);
  checkDimension('bitmap height', height);
  if (height > MAX_IMAGE_HEIGHT) {
    throw new ImageError(
      'TOO_LARGE',
      `Bitmap is ${height} dots tall; the limit is ${MAX_IMAGE_HEIGHT}.`
    );
  }

  const bytes =
    typeof bitmap.data === 'string' ? base64ToBytes(bitmap.data) : bitmap.data;
  if (!bytes) {
    throw new ImageError('INVALID_SOURCE', 'Bitmap data is not valid base64.');
  }

  const expected = bytesPerRow(width) * height;
  if (bytes.length !== expected) {
    throw new ImageError(
      'INVALID_DIMENSIONS',
      `A ${width}×${height} bitmap needs ${expected} bytes, got ${bytes.length}.`
    );
  }
  return bytes;
}

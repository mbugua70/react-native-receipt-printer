/* eslint-disable no-bitwise -- packing pixels into ESC/POS bytes */
import { bitmapBytes, bytesPerRow } from './ImageProcessor';
import { ImageError } from './ImageError';
import type { ImageMode, MonochromeBitmap } from './types';

type Align = 'left' | 'center' | 'right';

/** Rows per `GS v 0` command. Small bands keep each write inside a printer's buffer. */
export const DEFAULT_IMAGE_BAND_HEIGHT = 32;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// ─── Alignment by padding ─────────────────────────────────────────────────────
//
// Instead of relying on ESC a (which some printers ignore for images), the
// image is shifted right inside a wider bitmap. Left: no padding. Center:
// half the spare width. Right: all of it. Padding is white (0 bits).

/** Dots of white to the left of an image of `width` dots. */
export function alignOffset(
  width: number,
  printableDots: number,
  align: Align
): number {
  const spare = Math.max(0, printableDots - width);
  if (align === 'center') return Math.floor(spare / 2);
  if (align === 'right') return spare;
  return 0;
}

/**
 * Return `bitmap` shifted right by `offset` dots, as packed rows of the new
 * width. Bits past the image's own width are cleared, so stray padding bits
 * in a hand-made bitmap never print.
 */
export function padBitmap(
  bitmap: MonochromeBitmap,
  offset: number
): { width: number; height: number; data: Uint8Array } {
  const src = bitmapBytes(bitmap);
  const { width, height } = bitmap;
  const srcBpr = bytesPerRow(width);
  const outWidth = width + offset;
  const outBpr = bytesPerRow(outWidth);
  const out = new Uint8Array(outBpr * height);

  const byteShift = offset >> 3;
  const bitShift = offset & 7;
  const rem = width & 7;
  const lastMask = rem === 0 ? 0xff : (0xff << (8 - rem)) & 0xff;

  for (let y = 0; y < height; y++) {
    const s = y * srcBpr;
    const d = y * outBpr + byteShift;
    for (let i = 0; i < srcBpr; i++) {
      let b = src[s + i]!;
      if (i === srcBpr - 1) b &= lastMask;
      if (!b) continue;
      out[d + i]! |= b >> bitShift;
      if (bitShift && d + i + 1 < (y + 1) * outBpr) {
        out[d + i + 1]! |= (b << (8 - bitShift)) & 0xff;
      }
    }
  }
  return { width: outWidth, height, data: out };
}

// ─── GS v 0 — raster bit image ────────────────────────────────────────────────
//
//   1D 76 30 m xL xH yL yH d1…dk
//   m = 0 (normal size), x = bytes per row, y = rows, k = x × y

function rasterCommands(
  img: { width: number; height: number; data: Uint8Array },
  bandHeight: number
): Uint8Array {
  const bpr = bytesPerRow(img.width);
  const bands = Math.ceil(img.height / bandHeight);
  const out = new Uint8Array(bands * 8 + img.data.length);
  let pos = 0;

  for (let y = 0; y < img.height; y += bandHeight) {
    const rows = Math.min(bandHeight, img.height - y);
    out[pos++] = GS;
    out[pos++] = 0x76; // 'v'
    out[pos++] = 0x30; // '0'
    out[pos++] = 0; // m: normal density
    out[pos++] = bpr & 0xff;
    out[pos++] = bpr >> 8;
    out[pos++] = rows & 0xff;
    out[pos++] = rows >> 8;
    out.set(img.data.subarray(y * bpr, (y + rows) * bpr), pos);
    pos += rows * bpr;
  }
  return out;
}

// ─── ESC * — 24-dot bit image (fallback) ──────────────────────────────────────
//
//   ESC 3 24            line spacing = 24 dots, so stripes touch
//   ESC * 33 nL nH d…   one 24-row stripe, 3 bytes per column (top bit first)
//   LF                  print the stripe
//   ESC 2               restore default line spacing

function bitImageCommands(img: {
  width: number;
  height: number;
  data: Uint8Array;
}): Uint8Array {
  const bpr = bytesPerRow(img.width);
  const cols = img.width;
  const stripes = Math.ceil(img.height / 24);
  const out = new Uint8Array(3 + stripes * (5 + cols * 3 + 1) + 2);
  let pos = 0;

  out[pos++] = ESC;
  out[pos++] = 0x33; // '3'
  out[pos++] = 24;

  for (let s = 0; s < stripes; s++) {
    out[pos++] = ESC;
    out[pos++] = 0x2a; // '*'
    out[pos++] = 33; // 24-dot double density
    out[pos++] = cols & 0xff;
    out[pos++] = cols >> 8;
    for (let x = 0; x < cols; x++) {
      const byteIdx = x >> 3;
      const bit = 0x80 >> (x & 7);
      for (let k = 0; k < 3; k++) {
        let v = 0;
        for (let b = 0; b < 8; b++) {
          const y = s * 24 + k * 8 + b;
          if (y < img.height && img.data[y * bpr + byteIdx]! & bit) {
            v |= 0x80 >> b;
          }
        }
        out[pos++] = v;
      }
    }
    out[pos++] = LF;
  }

  out[pos++] = ESC;
  out[pos++] = 0x32; // '2'
  return out;
}

// ─── encodeImage ──────────────────────────────────────────────────────────────

export type EncodeImageOptions = {
  align: Align;
  printableDots: number;
  mode: ImageMode;
  bandHeight: number;
};

/**
 * ESC/POS bytes for one prepared bitmap: left-justify, then the image
 * (aligned by padding), split into bands.
 */
export function encodeImage(
  bitmap: MonochromeBitmap,
  options: EncodeImageOptions
): Uint8Array {
  const { align, printableDots, mode, bandHeight } = options;

  if (bitmap.width > printableDots) {
    throw new ImageError(
      'TOO_LARGE',
      `Image is ${bitmap.width} dots wide but the paper prints at most ${printableDots}.`
    );
  }
  if (!Number.isInteger(bandHeight) || bandHeight < 1 || bandHeight > 1024) {
    throw new ImageError(
      'INVALID_DIMENSIONS',
      `imageBandHeight must be a whole number from 1 to 1024, got ${bandHeight}.`
    );
  }

  const padded = padBitmap(
    bitmap,
    alignOffset(bitmap.width, printableDots, align)
  );
  const body =
    mode === 'bitImage'
      ? bitImageCommands(padded)
      : rasterCommands(padded, bandHeight);

  const out = new Uint8Array(3 + body.length);
  out.set([ESC, 0x61, 0x00]); // ESC a 0 — we align by padding
  out.set(body, 3);
  return out;
}

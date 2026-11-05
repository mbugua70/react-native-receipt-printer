/* eslint-disable no-bitwise -- packing pixels into ESC/POS bytes */
import {
  alignOffset,
  encodeImage,
  padBitmap,
} from '../printer/image/RasterEncoder';
import { ImageError } from '../printer/image/ImageError';
import type { MonochromeBitmap } from '../printer/image/types';

const solid = (width: number, height: number): MonochromeBitmap => {
  const bpr = Math.ceil(width / 8);
  const data = new Uint8Array(bpr * height);
  const rem = width % 8;
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < bpr; i++) {
      data[y * bpr + i] =
        i === bpr - 1 && rem ? (0xff << (8 - rem)) & 0xff : 0xff;
    }
  }
  return { width, height, data };
};

const opts = {
  align: 'left' as const,
  printableDots: 384,
  mode: 'raster' as const,
  bandHeight: 32,
};

describe('GS v 0 raster command', () => {
  it('starts left-justified then writes the header with bytes-per-row and rows', () => {
    const out = encodeImage(solid(10, 3), opts);
    expect(Array.from(out.subarray(0, 11))).toEqual([
      0x1b,
      0x61,
      0x00, // ESC a 0
      0x1d,
      0x76,
      0x30,
      0x00, // GS v 0 m=0
      2,
      0, // xL xH — 10 dots → 2 bytes
      3,
      0, // yL yH
    ]);
    expect(out.length).toBe(11 + 2 * 3);
    expect(Array.from(out.subarray(11, 13))).toEqual([0xff, 0b11000000]);
  });

  it('splits tall images into bands', () => {
    const out = encodeImage(solid(8, 70), opts);
    // 3 + (8 + 32) + (8 + 32) + (8 + 6)
    expect(out.length).toBe(3 + 40 + 40 + 14);
    expect(out[3 + 6]).toBe(32);
    expect(out[3 + 40 + 6]).toBe(32);
    expect(out[3 + 80 + 6]).toBe(6);
  });

  it('writes 16-bit sizes little-endian', () => {
    const out = encodeImage(solid(8, 300), { ...opts, bandHeight: 300 });
    expect(Array.from(out.subarray(7, 11))).toEqual([
      1,
      0,
      300 & 0xff,
      300 >> 8,
    ]);
  });

  it('rejects an image wider than the paper', () => {
    expect(() => encodeImage(solid(400, 1), opts)).toThrow(ImageError);
  });

  it('rejects a bad band height', () => {
    expect(() => encodeImage(solid(8, 1), { ...opts, bandHeight: 0 })).toThrow(
      ImageError
    );
  });
});

describe('alignment by padding', () => {
  it('computes offsets for left / center / right', () => {
    expect(alignOffset(240, 384, 'left')).toBe(0);
    expect(alignOffset(240, 384, 'center')).toBe(72);
    expect(alignOffset(240, 384, 'right')).toBe(144);
    expect(alignOffset(240, 576, 'center')).toBe(168); // 80mm
    expect(alignOffset(500, 384, 'center')).toBe(0);
  });

  it('centres a 240-dot logo on 58mm paper: 312-dot rows, 9 blank bytes first', () => {
    const out = encodeImage(solid(240, 1), { ...opts, align: 'center' });
    expect(out[7]).toBe(39); // ceil(312 / 8)
    const row = Array.from(out.subarray(11));
    expect(row.slice(0, 9)).toEqual(Array(9).fill(0));
    expect(row.slice(9)).toEqual(Array(30).fill(0xff));
  });

  it('right-aligns flush to the printable edge', () => {
    const out = encodeImage(solid(8, 1), { ...opts, align: 'right' });
    expect(out[7]).toBe(48); // full 384 dots
    expect(out[out.length - 1]).toBe(0xff);
  });

  it('shifts by offsets that are not whole bytes', () => {
    const padded = padBitmap(solid(10, 1), 3);
    expect(padded.width).toBe(13);
    // ...1111111 111.....
    expect(Array.from(padded.data)).toEqual([0b00011111, 0b11111000]);
  });

  it('clears stray padding bits in a hand-made bitmap', () => {
    const dirty = { width: 4, height: 1, data: new Uint8Array([0xff]) };
    expect(Array.from(padBitmap(dirty, 0).data)).toEqual([0xf0]);
    expect(Array.from(padBitmap(dirty, 6).data)).toEqual([
      0b00000011, 0b11000000,
    ]);
  });
});

describe('ESC * bit-image fallback', () => {
  it('sets 24-dot spacing, sends 24-row stripes column by column, restores spacing', () => {
    const out = encodeImage(solid(2, 25), { ...opts, mode: 'bitImage' });
    const bytes = Array.from(out);
    expect(bytes.slice(0, 6)).toEqual([0x1b, 0x61, 0x00, 0x1b, 0x33, 24]);
    // stripe 1: ESC * 33 nL nH, 2 columns × 3 bytes all black, LF
    expect(bytes.slice(6, 11)).toEqual([0x1b, 0x2a, 33, 2, 0]);
    expect(bytes.slice(11, 17)).toEqual([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    expect(bytes[17]).toBe(0x0a);
    // stripe 2: only the first row of 24 is set
    expect(bytes.slice(18, 23)).toEqual([0x1b, 0x2a, 33, 2, 0]);
    expect(bytes.slice(23, 29)).toEqual([0x80, 0, 0, 0x80, 0, 0]);
    expect(bytes.slice(-3)).toEqual([0x0a, 0x1b, 0x32]);
  });
});

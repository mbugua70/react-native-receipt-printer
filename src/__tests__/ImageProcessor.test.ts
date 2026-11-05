/// <reference types="node" />
/* eslint-disable no-bitwise -- packing pixels into ESC/POS bytes */
import {
  bitmapBytes,
  bytesPerRow,
  computeTargetSize,
  grayToMonochrome,
  MAX_IMAGE_HEIGHT,
  resizeGray,
  validateProcessingOptions,
} from '../printer/image/ImageProcessor';
import { ImageError } from '../printer/image/ImageError';
import { base64ToBytes, utf8Bytes } from '../printer/image/binary';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as ImageError).code;
  }
  return 'no error';
};

describe('computeTargetSize', () => {
  it('keeps the natural size when nothing is requested and it fits', () => {
    expect(computeTargetSize(200, 100, {}, 384)).toEqual({
      width: 200,
      height: 100,
    });
  });

  it('preserves the aspect ratio from width alone', () => {
    expect(computeTargetSize(400, 100, { width: 240 }, 384)).toEqual({
      width: 240,
      height: 60,
    });
  });

  it('preserves the aspect ratio from height alone', () => {
    expect(computeTargetSize(400, 100, { height: 50 }, 384)).toEqual({
      width: 200,
      height: 50,
    });
  });

  it('fits inside a box with contain (default)', () => {
    expect(
      computeTargetSize(400, 100, { width: 200, height: 200 }, 384)
    ).toEqual({
      width: 200,
      height: 50,
    });
  });

  it('uses exact dimensions with stretch', () => {
    expect(
      computeTargetSize(
        400,
        100,
        { width: 200, height: 200, fit: 'stretch' },
        384
      )
    ).toEqual({ width: 200, height: 200 });
  });

  it('shrinks to the printable width by default (58mm = 384 dots)', () => {
    expect(computeTargetSize(768, 200, {}, 384)).toEqual({
      width: 384,
      height: 100,
    });
    expect(computeTargetSize(100, 50, { width: 500 }, 384)).toEqual({
      width: 384,
      height: 192,
    });
  });

  it('allows the wider 80mm printable width (576 dots)', () => {
    expect(computeTargetSize(768, 200, {}, 576)).toEqual({
      width: 576,
      height: 150,
    });
  });

  it('throws TOO_LARGE with overflow: error', () => {
    expect(
      code(() => computeTargetSize(500, 50, { overflow: 'error' }, 384))
    ).toBe('TOO_LARGE');
  });

  it('throws TOO_LARGE when the result is taller than the limit', () => {
    expect(
      code(() => computeTargetSize(10, MAX_IMAGE_HEIGHT + 1, {}, 384))
    ).toBe('TOO_LARGE');
  });
});

describe('validateProcessingOptions', () => {
  it.each([
    [{ width: 0 }],
    [{ width: -5 }],
    [{ width: 10.5 }],
    [{ height: 0 }],
    [{ threshold: 300 }],
    [{ threshold: -1 }],
    [{ dither: 'nope' as never }],
  ])('rejects %p', (opts) => {
    expect(code(() => validateProcessingOptions(opts))).toBe(
      'INVALID_DIMENSIONS'
    );
  });

  it('accepts sensible options', () => {
    expect(() =>
      validateProcessingOptions({
        width: 240,
        threshold: 100,
        dither: 'atkinson',
      })
    ).not.toThrow();
  });
});

describe('resizeGray', () => {
  it('averages 2×2 blocks when halving', () => {
    const src = new Uint8Array([0, 255, 0, 0, 255, 255, 255, 255]); // 4×2
    // left block 0,255,255,255 → 191; right block 0,0,255,255 → 128
    expect(Array.from(resizeGray(src, 4, 2, 2, 1))).toEqual([191, 128]);
  });

  it('repeats pixels when enlarging', () => {
    const src = new Uint8Array([0, 255]); // 2×1
    expect(Array.from(resizeGray(src, 2, 1, 4, 1))).toEqual([0, 0, 255, 255]);
  });

  it('returns the input unchanged at the same size', () => {
    const src = new Uint8Array([1, 2, 3]);
    expect(resizeGray(src, 3, 1, 3, 1)).toBe(src);
  });
});

describe('grayToMonochrome', () => {
  it('packs MSB-first with 1 = black and pads a 10-dot row to 2 bytes', () => {
    // 10 px: black, white, black, … then black at the last pixel
    const gray = new Uint8Array([0, 255, 0, 255, 0, 255, 0, 255, 255, 0]);
    const bmp = grayToMonochrome(gray, 10, 1);
    expect(bytesPerRow(10)).toBe(2);
    expect(Array.from(bmp.data as Uint8Array)).toEqual([
      0b10101010, 0b01000000,
    ]);
  });

  it('leaves padding bits clear on every row', () => {
    const gray = new Uint8Array(13 * 3).fill(0); // all black, 13 wide
    const data = grayToMonochrome(gray, 13, 3).data as Uint8Array;
    for (let y = 0; y < 3; y++) {
      expect(data[y * 2]).toBe(0xff);
      expect(data[y * 2 + 1]).toBe(0b11111000);
    }
  });

  it('honours the threshold and invert', () => {
    const gray = new Uint8Array([100, 200]);
    expect(
      Array.from(
        grayToMonochrome(gray, 2, 1, { threshold: 150 }).data as Uint8Array
      )
    ).toEqual([0b10000000]);
    expect(
      Array.from(
        grayToMonochrome(gray, 2, 1, { threshold: 150, invert: true })
          .data as Uint8Array
      )
    ).toEqual([0b01000000]);
  });

  it('prints white (e.g. flattened transparency) as nothing', () => {
    const gray = new Uint8Array(16).fill(255);
    expect(
      Array.from(grayToMonochrome(gray, 16, 1).data as Uint8Array)
    ).toEqual([0, 0]);
  });

  it.each(['floyd-steinberg', 'atkinson'] as const)(
    '%s dithers mid-gray to a mix of black and white',
    (dither) => {
      const size = 32;
      const gray = new Uint8Array(size * size).fill(128);
      const data = grayToMonochrome(gray, size, size, { dither })
        .data as Uint8Array;
      let black = 0;
      for (const byte of data)
        for (let b = 0; b < 8; b++) if (byte & (1 << b)) black++;
      const ratio = black / (size * size);
      expect(ratio).toBeGreaterThan(0.3);
      expect(ratio).toBeLessThan(0.7);
    }
  );
});

describe('bitmapBytes', () => {
  it('accepts base64 data of the right length', () => {
    const bytes = bitmapBytes({ width: 9, height: 1, data: 'gIA=' }); // 0x80 0x80
    expect(Array.from(bytes)).toEqual([0x80, 0x80]);
  });

  it('rejects a byte count that does not match the size', () => {
    expect(
      code(() => bitmapBytes({ width: 8, height: 2, data: new Uint8Array(1) }))
    ).toBe('INVALID_DIMENSIONS');
  });

  it('rejects bad base64', () => {
    expect(code(() => bitmapBytes({ width: 8, height: 1, data: '@@@' }))).toBe(
      'INVALID_SOURCE'
    );
  });
});

describe('binary helpers', () => {
  it('decodes base64 like Buffer', () => {
    const input = Buffer.from([0, 1, 127, 128, 200, 255]).toString('base64');
    expect(Array.from(base64ToBytes(input)!)).toEqual([
      0, 1, 127, 128, 200, 255,
    ]);
  });

  it('encodes UTF-8 exactly like Buffer, including emoji and lone surrogates', () => {
    for (const s of ['ACME', 'Café ✓', 'KES 500 🚌', 'bad \ud800 pair']) {
      expect(Array.from(utf8Bytes(s))).toEqual(
        Array.from(Buffer.from(s, 'utf8'))
      );
    }
  });
});

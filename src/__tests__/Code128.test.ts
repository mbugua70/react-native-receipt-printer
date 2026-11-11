/// <reference types="node" />

// Mocks must come before imports so the modules under test pick them up.
jest.mock('../printer/image/NativeImageDecoder', () => ({
  decodeImageNative: jest.fn(),
}));
jest.mock('../bluetooth/BluetoothManager', () => ({
  getConnectedDevice: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
}));

import * as BluetoothManager from '../bluetooth/BluetoothManager';
import {
  CODE128_QUIET_ZONE,
  code128Bitmap,
  code128Values,
} from '../printer/Code128';
import {
  encode,
  encodeBytes,
  needsBinaryEncoding,
  type ReceiptData,
} from '../printer/EscPosEncoder';
import { ImageError } from '../printer/image/ImageError';
import type { MonochromeBitmap } from '../printer/image/types';
import { print } from '../printer/PrinterManager';
import { ReceiptBuilder } from '../printer/ReceiptBuilder';

const GS_K = [0x1d, 0x6b]; // native barcode command
const GS_V_0 = [0x1d, 0x76, 0x30, 0x00]; // raster image
const ESC_STAR = [0x1b, 0x2a]; // bit image

function indexOfSeq(bytes: Uint8Array, seq: number[], from = 0): number {
  for (let i = from; i <= bytes.length - seq.length; i++) {
    if (seq.every((v, k) => bytes[i + k] === v)) return i;
  }
  return -1;
}

/** Run lengths of one bitmap row: [white, black, white, black, …]. */
function rowRuns(bitmap: MonochromeBitmap, y = 0): number[] {
  const data = bitmap.data as Uint8Array;
  const rowBytes = Math.ceil(bitmap.width / 8);
  const runs: number[] = [];
  let black = false;
  let run = 0;
  for (let x = 0; x < bitmap.width; x++) {
    const isBlack = (data[y * rowBytes + (x >> 3)]! & (0x80 >> (x & 7))) !== 0;
    if (isBlack === black) run++;
    else {
      runs.push(run);
      run = 1;
      black = isBlack;
    }
  }
  runs.push(run);
  return runs;
}

// Values below were checked by decoding the drawn bitmaps with ZXing.
describe('code128Values', () => {
  it('uses code set C for an even number of digits', () => {
    expect(code128Values('52157681')).toEqual([105, 52, 15, 76, 81, 18, 106]);
    expect(code128Values('98614928')).toEqual([105, 98, 61, 49, 28, 69, 106]);
    expect(code128Values('00')).toEqual([105, 0, 2, 106]);
  });

  it('uses code set B for anything else', () => {
    expect(code128Values('5215768')).toEqual([
      104, 21, 18, 17, 21, 23, 22, 24, 93, 106,
    ]);
    expect(code128Values('NRBM-0726')).toEqual([
      104, 46, 50, 34, 45, 13, 16, 23, 18, 22, 63, 106,
    ]);
  });

  it('encodes "{" as data, with no escape sequence', () => {
    expect(code128Values('a{b}~ x')).toEqual([
      104, 65, 91, 66, 93, 94, 0, 88, 50, 106,
    ]);
  });
});

describe('code128Bitmap', () => {
  it('draws 3-dot modules with quiet zones when they fit', () => {
    // 7 symbols: 6 × 11 modules + 13 for stop = 79, plus 2 × 10 quiet
    const bitmap = code128Bitmap('52157681', 384, 80)!;
    expect(bitmap.width).toBe((79 + CODE128_QUIET_ZONE * 2) * 3);
    expect(bitmap.height).toBe(80);

    const runs = rowRuns(bitmap);
    expect(runs[0]).toBe(CODE128_QUIET_ZONE * 3); // leading quiet zone
    expect(runs[runs.length - 1]).toBe(CODE128_QUIET_ZONE * 3); // trailing
    // Start C is 2-1-1-2-3-2 modules
    expect(runs.slice(1, 7)).toEqual([6, 3, 3, 6, 9, 6]);
  });

  it('repeats the same row on every line', () => {
    const bitmap = code128Bitmap('52157681', 384, 40)!;
    expect(rowRuns(bitmap, 39)).toEqual(rowRuns(bitmap, 0));
  });

  it('narrows to 2-dot modules when 3 would not fit', () => {
    // 11 symbols × 11 + 13 + 20 quiet = 143 modules: 429 dots at 3, 286 at 2
    const bitmap = code128Bitmap('BEE5023C', 384, 80)!;
    expect(bitmap.width).toBe(143 * 2);
  });

  it('returns null when even 2-dot modules would not fit', () => {
    expect(code128Bitmap('X'.repeat(20), 384, 80)).toBeNull();
    expect(code128Bitmap('X'.repeat(20), 576, 80)).not.toBeNull();
  });
});

describe('barcode line with mode "image"', () => {
  const receipt = (
    extra = {},
    data: Partial<ReceiptData> = {}
  ): ReceiptData => ({
    paperWidth: 58,
    ...data,
    lines: [
      { type: 'text', content: 'Parcel' },
      { type: 'barcode', data: '52157681', mode: 'image', ...extra },
      { type: 'cut' },
    ],
  });

  it('prints the bars as a raster image, never the GS k command', () => {
    const bytes = encodeBytes(receipt());
    expect(indexOfSeq(bytes, GS_V_0)).toBeGreaterThan(-1);
    expect(indexOfSeq(bytes, GS_K)).toBe(-1);
    expect(Buffer.from(bytes).includes('{B')).toBe(false);
  });

  it('prints the code as plain text under the bars', () => {
    const bytes = Buffer.from(encodeBytes(receipt()));
    const image = bytes.indexOf(Buffer.from(GS_V_0));
    const code = bytes.lastIndexOf('52157681');
    expect(code).toBeGreaterThan(image);
    expect(bytes.indexOf('Parcel')).toBeLessThan(image);
  });

  it('leaves the text out when showText is false', () => {
    const bytes = Buffer.from(encodeBytes(receipt({ showText: false })));
    expect(bytes.includes('52157681')).toBe(false);
  });

  it("follows the receipt's imageMode", () => {
    const bytes = encodeBytes(receipt({}, { imageMode: 'bitImage' }));
    expect(indexOfSeq(bytes, ESC_STAR)).toBeGreaterThan(-1);
    expect(indexOfSeq(bytes, GS_V_0)).toBe(-1);
  });

  it('falls back to centred text like the native barcode', () => {
    for (const data of ['Café', 'X'.repeat(20)]) {
      const bytes = encodeBytes(receipt({ data }));
      expect(indexOfSeq(bytes, GS_V_0)).toBe(-1);
      expect(indexOfSeq(bytes, GS_K)).toBe(-1);
      expect(Buffer.from(bytes).includes(data)).toBe(true);
    }
  });

  it('prints nothing for empty data', () => {
    const bytes = encodeBytes(receipt({ data: '' }));
    expect(indexOfSeq(bytes, GS_V_0)).toBe(-1);
  });

  it('encode() refuses it instead of sending broken text', () => {
    expect(() => encode(receipt())).toThrow(ImageError);
    expect(needsBinaryEncoding(receipt())).toBe(true);
  });

  it('the builder passes the mode through', () => {
    const built = new ReceiptBuilder()
      .barcode('52157681', { mode: 'image' })
      .build();
    expect(built.lines[0]).toEqual({
      type: 'barcode',
      data: '52157681',
      mode: 'image',
    });
  });

  it('print() sends it as binary-safe latin1 bytes', async () => {
    const write = jest.fn().mockResolvedValue(true);
    jest
      .spyOn(BluetoothManager, 'getConnectedDevice')
      .mockReturnValue({ write, address: 'AA' } as never);

    await print(receipt());

    const [payload, encoding] = write.mock.calls[0]!;
    expect(encoding).toBe('latin1');
    expect(Array.from(Buffer.from(payload, 'latin1'))).toEqual(
      Array.from(encodeBytes(receipt()))
    );
  });
});

describe('barcode line without mode (native, unchanged)', () => {
  const native: ReceiptData = {
    lines: [{ type: 'barcode', data: '52157681' }],
  };

  it("is byte-for-byte the same as mode 'native'", () => {
    expect(encode(native)).toBe(
      encode({ lines: [{ type: 'barcode', data: '52157681', mode: 'native' }] })
    );
    expect(encode(native)).toContain('\x1dk');
    expect(needsBinaryEncoding(native)).toBe(false);
  });
});

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

import { Image, TurboModuleRegistry } from 'react-native';
import * as BluetoothManager from '../bluetooth/BluetoothManager';
import {
  encode,
  encodeBytes,
  type ReceiptData,
} from '../printer/EscPosEncoder';
import { ImageError, toImageError } from '../printer/image/ImageError';
import {
  clearImageCache,
  configureImageCache,
  getImageCacheStats,
} from '../printer/image/ImageCache';
import { prepareImage, prepareReceipt } from '../printer/image/ImageResolver';
import * as Native from '../printer/image/NativeImageDecoder';
import { print } from '../printer/PrinterManager';
import { ReceiptBuilder } from '../printer/ReceiptBuilder';

const decode = Native.decodeImageNative as jest.MockedFunction<
  typeof Native.decodeImageNative
>;

/** A fake decoded image: black square with a white border. */
function grayImage(width: number, height: number) {
  const pixels = new Uint8Array(width * height).fill(255);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) pixels[y * width + x] = 0;
  }
  return { width, height, pixels };
}

function mockDevice(write = jest.fn().mockResolvedValue(true)) {
  jest
    .spyOn(BluetoothManager, 'getConnectedDevice')
    .mockReturnValue({ write, address: 'AA' } as never);
  return write;
}

const GS_V_0 = [0x1d, 0x76, 0x30, 0x00];

function indexOfSeq(bytes: Uint8Array, seq: number[], from = 0): number {
  for (let i = from; i <= bytes.length - seq.length; i++) {
    if (seq.every((v, k) => bytes[i + k] === v)) return i;
  }
  return -1;
}

beforeEach(() => {
  clearImageCache();
  configureImageCache({ maxBytes: 512 * 1024, maxEntries: 32 });
  decode.mockReset();
  decode.mockImplementation(async () => grayImage(100, 50));
});
afterEach(() => jest.restoreAllMocks());

// ─── Backward compatibility ───────────────────────────────────────────────────

describe('receipts without images', () => {
  const receipt: ReceiptData = {
    lines: [
      {
        type: 'text',
        content: 'Café ✓ 🚌',
        align: 'center',
        bold: true,
        size: 'large',
      },
      { type: 'text', preText: 'Fare:', content: 'KES 500' },
      { type: 'divider' },
      { type: 'qrcode', data: 'NRB-0699' },
      { type: 'barcode', data: 'NRB-0699' },
      { type: 'spacer', lines: 2 },
      { type: 'cut' },
    ],
  };

  it('encodeBytes() equals the UTF-8 bytes of encode() — what is sent today', () => {
    expect(Array.from(encodeBytes(receipt))).toEqual(
      Array.from(Buffer.from(encode(receipt), 'utf8'))
    );
  });

  it('print() still writes the plain encode() string with no encoding argument', async () => {
    const write = mockDevice();
    await print(receipt);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]).toEqual([encode(receipt)]);
    expect(decode).not.toHaveBeenCalled();
  });

  it('builder output keeps its shape when no image options are set', () => {
    expect(
      Object.keys(new ReceiptBuilder({ paperWidth: 80 }).build()).sort()
    ).toEqual(['lines', 'paperWidth', 'printerProfile']);
  });
});

// ─── Builder & ordering ───────────────────────────────────────────────────────

describe('ReceiptBuilder.image()', () => {
  it('adds image lines in builder order with their options', () => {
    const data = new ReceiptBuilder({
      paperWidth: 58,
      printableDots: 360,
      imageMode: 'bitImage',
    })
      .image('https://x/logo.png', { width: 240 })
      .header('MZIGO')
      .image({ base64: 'AAAA' }, { align: 'right', dither: 'atkinson' })
      .row('Waybill', 'NRB-0699')
      .cut()
      .build();

    expect(data.lines.map((l) => l.type)).toEqual([
      'image',
      'text',
      'image',
      'text',
      'cut',
    ]);
    expect(data.lines[0]).toEqual({
      type: 'image',
      source: 'https://x/logo.png',
      width: 240,
    });
    expect(data.lines[2]).toMatchObject({ align: 'right', dither: 'atkinson' });
    expect(data.printableDots).toBe(360);
    expect(data.imageMode).toBe('bitImage');
  });
});

// ─── encode() / encodeBytes() with images ─────────────────────────────────────

describe('encoding receipts with images', () => {
  it('encode() refuses image lines instead of silently dropping them', () => {
    expect(() =>
      encode({ lines: [{ type: 'image', source: 'https://x/a.png' }] })
    ).toThrow(expect.objectContaining({ code: 'NOT_PREPARED' }));
  });

  it('encodeBytes() refuses an image that was not prepared', () => {
    expect(() =>
      encodeBytes({ lines: [{ type: 'image', source: 'https://x/a.png' }] })
    ).toThrow(expect.objectContaining({ code: 'NOT_PREPARED' }));
  });

  it('places the image exactly between the surrounding lines', async () => {
    const data = await prepareReceipt({
      lines: [
        { type: 'text', content: 'TOP' },
        { type: 'image', source: 'https://x/logo.png', width: 100 },
        { type: 'text', content: 'BOTTOM' },
      ],
    });
    const bytes = encodeBytes(data);
    const top = indexOfSeq(bytes, Array.from(Buffer.from('TOP')));
    const img = indexOfSeq(bytes, GS_V_0);
    const bottom = indexOfSeq(bytes, Array.from(Buffer.from('BOTTOM')));
    expect(top).toBeGreaterThanOrEqual(0);
    expect(img).toBeGreaterThan(top);
    expect(bottom).toBeGreaterThan(img);
  });

  it.each([
    [58 as const, 384, 48],
    [80 as const, 576, 72],
  ])(
    'right-aligns on %dmm paper to %d dots',
    async (paperWidth, _dots, bpr) => {
      const data = await prepareReceipt({
        paperWidth,
        lines: [
          { type: 'image', source: 'https://x/logo.png', align: 'right' },
        ],
      });
      const bytes = encodeBytes(data);
      const at = indexOfSeq(bytes, GS_V_0);
      expect(bytes[at + 4]).toBe(bpr);
    }
  );

  it('honours a printableDots override', async () => {
    const data = await prepareReceipt({
      paperWidth: 80,
      printableDots: 512,
      lines: [{ type: 'image', source: 'https://x/big.png', align: 'right' }],
    });
    const bytes = encodeBytes(data);
    expect(bytes[indexOfSeq(bytes, GS_V_0) + 4]).toBe(64);
  });
});

// ─── prepareImage: sources, sizing, cache ─────────────────────────────────────

describe('prepareImage()', () => {
  it('decodes a URL, resizes keeping aspect ratio, and asks native for enough width', async () => {
    const bmp = await prepareImage('https://x/logo.png', { width: 60 });
    expect(decode).toHaveBeenCalledWith('https://x/logo.png', 'uri', 60);
    expect(bmp.width).toBe(60);
    expect(bmp.height).toBe(30);
    expect(bmp.data.length).toBe(8 * 30);
  });

  it('shrinks an image wider than the paper to the printable width', async () => {
    decode.mockResolvedValueOnce(grayImage(800, 200));
    const bmp = await prepareImage('https://x/wide.png');
    expect(bmp.width).toBe(384);
    expect(bmp.height).toBe(96);
  });

  it('throws TOO_LARGE for oversized images with overflow: error', async () => {
    decode.mockResolvedValueOnce(grayImage(800, 200));
    await expect(
      prepareImage('https://x/wide.png', { overflow: 'error' })
    ).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
  });

  it('reads data URIs and { base64 } as base64 sources', async () => {
    await prepareImage('data:image/png;base64,iVBORw0KGgo=');
    expect(decode).toHaveBeenLastCalledWith('iVBORw0KGgo=', 'base64', 384);
    await prepareImage({ base64: 'data:image/jpeg;base64,/9j/4AAQ' });
    expect(decode).toHaveBeenLastCalledWith('/9j/4AAQ', 'base64', 384);
  });

  it('resolves bundled assets through Image.resolveAssetSource', async () => {
    jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({
      uri: 'http://localhost:8081/assets/logo.png',
      width: 1,
      height: 1,
      scale: 1,
    });
    await prepareImage(42);
    expect(decode).toHaveBeenCalledWith(
      'http://localhost:8081/assets/logo.png',
      'uri',
      384
    );
  });

  it.each([[''], ['not a uri'], ['data:image/png,rawdata'], [{ foo: 1 }]])(
    'rejects invalid source %p with INVALID_SOURCE',
    async (source) => {
      await expect(prepareImage(source as never)).rejects.toMatchObject({
        code: 'INVALID_SOURCE',
      });
      expect(decode).not.toHaveBeenCalled();
    }
  );

  it('rejects invalid dimensions before decoding', async () => {
    await expect(
      prepareImage('https://x/a.png', { width: 0 })
    ).rejects.toMatchObject({
      code: 'INVALID_DIMENSIONS',
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it('passes a preprocessed bitmap straight through without decoding', async () => {
    const bitmap = { width: 16, height: 2, data: new Uint8Array(4).fill(0xff) };
    const out = await prepareImage(bitmap);
    expect(out.data).toEqual(bitmap.data);
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects a preprocessed bitmap wider than the paper', async () => {
    const bitmap = { width: 400, height: 1, data: new Uint8Array(50) };
    await expect(prepareImage(bitmap)).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
  });

  it('caches: the same image and options decode once', async () => {
    const a = await prepareImage('https://x/logo.png', { width: 60 });
    const b = await prepareImage('https://x/logo.png', { width: 60 });
    expect(b).toBe(a);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('shares one decode between concurrent requests', async () => {
    await Promise.all([
      prepareImage('https://x/logo.png'),
      prepareImage('https://x/logo.png'),
    ]);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('decodes again when size, dithering or cacheKey change', async () => {
    await prepareImage('https://x/logo.png', { width: 60 });
    await prepareImage('https://x/logo.png', { width: 80 });
    await prepareImage('https://x/logo.png', { width: 60, dither: 'atkinson' });
    await prepareImage('https://x/logo.png', { width: 60, cacheKey: 'v2' });
    expect(decode).toHaveBeenCalledTimes(4);
  });

  it('keeps the cache within its byte budget, evicting the oldest first', async () => {
    configureImageCache({ maxBytes: 600 });
    await prepareImage('https://x/a.png', { width: 64 }); // 8 × 32 = 256 bytes
    await prepareImage('https://x/b.png', { width: 64 });
    await prepareImage('https://x/c.png', { width: 64 });
    expect(getImageCacheStats()).toEqual({ entries: 2, bytes: 512 });
    await prepareImage('https://x/a.png', { width: 64 });
    expect(decode).toHaveBeenCalledTimes(4); // a was evicted
  });

  it('does not cache failures', async () => {
    decode.mockRejectedValueOnce(new ImageError('NETWORK', 'offline'));
    await expect(prepareImage('https://x/a.png')).rejects.toMatchObject({
      code: 'NETWORK',
    });
    await prepareImage('https://x/a.png');
    expect(decode).toHaveBeenCalledTimes(2);
  });
});

// ─── print() with images ──────────────────────────────────────────────────────

describe('print() with images', () => {
  const receipt: ReceiptData = {
    lines: [
      { type: 'image', source: 'https://x/logo.png', width: 100 },
      { type: 'text', content: 'MZIGO Café' },
      { type: 'cut' },
    ],
  };

  it('writes binary-safe latin1 that round-trips to the exact bytes', async () => {
    const write = mockDevice();
    await print(receipt);

    expect(write).toHaveBeenCalledTimes(1);
    const [payload, encoding] = write.mock.calls[0]!;
    expect(encoding).toBe('latin1');

    const expected = encodeBytes(await prepareReceipt(receipt));
    const sent = Buffer.from(payload, 'latin1');
    expect(Array.from(sent)).toEqual(Array.from(expected));
    expect(sent.some((b) => b >= 0x80)).toBe(true); // raster bytes survived intact
  });

  it('splits by bytes when chunkSize is set', async () => {
    const write = mockDevice();
    await print(receipt, { chunkSize: 100 });
    const expected = encodeBytes(await prepareReceipt(receipt));
    expect(write).toHaveBeenCalledTimes(Math.ceil(expected.length / 100));
    const joined = Buffer.concat(
      write.mock.calls.map(([s]) => Buffer.from(s as string, 'latin1'))
    );
    expect(Array.from(joined)).toEqual(Array.from(expected));
  });

  it('decodes the logo once across repeated prints', async () => {
    mockDevice();
    await print(receipt);
    await print(receipt);
    await print(receipt, { copies: 2 });
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('throws the ImageError and sends nothing when an image fails', async () => {
    const write = mockDevice();
    decode.mockRejectedValueOnce(
      new ImageError('UNSUPPORTED_FORMAT', 'not an image')
    );
    await expect(print(receipt)).rejects.toMatchObject({
      name: 'ImageError',
      code: 'UNSUPPORTED_FORMAT',
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('prints backend JSON with an image line', async () => {
    const write = mockDevice();
    const json = JSON.parse(
      '{"paperWidth":80,"lines":[{"type":"image","source":"https://x/logo.png","width":240,"align":"center","dither":"threshold"},{"type":"text","content":"Hi"}]}'
    ) as ReceiptData;
    await print(json);
    expect(decode).toHaveBeenCalledWith('https://x/logo.png', 'uri', 240);
    expect(write.mock.calls[0]![1]).toBe('latin1');
  });

  it('prints a backend-supplied preprocessed bitmap (base64) with no decoding', async () => {
    const write = mockDevice();
    const json = {
      lines: [{ type: 'image', source: { width: 8, height: 2, data: '//8=' } }],
    } as ReceiptData;
    await print(json);
    expect(decode).not.toHaveBeenCalled();
    const sent = Array.from(
      Buffer.from(write.mock.calls[0]![0] as string, 'latin1')
    );
    expect(indexOfSeq(Uint8Array.from(sent), GS_V_0)).toBeGreaterThan(0);
  });
});

// ─── Native errors ────────────────────────────────────────────────────────────

describe('native error mapping', () => {
  it('keeps known native codes and falls back to DECODE_FAILED', () => {
    expect(
      toImageError({ code: 'NETWORK', message: 'HTTP 404' })
    ).toMatchObject({
      code: 'NETWORK',
      message: 'HTTP 404',
    });
    expect(toImageError(new Error('boom')).code).toBe('DECODE_FAILED');
  });

  it('reports NATIVE_UNAVAILABLE when the app binary predates image support', async () => {
    const { decodeImageNative } = jest.requireActual<typeof Native>(
      '../printer/image/NativeImageDecoder'
    );
    jest
      .spyOn(TurboModuleRegistry, 'get')
      .mockReturnValue({ multiply: () => 0 } as never);
    await expect(
      decodeImageNative('https://x', 'uri', 10)
    ).rejects.toMatchObject({
      code: 'NATIVE_UNAVAILABLE',
    });
  });
});

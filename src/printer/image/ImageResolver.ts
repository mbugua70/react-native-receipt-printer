import { Image } from 'react-native';
import {
  getPrintableDots,
  hasImageLines,
  type ReceiptData,
  type ReceiptLine,
} from '../EscPosEncoder';
import { hashString } from './binary';
import { cacheGet, cacheSet } from './ImageCache';
import { ImageError } from './ImageError';
import {
  bitmapBytes,
  computeTargetSize,
  grayToMonochrome,
  isMonochromeBitmap,
  resizeGray,
  validatePrintableDots,
  validateProcessingOptions,
} from './ImageProcessor';
import { decodeImageNative, type NativeSourceType } from './NativeImageDecoder';
import type {
  ImageProcessingOptions,
  ImageSource,
  MonochromeBitmap,
} from './types';

// ─── Source normalisation ─────────────────────────────────────────────────────

type NormalisedSource =
  | { kind: 'bitmap'; bitmap: MonochromeBitmap }
  | { kind: NativeSourceType; value: string; key: string };

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const DATA_URI = /^data:[^;,]*;base64,(.*)$/is;

function fromString(raw: string): NormalisedSource {
  const value = raw.trim();
  if (!value) throw new ImageError('INVALID_SOURCE', 'Image source is empty.');

  const data = DATA_URI.exec(value);
  if (data) {
    const b64 = data[1]!;
    return { kind: 'base64', value: b64, key: 'b64:' + hashString(b64) };
  }
  if (value.startsWith('data:')) {
    throw new ImageError(
      'INVALID_SOURCE',
      'Only base64 data URIs are supported (data:image/png;base64,…).'
    );
  }
  if (URI_SCHEME.test(value)) {
    return { kind: 'uri', value, key: 'uri:' + value };
  }
  throw new ImageError(
    'INVALID_SOURCE',
    `"${value.slice(
      0,
      40
    )}" is not an image URI. Use an http(s)/file/content URI, a data: URI, or { base64 }.`
  );
}

function normaliseSource(source: ImageSource): NormalisedSource {
  if (isMonochromeBitmap(source)) return { kind: 'bitmap', bitmap: source };

  if (typeof source === 'string') return fromString(source);

  if (typeof source === 'number') {
    // require('./logo.png') — a dev-server URL in debug builds, a bundled
    // resource name (Android) or file path (iOS) in release builds.
    const uri = Image.resolveAssetSource(source)?.uri;
    if (!uri) {
      throw new ImageError(
        'INVALID_SOURCE',
        `Bundled image asset ${source} could not be resolved.`
      );
    }
    return { kind: 'uri', value: uri, key: 'asset:' + uri };
  }

  if (source && typeof source === 'object') {
    if ('uri' in source && typeof source.uri === 'string') {
      return fromString(source.uri);
    }
    if ('base64' in source && typeof source.base64 === 'string') {
      const b64 = source.base64.trim().replace(/^data:[^;,]*;base64,/i, '');
      if (!b64) {
        throw new ImageError('INVALID_SOURCE', 'Image base64 is empty.');
      }
      return { kind: 'base64', value: b64, key: 'b64:' + hashString(b64) };
    }
  }

  throw new ImageError('INVALID_SOURCE', 'Unrecognised image source.');
}

// ─── prepareImage ─────────────────────────────────────────────────────────────

export type PrepareImageOptions = ImageProcessingOptions & {
  /**
   * Printable width in dots the image must fit. Default: 384 (58mm paper);
   * use 576 for 80mm, or your printer's own figure.
   */
  printableDots?: number;
};

const DEFAULT_PRINTABLE_DOTS = 384;

const _inFlight = new Map<
  string,
  Promise<MonochromeBitmap & { data: Uint8Array }>
>();

function cacheKeyFor(
  sourceKey: string,
  o: PrepareImageOptions,
  printableDots: number
): string {
  return [
    sourceKey,
    o.width ?? '',
    o.height ?? '',
    o.fit ?? 'contain',
    o.overflow ?? 'shrink',
    o.dither ?? 'threshold',
    o.threshold ?? 128,
    o.invert ? 1 : 0,
    printableDots,
    o.cacheKey ?? '',
  ].join('|');
}

/**
 * Decode, resize and convert an image to a printable 1-bit bitmap.
 *
 * Results are cached (see `configureImageCache`), and concurrent calls for
 * the same image share one download. Call it at app start for logos you
 * print often, then pass the result as an image `source` — it prints with
 * no decoding at all.
 *
 * @throws {ImageError} when the source can't be loaded, decoded or sized
 *
 * @example
 * ```ts
 * const logo = await prepareImage('https://example.com/logo.png', { width: 240 });
 * builder.image(logo);
 * ```
 */
export async function prepareImage(
  source: ImageSource,
  options: PrepareImageOptions = {}
): Promise<MonochromeBitmap & { data: Uint8Array }> {
  validateProcessingOptions(options);
  const printableDots = options.printableDots ?? DEFAULT_PRINTABLE_DOTS;
  validatePrintableDots(printableDots);

  const src = normaliseSource(source);

  if (src.kind === 'bitmap') {
    const data = bitmapBytes(src.bitmap);
    if (src.bitmap.width > printableDots) {
      throw new ImageError(
        'TOO_LARGE',
        `Bitmap is ${src.bitmap.width} dots wide but the paper prints at most ${printableDots}.`
      );
    }
    return { width: src.bitmap.width, height: src.bitmap.height, data };
  }

  const key = cacheKeyFor(src.key, options, printableDots);
  const cached = cacheGet(key);
  if (cached) return cached;

  const pending = _inFlight.get(key);
  if (pending) return pending;

  const job = (async () => {
    // Only decode as wide as the result can possibly be.
    const minWidth = Math.min(options.width ?? printableDots, printableDots);
    const gray = await decodeImageNative(src.value, src.kind, minWidth);
    const size = computeTargetSize(
      gray.width,
      gray.height,
      options,
      printableDots
    );
    const resized = resizeGray(
      gray.pixels,
      gray.width,
      gray.height,
      size.width,
      size.height
    );
    const bitmap = grayToMonochrome(
      resized,
      size.width,
      size.height,
      options
    ) as MonochromeBitmap & { data: Uint8Array };
    cacheSet(key, bitmap);
    return bitmap;
  })();

  _inFlight.set(key, job);
  try {
    return await job;
  } finally {
    _inFlight.delete(key);
  }
}

// ─── prepareReceipt ───────────────────────────────────────────────────────────

/**
 * Load every image in a receipt and return a copy whose image lines hold
 * prepared bitmaps — ready for `encodeBytes()`. Images load in parallel;
 * if any fails, this rejects and nothing should be printed.
 *
 * A receipt without images is returned as-is.
 *
 * @throws {ImageError}
 */
export async function prepareReceipt(data: ReceiptData): Promise<ReceiptData> {
  if (!hasImageLines(data)) return data;
  const printableDots = getPrintableDots(data);

  const lines = await Promise.all(
    data.lines.map(async (line): Promise<ReceiptLine> => {
      if (line.type !== 'image') return line;
      // `options` also carries `type`; prepareImage only reads image options
      const { source, align, ...options } = line;
      const bitmap = await prepareImage(source, { ...options, printableDots });
      return { type: 'image', source: bitmap, align };
    })
  );
  return { ...data, lines };
}

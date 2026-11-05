import { TurboModuleRegistry } from 'react-native';
import type { Spec } from '../../NativeReceiptPrinter';
import { base64ToBytes } from './binary';
import { ImageError, toImageError } from './ImageError';

// ─── Native decoding ──────────────────────────────────────────────────────────
//
// The native module loads the image (URL, file, content URI, bundled asset or
// base64), flattens transparency onto white, converts to 8-bit grayscale and
// — for big images — subsamples so the width stays at or above `minWidth`.
// Resizing to the exact size, dithering and packing happen in JS.

export type NativeSourceType = 'uri' | 'base64';

export type GrayImage = {
  width: number;
  height: number;
  /** One byte per pixel, row-major: 0 = black, 255 = white. */
  pixels: Uint8Array;
};

/**
 * Looked up lazily so importing the library never touches the native module
 * (tests, and apps that never print images, don't need it).
 */
function getNativeModule(): Spec | null {
  try {
    return TurboModuleRegistry.get<Spec>('ReceiptPrinter') ?? null;
  } catch {
    return null;
  }
}

export async function decodeImageNative(
  source: string,
  sourceType: NativeSourceType,
  minWidth: number
): Promise<GrayImage> {
  const native = getNativeModule();
  if (!native || typeof native.decodeImage !== 'function') {
    // e.g. new JS shipped over the air to an app built before image support
    throw new ImageError(
      'NATIVE_UNAVAILABLE',
      'Image printing needs a native rebuild of the app (react-native-receipt-printer ≥ 0.6.0).'
    );
  }

  let result: { width: number; height: number; data: string };
  try {
    result = await native.decodeImage(source, sourceType, minWidth);
  } catch (err) {
    throw toImageError(err);
  }

  const pixels = base64ToBytes(result.data);
  if (!pixels || pixels.length !== result.width * result.height) {
    throw new ImageError(
      'DECODE_FAILED',
      'The native decoder returned incomplete pixel data.'
    );
  }
  return { width: result.width, height: result.height, pixels };
}

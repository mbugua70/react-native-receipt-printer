import type { MonochromeBitmap } from './types';

// ─── Processed-image cache ────────────────────────────────────────────────────
//
// Least-recently-used cache of finished bitmaps, bounded by total bytes and
// by entry count. A 384-dot-wide, 120-dot-tall logo is ~5.8KB, so the
// default budget holds dozens of logos while staying small on low-end POS
// devices.

export type ImageCacheOptions = {
  /** Total bitmap bytes to keep. Default: 512KB. 0 disables caching. */
  maxBytes?: number;
  /** Most bitmaps to keep. Default: 32. */
  maxEntries?: number;
};

type Entry = { bitmap: MonochromeBitmap & { data: Uint8Array }; size: number };

const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_ENTRIES = 32;

let _maxBytes = DEFAULT_MAX_BYTES;
let _maxEntries = DEFAULT_MAX_ENTRIES;
let _bytes = 0;
const _entries = new Map<string, Entry>();

function evict(): void {
  while (
    _entries.size > 0 &&
    (_bytes > _maxBytes || _entries.size > _maxEntries)
  ) {
    const oldest = _entries.keys().next().value as string;
    _bytes -= _entries.get(oldest)!.size;
    _entries.delete(oldest);
  }
}

export function cacheGet(
  key: string
): (MonochromeBitmap & { data: Uint8Array }) | undefined {
  const entry = _entries.get(key);
  if (!entry) return undefined;
  // move to the most-recently-used end
  _entries.delete(key);
  _entries.set(key, entry);
  return entry.bitmap;
}

export function cacheSet(
  key: string,
  bitmap: MonochromeBitmap & { data: Uint8Array }
): void {
  const size = bitmap.data.length;
  if (size > _maxBytes || _maxEntries <= 0) return;
  const existing = _entries.get(key);
  if (existing) {
    _bytes -= existing.size;
    _entries.delete(key);
  }
  _entries.set(key, { bitmap, size });
  _bytes += size;
  evict();
}

/**
 * Change the processed-image cache limits. Entries over the new limits are
 * dropped straight away (oldest first).
 */
export function configureImageCache(options: ImageCacheOptions): void {
  if (options.maxBytes !== undefined) _maxBytes = Math.max(0, options.maxBytes);
  if (options.maxEntries !== undefined) {
    _maxEntries = Math.max(0, Math.floor(options.maxEntries));
  }
  evict();
}

/** Drop every cached image (e.g. after a logo changes on the server). */
export function clearImageCache(): void {
  _entries.clear();
  _bytes = 0;
}

/** How many images are cached and how many bytes they use. */
export function getImageCacheStats(): { entries: number; bytes: number } {
  return { entries: _entries.size, bytes: _bytes };
}

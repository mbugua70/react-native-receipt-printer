import type { MonochromeBitmap } from './image/types';

// ─── Code 128 drawn by the library ────────────────────────────────────────────
//
// Some printers' firmware handles the ESC/POS barcode command (GS k) badly:
// they print the "{B" code-set prefix as part of the code, or draw bars far
// thinner than asked, and the result won't scan. A barcode line with
// `mode: 'image'` is drawn here instead, as a black-and-white bitmap that
// prints the same on every printer that can print an image.

/**
 * Bar and space widths, in modules, for every Code 128 symbol value
 * (0–106). Each symbol is bar, space, bar, space, bar, space — 11 modules —
 * except the stop symbol (106), which adds a final bar to make 13.
 */
const PATTERNS = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 ' +
  '221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 ' +
  '212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 ' +
  '231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 ' +
  '112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 ' +
  '214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232 2331112'
)
  .split(' ')
  .map((pattern) => [...pattern].map(Number));

const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Blank modules each side, so a scanner can find where the code starts. */
export const CODE128_QUIET_ZONE = 10;

const MIN_MODULE_DOTS = 2;
const MAX_MODULE_DOTS = 3;

/**
 * Code set C packs two digits into each symbol, so an even-length run of
 * digits (most parcel and ticket numbers) comes out about half as wide as
 * in code set B — which leaves room for wider, easier-to-scan bars.
 */
function isCodeSetC(content: string): boolean {
  return content.length % 2 === 0 && /^\d+$/.test(content);
}

/**
 * The symbol values for `content`: start, data, checksum, stop. Uses code
 * set C for an even number of digits and code set B (printable ASCII)
 * otherwise. Callers check `isCode128Printable()` first.
 */
export function code128Values(content: string): number[] {
  const setC = isCodeSetC(content);
  const data = setC
    ? (content.match(/\d\d/g) ?? []).map(Number)
    : [...content].map((char) => char.charCodeAt(0) - 32);
  const start = setC ? START_C : START_B;
  const checksum =
    data.reduce((sum, value, i) => sum + value * (i + 1), start) % 103;
  return [start, ...data, checksum, STOP];
}

/** Bar/space widths in modules, starting with a bar. */
function moduleWidths(values: number[]): number[] {
  return values.flatMap((value) => PATTERNS[value]!);
}

/**
 * Draw `content` as a Code 128 bitmap that fits `printableDots`, with bars as
 * wide as fit (2–3 dots per module) and a quiet zone each side. Returns
 * `null` when it won't fit at a scannable width — the caller prints the
 * content as text instead, as the native barcode does.
 */
export function code128Bitmap(
  content: string,
  printableDots: number,
  height: number
): MonochromeBitmap | null {
  const widths = moduleWidths(code128Values(content));
  const modules =
    widths.reduce((sum, w) => sum + w, 0) + CODE128_QUIET_ZONE * 2;
  const moduleDots = Math.min(
    MAX_MODULE_DOTS,
    Math.floor(printableDots / modules)
  );
  if (moduleDots < MIN_MODULE_DOTS) return null;

  const width = modules * moduleDots;
  const rowBytes = Math.ceil(width / 8);
  const row = new Uint8Array(rowBytes);
  let x = CODE128_QUIET_ZONE * moduleDots;
  widths.forEach((w, i) => {
    const isBar = i % 2 === 0;
    for (let end = x + w * moduleDots; x < end; x++) {
      if (isBar) row[x >> 3]! |= 0x80 >> (x & 7);
    }
  });

  const rows = Math.max(1, Math.round(height));
  const data = new Uint8Array(rowBytes * rows);
  for (let y = 0; y < rows; y++) data.set(row, y * rowBytes);
  return { width, height: rows, data };
}

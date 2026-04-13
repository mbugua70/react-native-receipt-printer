// ─── ESC/POS command constants ────────────────────────────────────────────────
//
// Thermal printers speak ESC/POS — a set of escape sequences that control
// formatting. Every command starts with ESC (\x1B) or GS (\x1D) followed
// by specific bytes that tell the printer what to do.

const ESC = '\x1B'; // Escape — starts most formatting commands
const GS = '\x1D'; // Group Separator — starts size and QR commands
const LF = '\n'; // Line Feed — moves to the next line

// ─── Alignment ────────────────────────────────────────────────────────────────
// ESC a n — select justification
// n = 0 → left, 1 → center, 2 → right

const ALIGN_LEFT = ESC + '\x61\x00';
const ALIGN_CENTER = ESC + '\x61\x01';
const ALIGN_RIGHT = ESC + '\x61\x02';

// ─── Bold ─────────────────────────────────────────────────────────────────────
// ESC E n — turn bold on (n=1) or off (n=0)

const BOLD_ON = ESC + '\x45\x01';
const BOLD_OFF = ESC + '\x45\x00';

// ─── Paper cut ────────────────────────────────────────────────────────────────
// GS V 0 — full paper cut

const CUT = '\x1D\x56\x00';

// ─── Printer profiles ─────────────────────────────────────────────────────────
//
// Different printer models use different commands for text sizing.
//
// Generic printers (most thermal printers) use ESC \x21:
//   \x00 → normal size
//   \x30 → double width + double height (large)
//
// C30 printers use GS \x21 with a size byte calculated as:
//   (widthMultiplier << 4) | heightMultiplier
//   sizeGs(0,0) = normal, sizeGs(1,1) = double width + height

export type PrinterProfile = 'generic' | 'c30';

type SizeCommands = {
  normal: string;
  large: string;
};

function getSizeCommands(profile: PrinterProfile): SizeCommands {
  if (profile === 'c30') {
    // C30 uses GS \x21 + size byte
    // 0x00 = normal size
    // 0x11 = double width + double height (width bits in high nibble, height in low)
    return {
      normal: GS + '\x21' + String.fromCharCode(0x00),
      large: GS + '\x21' + String.fromCharCode(0x11),
    };
  }

  // Generic — ESC \x21
  return {
    normal: ESC + '\x21\x00',
    large: ESC + '\x21\x30',
  };
}

// ─── Paper width ──────────────────────────────────────────────────────────────
//
// Paper width affects how many characters fit on one line.
// 58mm paper → 32 characters per line at normal size → 16 at large size
// 80mm paper → 48 characters per line at normal size → 24 at large size

export type PaperWidth = 58 | 80;

type WidthConfig = {
  // characters at normal size
  charsPerLine: number;
  // characters at large size
  charsLarge: number;
  // how long the divider line is
  dividerLength: number;
};

function getWidthConfig(width: PaperWidth): WidthConfig {
  if (width === 80) {
    return { charsPerLine: 48, charsLarge: 24, dividerLength: 48 };
  }
  return { charsPerLine: 32, charsLarge: 16, dividerLength: 32 };
}

// ─── QR code commands ─────────────────────────────────────────────────────────
// GS ( k — QR code function commands.
// These build the QR in the printer's memory then print it.

function buildQrCommands(content: string): string {
  if (!content) return '';

  let cmd = '';

  // Set QR model (model 2 — most compatible)
  cmd += GS + '(k' + String.fromCharCode(4, 0, 49, 65, 50, 0);

  // Set QR size (module size = 10 — visible on most paper)
  cmd += GS + '(k' + String.fromCharCode(3, 0, 49, 67, 10);

  // Set error correction level (level L = 48 — smallest, prints faster)
  cmd += GS + '(k' + String.fromCharCode(3, 0, 49, 69, 48);

  // Store QR data in printer memory
  const len = content.length + 3;
  const lo = len % 256;
  const hi = Math.floor(len / 256);
  cmd += GS + '(k' + String.fromCharCode(lo, hi, 49, 80, 48);
  cmd += content;

  // Print the QR code stored in memory
  cmd += GS + '(k' + String.fromCharCode(3, 0, 49, 81, 48);

  return cmd;
}

// ─── Word wrap ────────────────────────────────────────────────────────────────
// Splits a long string into lines that fit within maxChars.
// Used when printing at large size where fewer characters fit per line.

function wrapWords(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

// ─── Exports for use in encode() ─────────────────────────────────────────────
// These will be used in the encode function in the next chunk.

// ─── Receipt line types ───────────────────────────────────────────────────────
//
// A receipt is an array of lines. Each line has a `type` that tells the
// encoder what to render. The backend sends this array — or the user builds
// it with ReceiptBuilder.

export type Align = 'left' | 'center' | 'right';
export type Size = 'normal' | 'large';

/**
 * A single line of text.
 *
 * - `preText` — optional label on the left  e.g. "Fare:"
 * - `content` — the main value              e.g. "KES 500"
 * - `align`   — text alignment (default: left)
 * - `size`    — text size (default: normal)
 * - `bold`    — bold text (default: false)
 *
 * If both `preText` and `content` are provided they are printed on the
 * same line — label left, value right — like a two-column row.
 * If only `content` is provided it fills the full line width.
 */
export type TextLine = {
  type: 'text';
  preText?: string;
  content?: string;
  align?: Align;
  size?: Size;
  bold?: boolean;
};

/** A horizontal divider line e.g. "--------------------------------" */
export type DividerLine = {
  type: 'divider';
  char?: string; // default: '-'
};

/** One or more blank lines for spacing */
export type SpacerLine = {
  type: 'spacer';
  lines?: number; // default: 1
};

/** A QR code — printed only when this line is present */
export type QrCodeLine = {
  type: 'qrcode';
  data: string;
};

/** Paper cut — always the last line of a receipt */
export type CutLine = {
  type: 'cut';
};

/** Union of all possible receipt line types */
export type ReceiptLine =
  | TextLine
  | DividerLine
  | SpacerLine
  | QrCodeLine
  | CutLine;

// ─── Receipt data ─────────────────────────────────────────────────────────────

/**
 * The full receipt passed to `encode()`.
 *
 * - `lines`          — the content lines (from backend or ReceiptBuilder)
 * - `paperWidth`     — 58mm or 80mm (default: 58)
 * - `printerProfile` — 'generic' or 'c30' (default: 'generic')
 */
export type ReceiptData = {
  lines: ReceiptLine[];
  paperWidth?: PaperWidth;
  printerProfile?: PrinterProfile;
};

// ─── encode() — main function signature ──────────────────────────────────────
//
// Takes a ReceiptData object and returns a raw ESC/POS string ready to be
// sent to the printer. The encoding logic will be added in the next chunk.

export function encode(data: ReceiptData): string {
  const profile = data.printerProfile ?? 'generic';
  const width = data.paperWidth ?? 58;
  const size = getSizeCommands(profile);
  const widthCfg = getWidthConfig(width);

  let output = '';

  for (const line of data.lines) {
    output += encodeLine(line, size, widthCfg);
  }

  return output;
}

// Encodes a single line — logic added in the next chunk.
// All constants (LF, ALIGN_*, BOLD_*, CUT, etc.) are used here once
// the switch cases are filled in.
function encodeLine(
  _line: ReceiptLine,
  _size: ReturnType<typeof getSizeCommands>,
  _widthCfg: ReturnType<typeof getWidthConfig>
): string {
  return '';
}

// Referenced here so TS/ESLint doesn't flag them as unused before
// the next chunk fills in encodeLine.
// Temporary reference to prevent unused-variable errors before next chunk
// fills in encodeLine. Remove once all constants are used in the switch.
export const _unusedUntilNextChunk = {
  LF,
  ALIGN_LEFT,
  ALIGN_CENTER,
  ALIGN_RIGHT,
  BOLD_ON,
  BOLD_OFF,
  CUT,
  buildQrCommands,
  wrapWords,
};

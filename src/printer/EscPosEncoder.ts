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
  // printable width in dots (8 dots/mm) — bounds how wide a barcode can be
  printableDots: number;
};

function getWidthConfig(width: PaperWidth): WidthConfig {
  if (width === 80) {
    return {
      charsPerLine: 48,
      charsLarge: 24,
      dividerLength: 48,
      printableDots: 576,
    };
  }
  return {
    charsPerLine: 32,
    charsLarge: 16,
    dividerLength: 32,
    printableDots: 384,
  };
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

// ─── Barcode commands (Code 128) ──────────────────────────────────────────────
// GS k m=73 — print a Code 128 barcode. The printer adds the start, check
// and stop symbols itself; we only choose bar size, the text underneath, and
// the data (prefixed with "{B" to select code set B: printable ASCII).
//
// Each Code 128 symbol is 11 modules wide, plus 35 for start/check/stop. Bars
// are as wide as fit (up to 3 dots — easier to scan), never below 2 dots.

const BARCODE_MIN_MODULE_DOTS = 2;
const BARCODE_MAX_MODULE_DOTS = 3;
const BARCODE_DEFAULT_HEIGHT = 80; // dots ≈ 10mm

/** Code set B covers printable ASCII only (space through "~"). */
export function isCode128Printable(content: string): boolean {
  return /^[\x20-\x7E]+$/.test(content);
}

/** Bar width in dots for `content`, or 0 when it can't fit the paper. */
export function getBarcodeModuleDots(
  content: string,
  printableDots: number
): number {
  const modules = content.length * 11 + 35;
  for (
    let dots = BARCODE_MAX_MODULE_DOTS;
    dots >= BARCODE_MIN_MODULE_DOTS;
    dots--
  ) {
    if (modules * dots <= printableDots) return dots;
  }
  return 0;
}

function buildBarcodeCommands(
  content: string,
  moduleDots: number,
  height: number,
  showText: boolean
): string {
  // "{" is the code-set escape inside GS k data — a literal one is "{{".
  const data = '{B' + content.replace(/\{/g, '{{');

  let cmd = '';
  cmd += GS + 'h' + String.fromCharCode(Math.max(1, Math.min(255, height)));
  cmd += GS + 'w' + String.fromCharCode(moduleDots);
  // HRI (the human-readable text): 2 = below the bars, 0 = none; font A.
  cmd += GS + 'H' + String.fromCharCode(showText ? 2 : 0);
  cmd += GS + 'f' + String.fromCharCode(0);
  cmd += GS + 'k' + String.fromCharCode(73, data.length) + data;
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

/**
 * A Code 128 barcode, centred, with its text printed underneath.
 *
 * - `height`   — bar height in dots (default 80 ≈ 10mm)
 * - `showText` — print the text under the bars (default: true)
 *
 * Content that isn't printable ASCII, or too long to fit the paper at a
 * scannable bar width, is printed as plain centred text instead so the
 * label still carries the code.
 */
export type BarcodeLine = {
  type: 'barcode';
  data: string;
  height?: number;
  showText?: boolean;
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
  | BarcodeLine
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

// ─── encodeLine — dispatch by type ───────────────────────────────────────────
//
// Called once per item in data.lines. Routes to the right helper based on
// the `type` field of the line object.

function encodeLine(
  line: ReceiptLine,
  size: ReturnType<typeof getSizeCommands>,
  widthCfg: ReturnType<typeof getWidthConfig>
): string {
  switch (line.type) {
    case 'text':
      return encodeText(line, size, widthCfg);

    case 'divider': {
      // Fill the full paper width with a repeated character, then newline.
      const char = line.char ?? '-';
      return char.repeat(widthCfg.dividerLength) + LF;
    }

    case 'spacer': {
      // Emit N blank lines (each LF advances one line on the printer).
      const count = line.lines ?? 1;
      return LF.repeat(count);
    }

    case 'qrcode': {
      // Center the QR block, then restore left alignment afterward.
      return ALIGN_CENTER + buildQrCommands(line.data) + LF + ALIGN_LEFT;
    }

    case 'barcode':
      return encodeBarcode(line, widthCfg);

    case 'cut':
      return CUT;
  }
}

// ─── encodeBarcode ────────────────────────────────────────────────────────────
//
// Centred like the QR block. Falls back to centred text when the content
// can't be a barcode on this paper, rather than printing nothing.

function encodeBarcode(line: BarcodeLine, widthCfg: WidthConfig): string {
  const content = line.data ?? '';
  if (!content) return '';

  const moduleDots = isCode128Printable(content)
    ? getBarcodeModuleDots(content, widthCfg.printableDots)
    : 0;

  if (!moduleDots) {
    return ALIGN_CENTER + content + LF + ALIGN_LEFT;
  }

  return (
    ALIGN_CENTER +
    buildBarcodeCommands(
      content,
      moduleDots,
      line.height ?? BARCODE_DEFAULT_HEIGHT,
      line.showText ?? true
    ) +
    LF +
    ALIGN_LEFT
  );
}

// ─── encodeText ───────────────────────────────────────────────────────────────
//
// Handles the 'text' line type. There are two layouts:
//
//   Two-column  — preText + content supplied → label on left, value on right.
//                 e.g. "Fare:                 KES 500"
//
//   Full-width  — only content supplied → fills the line, respects alignment.
//                 At large size the text is word-wrapped to fit charsLarge.
//
// Command order the printer expects:
//   [size] [alignment] [bold?] <text> \n [reset bold] [reset size+align]
//
// Resetting after each line keeps lines independent — a bold header won't
// bleed into the next line if the caller forgets to turn bold off.

function encodeText(
  line: TextLine,
  size: SizeCommands,
  widthCfg: WidthConfig
): string {
  const isLarge = line.size === 'large';
  const isBold = line.bold === true;
  const align = line.align ?? 'left';

  // How many characters fit on one line at the chosen size
  const charsPerLine = isLarge ? widthCfg.charsLarge : widthCfg.charsPerLine;

  let alignCmd = ALIGN_LEFT;
  if (align === 'center') alignCmd = ALIGN_CENTER;
  else if (align === 'right') alignCmd = ALIGN_RIGHT;

  const sizeCmd = isLarge ? size.large : size.normal;
  const boldStart = isBold ? BOLD_ON : '';
  const boldEnd = isBold ? BOLD_OFF : '';

  // Preamble — set size, alignment, bold before any text
  let result = sizeCmd + alignCmd + boldStart;

  if (line.preText !== undefined && line.content !== undefined) {
    // ── Two-column row ──────────────────────────────────────────────────────
    // Pad the space between label and value so the value lands at the right
    // edge of the paper.  If the two strings are already too long to fit,
    // keep at least one space between them.
    const gap = charsPerLine - line.preText.length - line.content.length;
    const row = line.preText + ' '.repeat(Math.max(1, gap)) + line.content;
    result += row + LF;
  } else {
    // ── Single-value row ────────────────────────────────────────────────────
    const text = line.content ?? '';

    if (isLarge && text.length > charsPerLine) {
      // Word-wrap long text at large size so it doesn't get cut off.
      const wrapped = wrapWords(text, charsPerLine);
      result += wrapped.join(LF) + LF;
    } else {
      result += text + LF;
    }
  }

  // Reset bold, size, and alignment so the next line starts clean.
  result += boldEnd + size.normal + ALIGN_LEFT;

  return result;
}

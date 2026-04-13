import type {
  Align,
  PaperWidth,
  PrinterProfile,
  ReceiptData,
  ReceiptLine,
  Size,
} from './EscPosEncoder';

// ─── Builder config ───────────────────────────────────────────────────────────

type BuilderConfig = {
  paperWidth?: PaperWidth;
  printerProfile?: PrinterProfile;
};

// ─── Per-method option types ──────────────────────────────────────────────────

type HeaderOptions = {
  align?: Align;
  bold?: boolean;
};

type TextOptions = {
  align?: Align;
  size?: Size;
  bold?: boolean;
};

type DividerOptions = {
  char?: string;
};

// ─── ReceiptBuilder ───────────────────────────────────────────────────────────
//
// Fluent builder for constructing a ReceiptData object.
//
// Usage:
//   const data = new ReceiptBuilder({ paperWidth: 58 })
//     .header('ACME RIDES')
//     .divider()
//     .row('Fare:', 'KES 500')
//     .cut()
//     .build();
//
//   encode(data); // → raw ESC/POS string ready to send to the printer

export class ReceiptBuilder {
  private readonly _lines: ReceiptLine[] = [];
  private readonly _config: BuilderConfig;

  constructor(config: BuilderConfig = {}) {
    this._config = config;
  }

  /**
   * A large, bold, centered title line — typically the business name.
   * Defaults: align=center, bold=true, size=large.
   */
  header(title: string, options: HeaderOptions = {}): this {
    this._lines.push({
      type: 'text',
      content: title,
      align: options.align ?? 'center',
      size: 'large',
      bold: options.bold ?? true,
    });
    return this;
  }

  /**
   * A two-column row — label on the left, value on the right.
   * e.g. .row('Fare:', 'KES 500') → "Fare:            KES 500"
   */
  row(label: string, value: string): this {
    this._lines.push({
      type: 'text',
      preText: label,
      content: value,
    });
    return this;
  }

  /**
   * A single line of text.
   * Defaults: align=left, size=normal, bold=false.
   */
  text(content: string, options: TextOptions = {}): this {
    this._lines.push({
      type: 'text',
      content,
      align: options.align,
      size: options.size,
      bold: options.bold,
    });
    return this;
  }

  /**
   * A horizontal divider line.
   * Default character: '-'  e.g. "--------------------------------"
   */
  divider(options: DividerOptions = {}): this {
    this._lines.push({
      type: 'divider',
      char: options.char,
    });
    return this;
  }

  /**
   * One or more blank lines for spacing.
   * Default: 1 line.
   */
  spacer(lines: number = 1): this {
    this._lines.push({
      type: 'spacer',
      lines,
    });
    return this;
  }

  /**
   * A QR code printed in the center of the receipt.
   */
  qrCode(data: string): this {
    this._lines.push({
      type: 'qrcode',
      data,
    });
    return this;
  }

  /**
   * Paper cut — should be the last call before build().
   */
  cut(): this {
    this._lines.push({ type: 'cut' });
    return this;
  }

  /**
   * Returns the completed ReceiptData, ready to pass to encode().
   * Each call returns a new object — the builder can be reused.
   */
  build(): ReceiptData {
    return {
      lines: [...this._lines],
      paperWidth: this._config.paperWidth,
      printerProfile: this._config.printerProfile,
    };
  }
}

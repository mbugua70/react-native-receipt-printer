import {
  encode,
  getBarcodeModuleDots,
  isCode128Printable,
} from '../printer/EscPosEncoder';

const GS = '\x1D';
const ALIGN_CENTER = '\x1Ba\x01';
const ALIGN_LEFT = '\x1Ba\x00';

const barcode = (data: string, extra = {}, paperWidth: 58 | 80 = 58) =>
  encode({ lines: [{ type: 'barcode', data, ...extra }], paperWidth });

describe('barcode line', () => {
  it('prints a centred Code 128 (set B) with text below', () => {
    expect(barcode('BEE5023C')).toBe(
      [
        ALIGN_CENTER,
        GS + 'h' + String.fromCharCode(80), // bar height
        GS + 'w' + String.fromCharCode(3), // bar width: 3 dots fit 58mm
        GS + 'H' + String.fromCharCode(2), // text below
        GS + 'f' + String.fromCharCode(0), // font A
        GS + 'k' + String.fromCharCode(73, 10) + '{BBEE5023C',
        '\n',
        ALIGN_LEFT,
      ].join('')
    );
  });

  it('honours height and hides the text when asked', () => {
    const out = barcode('A1', { height: 60, showText: false });
    expect(out).toContain(GS + 'h' + String.fromCharCode(60));
    expect(out).toContain(GS + 'H' + String.fromCharCode(0));
  });

  it('escapes a literal "{"', () => {
    expect(barcode('A{1')).toContain(
      GS + 'k' + String.fromCharCode(73, 6) + '{BA{{1'
    );
  });

  it('falls back to centred text when the content cannot be a barcode', () => {
    const tooLong = 'X'.repeat(20); // fits 80mm, not 58mm
    expect(barcode(tooLong)).toBe(ALIGN_CENTER + tooLong + '\n' + ALIGN_LEFT);
    expect(barcode(tooLong, {}, 80)).toContain(GS + 'k');
    expect(barcode('Café')).toBe(ALIGN_CENTER + 'Café\n' + ALIGN_LEFT);
  });

  it('prints nothing for empty data', () => {
    expect(barcode('')).toBe('');
  });
});

describe('getBarcodeModuleDots', () => {
  it.each([
    ['BEE5023C', 384, 3], // 123 modules → 369 dots
    ['ABCDEFGHIJ', 384, 2], // 145 modules → too wide at 3, fits at 2
    ['ABCDEFGHIJKLMN', 384, 2], // 189 modules → 378 dots
    ['ABCDEFGHIJKLMNO', 384, 0], // 200 modules → doesn't fit
    ['ABCDEFGHIJKLMNO', 576, 2],
  ])('%p on %p dots → %p', (content, dots, expected) => {
    expect(getBarcodeModuleDots(content, dots)).toBe(expected);
  });
});

describe('isCode128Printable', () => {
  it('accepts printable ASCII only', () => {
    expect(isCode128Printable('BEE5023C')).toBe(true);
    expect(isCode128Printable('NRB-0660 ~')).toBe(true);
    expect(isCode128Printable('Café')).toBe(false);
    expect(isCode128Printable('a\nb')).toBe(false);
    expect(isCode128Printable('')).toBe(false);
  });
});

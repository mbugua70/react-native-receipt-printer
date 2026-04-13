import { ReceiptBuilder } from '../printer/ReceiptBuilder';

describe('ReceiptBuilder', () => {
  describe('header()', () => {
    it('defaults to center, large, bold', () => {
      const { lines } = new ReceiptBuilder().header('ACME RIDES').build();
      expect(lines[0]).toEqual({
        type: 'text',
        content: 'ACME RIDES',
        align: 'center',
        size: 'large',
        bold: true,
      });
    });

    it('accepts align override', () => {
      const { lines } = new ReceiptBuilder()
        .header('ACME RIDES', { align: 'left' })
        .build();
      expect(lines[0]).toMatchObject({ align: 'left' });
    });

    it('accepts bold override', () => {
      const { lines } = new ReceiptBuilder()
        .header('ACME RIDES', { bold: false })
        .build();
      expect(lines[0]).toMatchObject({ bold: false });
    });
  });

  describe('row()', () => {
    it('sets preText and content', () => {
      const { lines } = new ReceiptBuilder().row('Fare:', 'KES 500').build();
      expect(lines[0]).toEqual({
        type: 'text',
        preText: 'Fare:',
        content: 'KES 500',
      });
    });
  });

  describe('text()', () => {
    it('sets content', () => {
      const { lines } = new ReceiptBuilder().text('Hello').build();
      expect(lines[0]).toEqual({ type: 'text', content: 'Hello' });
    });

    it('accepts all options', () => {
      const { lines } = new ReceiptBuilder()
        .text('Hello', { align: 'center', size: 'large', bold: true })
        .build();
      expect(lines[0]).toEqual({
        type: 'text',
        content: 'Hello',
        align: 'center',
        size: 'large',
        bold: true,
      });
    });
  });

  describe('divider()', () => {
    it('uses default char', () => {
      const { lines } = new ReceiptBuilder().divider().build();
      expect(lines[0]).toEqual({ type: 'divider', char: undefined });
    });

    it('accepts custom char', () => {
      const { lines } = new ReceiptBuilder().divider({ char: '=' }).build();
      expect(lines[0]).toEqual({ type: 'divider', char: '=' });
    });
  });

  describe('spacer()', () => {
    it('defaults to 1 line', () => {
      const { lines } = new ReceiptBuilder().spacer().build();
      expect(lines[0]).toEqual({ type: 'spacer', lines: 1 });
    });

    it('accepts custom line count', () => {
      const { lines } = new ReceiptBuilder().spacer(3).build();
      expect(lines[0]).toEqual({ type: 'spacer', lines: 3 });
    });
  });

  describe('qrCode()', () => {
    it('sets qrcode data', () => {
      const { lines } = new ReceiptBuilder()
        .qrCode('https://example.com')
        .build();
      expect(lines[0]).toEqual({
        type: 'qrcode',
        data: 'https://example.com',
      });
    });
  });

  describe('cut()', () => {
    it('adds a cut line', () => {
      const { lines } = new ReceiptBuilder().cut().build();
      expect(lines[0]).toEqual({ type: 'cut' });
    });
  });

  describe('build()', () => {
    it('passes paperWidth and printerProfile from config', () => {
      const data = new ReceiptBuilder({
        paperWidth: 80,
        printerProfile: 'c30',
      }).build();
      expect(data.paperWidth).toBe(80);
      expect(data.printerProfile).toBe('c30');
    });

    it('returns a copy of lines — builder can be reused', () => {
      const builder = new ReceiptBuilder().text('Hello');
      const first = builder.build();
      builder.text('World');
      const second = builder.build();

      expect(first.lines).toHaveLength(1);
      expect(second.lines).toHaveLength(2);
    });

    it('builds a full receipt in order', () => {
      const { lines } = new ReceiptBuilder()
        .header('ACME RIDES')
        .divider()
        .row('Fare:', 'KES 500')
        .spacer()
        .cut()
        .build();

      expect(lines).toHaveLength(5);
      expect(lines[0]!.type).toBe('text');
      expect(lines[1]!.type).toBe('divider');
      expect(lines[2]!.type).toBe('text');
      expect(lines[3]!.type).toBe('spacer');
      expect(lines[4]!.type).toBe('cut');
    });
  });
});

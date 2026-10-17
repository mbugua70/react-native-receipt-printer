// Must be called before any imports so Jest replaces the module before
// PrinterManager loads it — preventing native TurboModule errors in tests.
jest.mock('../bluetooth/BluetoothManager', () => ({
  getConnectedDevice: jest.fn(),
}));

import {
  print,
  splitPayload,
  NotConnectedError,
  PrintError,
} from '../printer/PrinterManager';
import * as BluetoothManager from '../bluetooth/BluetoothManager';
import type { ReceiptData } from '../printer/EscPosEncoder';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const receipt: ReceiptData = {
  lines: [
    { type: 'text', content: 'ACME RIDES', align: 'center', bold: true },
    { type: 'cut' },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockDevice(writeFn = jest.fn().mockResolvedValue(undefined)) {
  return { write: writeFn } as unknown as ReturnType<
    typeof BluetoothManager.getConnectedDevice
  >;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('print()', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws NotConnectedError when no device is connected', async () => {
    jest.spyOn(BluetoothManager, 'getConnectedDevice').mockReturnValue(null);
    await expect(print(receipt)).rejects.toThrow(NotConnectedError);
  });

  it('writes encoded data to the device once by default', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(BluetoothManager, 'getConnectedDevice')
      .mockReturnValue(mockDevice(write));

    await print(receipt);

    expect(write).toHaveBeenCalledTimes(1);
    expect(typeof write.mock.calls[0]![0]).toBe('string');
    expect(write.mock.calls[0]![0].length).toBeGreaterThan(0);
  });

  it('writes the correct number of copies', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(BluetoothManager, 'getConnectedDevice')
      .mockReturnValue(mockDevice(write));

    await print(receipt, { copies: 3 });

    expect(write).toHaveBeenCalledTimes(3);
  });

  it('sends identical bytes for each copy', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(BluetoothManager, 'getConnectedDevice')
      .mockReturnValue(mockDevice(write));

    await print(receipt, { copies: 2 });

    expect(write.mock.calls[0]![0]).toBe(write.mock.calls[1]![0]);
  });

  describe('retry logic', () => {
    it('retries on failure and succeeds if a later attempt works', async () => {
      const write = jest
        .fn()
        .mockRejectedValueOnce(new Error('BT hiccup'))
        .mockResolvedValueOnce(undefined);

      jest
        .spyOn(BluetoothManager, 'getConnectedDevice')
        .mockReturnValue(mockDevice(write));

      await expect(
        print(receipt, { retries: 2, retryDelayMs: 0 })
      ).resolves.toBeUndefined();
      expect(write).toHaveBeenCalledTimes(2);
    });

    it('throws PrintError after all retries are exhausted', async () => {
      const write = jest.fn().mockRejectedValue(new Error('BT failed'));
      jest
        .spyOn(BluetoothManager, 'getConnectedDevice')
        .mockReturnValue(mockDevice(write));

      await expect(
        print(receipt, { retries: 2, retryDelayMs: 0 })
      ).rejects.toThrow(PrintError);
      // 1 original + 2 retries = 3 total attempts
      expect(write).toHaveBeenCalledTimes(3);
    });

    it('includes attempt count in the PrintError message', async () => {
      const write = jest.fn().mockRejectedValue(new Error('BT failed'));
      jest
        .spyOn(BluetoothManager, 'getConnectedDevice')
        .mockReturnValue(mockDevice(write));

      await expect(
        print(receipt, { retries: 2, retryDelayMs: 0 })
      ).rejects.toThrow('3 attempt(s)');
    });

    it('does not retry when retries=0', async () => {
      const write = jest.fn().mockRejectedValue(new Error('BT failed'));
      jest
        .spyOn(BluetoothManager, 'getConnectedDevice')
        .mockReturnValue(mockDevice(write));

      await expect(print(receipt, { retries: 0 })).rejects.toThrow(PrintError);
      expect(write).toHaveBeenCalledTimes(1);
    });
  });
  describe('chunked writes', () => {
    const longReceipt: ReceiptData = {
      lines: Array.from({ length: 40 }, (_, i) => ({
        type: 'text' as const,
        content: `Passenger ${i + 1} — seat ${i + 1}`,
      })),
    };

    it('sends one write when chunkSize is not set', async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      jest
        .spyOn(BluetoothManager, 'getConnectedDevice')
        .mockReturnValue(mockDevice(write));

      await print(longReceipt);

      expect(write).toHaveBeenCalledTimes(1);
    });

    it('splits a copy into pieces that rejoin to the single-write bytes', async () => {
      const single = jest.fn().mockResolvedValue(undefined);
      jest
        .spyOn(BluetoothManager, 'getConnectedDevice')
        .mockReturnValue(mockDevice(single));
      await print(longReceipt);
      const whole = single.mock.calls[0]![0] as string;

      const write = jest.fn().mockResolvedValue(undefined);
      jest
        .spyOn(BluetoothManager, 'getConnectedDevice')
        .mockReturnValue(mockDevice(write));
      await print(longReceipt, { chunkSize: 64 });

      const pieces = write.mock.calls.map((c) => c[0] as string);
      expect(pieces.length).toBe(Math.ceil(whole.length / 64));
      expect(pieces.every((p) => p.length <= 64)).toBe(true);
      expect(pieces.join('')).toBe(whole);
    });

    it('retries only the piece that failed', async () => {
      const write = jest
        .fn()
        .mockResolvedValueOnce(undefined) // piece 1
        .mockRejectedValueOnce(new Error('BT failed')) // piece 2, try 1
        .mockResolvedValue(undefined); // piece 2 retry + the rest
      jest
        .spyOn(BluetoothManager, 'getConnectedDevice')
        .mockReturnValue(mockDevice(write));

      await print(longReceipt, { chunkSize: 64, retryDelayMs: 0 });

      expect(write.mock.calls[1]![0]).toBe(write.mock.calls[2]![0]);
    });

    it('stops the copy and throws PrintError when a piece keeps failing', async () => {
      const write = jest
        .fn()
        .mockResolvedValueOnce(undefined) // piece 1
        .mockRejectedValue(new Error('BT failed')); // piece 2 forever
      jest
        .spyOn(BluetoothManager, 'getConnectedDevice')
        .mockReturnValue(mockDevice(write));

      await expect(
        print(longReceipt, { chunkSize: 64, retries: 2, retryDelayMs: 0 })
      ).rejects.toThrow(PrintError);
      // piece 1 + 3 attempts at piece 2, nothing after
      expect(write).toHaveBeenCalledTimes(4);
    });
  });
});

describe('splitPayload()', () => {
  it('keeps the payload whole when chunkSize is 0 or larger than it', () => {
    expect(splitPayload('abcdef', 0)).toEqual(['abcdef']);
    expect(splitPayload('abcdef', 10)).toEqual(['abcdef']);
  });

  it('splits into pieces of at most chunkSize', () => {
    expect(splitPayload('abcdefg', 3)).toEqual(['abc', 'def', 'g']);
  });

  it('never splits a surrogate pair', () => {
    const pieces = splitPayload('ab😀cd', 3); // 😀 is two UTF-16 units
    expect(pieces).toEqual(['ab😀', 'cd']);
    expect(pieces.join('')).toBe('ab😀cd');
  });
});

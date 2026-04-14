// Must be called before any imports so Jest replaces the module before
// PrinterManager loads it — preventing native TurboModule errors in tests.
jest.mock('../bluetooth/BluetoothManager', () => ({
  getConnectedDevice: jest.fn(),
}));

import {
  print,
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
});

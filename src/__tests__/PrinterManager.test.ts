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
    // The encoded string must be a non-empty string of ESC/POS bytes
    expect(typeof write.mock.calls[0]![0]).toBe('string');
    expect(write.mock.calls[0]![0].length).toBeGreaterThan(0);
  });

  it('writes the correct number of copies', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(BluetoothManager, 'getConnectedDevice')
      .mockReturnValue(mockDevice(write));

    await print(receipt, 3);

    expect(write).toHaveBeenCalledTimes(3);
  });

  it('sends identical bytes for each copy', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(BluetoothManager, 'getConnectedDevice')
      .mockReturnValue(mockDevice(write));

    await print(receipt, 2);

    expect(write.mock.calls[0]![0]).toBe(write.mock.calls[1]![0]);
  });

  it('throws PrintError when the device write fails', async () => {
    const write = jest.fn().mockRejectedValue(new Error('BT write failed'));
    jest
      .spyOn(BluetoothManager, 'getConnectedDevice')
      .mockReturnValue(mockDevice(write));

    await expect(print(receipt)).rejects.toThrow(PrintError);
  });

  it('includes the copy number in the PrintError message', async () => {
    const write = jest
      .fn()
      .mockResolvedValueOnce(undefined) // copy 1 succeeds
      .mockRejectedValueOnce(new Error('BT write failed')); // copy 2 fails

    jest
      .spyOn(BluetoothManager, 'getConnectedDevice')
      .mockReturnValue(mockDevice(write));

    await expect(print(receipt, 2)).rejects.toThrow('copy 2 of 2');
  });
});

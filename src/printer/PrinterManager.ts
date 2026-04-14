import { getConnectedDevice } from '../bluetooth/BluetoothManager';
import { encode, type ReceiptData } from './EscPosEncoder';

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Thrown when `print()` is called but no Bluetooth device is connected.
 * The caller should check `isConnected()` or call `connect()` first.
 */
export class NotConnectedError extends Error {
  constructor() {
    super('No Bluetooth device is connected. Call connect() before printing.');
    this.name = 'NotConnectedError';
  }
}

/**
 * Thrown when `print()` fails to write data to the connected device.
 * Wraps the underlying error from the Bluetooth layer.
 */
export class PrintError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'PrintError';
    this.cause = cause;
  }
}

// ─── print() ──────────────────────────────────────────────────────────────────

/**
 * Encode a receipt and write it to the connected Bluetooth printer.
 *
 * - Requires an active connection — call `connect()` before printing.
 * - `copies` controls how many times the receipt is printed (default: 1).
 * - Each copy is sent as a separate write to the device.
 *
 * @throws {NotConnectedError} if no device is connected
 * @throws {PrintError}        if the write to the device fails
 *
 * @example
 * ```ts
 * await connect(device.address);
 *
 * const receipt = new ReceiptBuilder()
 *   .header('ACME RIDES')
 *   .row('Fare:', 'KES 500')
 *   .cut()
 *   .build();
 *
 * await print(receipt);          // 1 copy
 * await print(receipt, 2);       // 2 copies
 * ```
 */
export async function print(
  data: ReceiptData,
  copies: number = 1
): Promise<void> {
  const device = getConnectedDevice();

  if (!device) {
    throw new NotConnectedError();
  }

  const encoded = encode(data);

  for (let i = 0; i < copies; i++) {
    try {
      await device.write(encoded);
    } catch (err) {
      throw new PrintError(
        `Failed to write to printer on copy ${i + 1} of ${copies}.`,
        err
      );
    }
  }
}

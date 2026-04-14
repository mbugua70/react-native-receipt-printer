import { getConnectedDevice } from '../bluetooth/BluetoothManager';
import { encode, type ReceiptData } from './EscPosEncoder';
import { emitPrintStatus } from './PrintEvents';

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
 * Thrown when `print()` fails to write data to the connected device after
 * all retry attempts are exhausted. Wraps the last underlying error.
 */
export class PrintError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'PrintError';
    this.cause = cause;
  }
}

// ─── Options ──────────────────────────────────────────────────────────────────

export type PrintOptions = {
  /**
   * How many receipts to print.
   * Default: 1.
   */
  copies?: number;

  /**
   * How many times to retry a failed write before giving up.
   * Default: 2 — meaning up to 3 total attempts per copy.
   * Set to 0 to disable retries entirely.
   */
  retries?: number;

  /**
   * How long to wait between retry attempts in milliseconds.
   * Default: 500ms — gives the printer time to recover.
   */
  retryDelayMs?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── print() ──────────────────────────────────────────────────────────────────

/**
 * Encode a receipt and write it to the connected Bluetooth printer.
 *
 * - Requires an active connection — call `connect()` before printing.
 * - Retries failed writes automatically before giving up.
 * - Each copy is sent as a separate write to the device.
 *
 * @throws {NotConnectedError} if no device is connected
 * @throws {PrintError}        if all retry attempts fail
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
 * await print(receipt);                              // 1 copy, 2 retries
 * await print(receipt, { copies: 2 });              // 2 copies, 2 retries
 * await print(receipt, { copies: 1, retries: 5 });  // 1 copy, up to 5 retries
 * await print(receipt, { copies: 1, retries: 0 });  // 1 copy, no retries
 * ```
 */
export async function print(
  data: ReceiptData,
  options: PrintOptions = {}
): Promise<void> {
  const { copies = 1, retries = 2, retryDelayMs = 500 } = options;

  const device = getConnectedDevice();

  if (!device) {
    throw new NotConnectedError();
  }

  const encoded = encode(data);

  for (let copy = 0; copy < copies; copy++) {
    const copyNumber = copy + 1;
    let lastError: unknown;

    emitPrintStatus({
      status: 'sending',
      copy: copyNumber,
      totalCopies: copies,
    });

    // attempt 0 is the first try, attempts 1..retries are the retries
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await device.write(encoded);
        lastError = undefined;
        break; // success — move on to the next copy
      } catch (err) {
        lastError = err;

        const isLastAttempt = attempt === retries;
        if (!isLastAttempt) {
          await delay(retryDelayMs);
        }
      }
    }

    if (lastError !== undefined) {
      const error =
        lastError instanceof Error ? lastError : new Error(String(lastError));

      emitPrintStatus({
        status: 'error',
        copy: copyNumber,
        totalCopies: copies,
        error,
      });

      throw new PrintError(
        `Failed to print copy ${copyNumber} of ${copies} after ${
          retries + 1
        } attempt(s).`,
        error
      );
    }

    emitPrintStatus({ status: 'done', copy: copyNumber, totalCopies: copies });
  }
}

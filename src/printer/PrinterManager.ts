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

  /**
   * Send each copy in pieces of at most this many characters instead of one
   * write. Some printers (e.g. POS built-in ones) print short receipts fine
   * but drop the connection on one long write. Each piece gets its own
   * retries. Default: 0 — the whole copy in a single write.
   */
  chunkSize?: number;

  /**
   * Pause between pieces in milliseconds when `chunkSize` is set, giving the
   * printer's buffer time to drain. Default: 0.
   */
  chunkDelayMs?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Split an encoded payload into pieces of at most `chunkSize` characters.
 * Never splits a surrogate pair, so a character like an emoji isn't cut in
 * half. `chunkSize` of 0 (or anything not positive) keeps one piece.
 */
export function splitPayload(payload: string, chunkSize: number): string[] {
  if (!(chunkSize > 0) || payload.length <= chunkSize) return [payload];

  const chunks: string[] = [];
  let start = 0;
  while (start < payload.length) {
    let end = Math.min(start + chunkSize, payload.length);
    const last = payload.charCodeAt(end - 1);
    if (end < payload.length && last >= 0xd800 && last <= 0xdbff) end++;
    chunks.push(payload.slice(start, end));
    start = end;
  }
  return chunks;
}

// ─── print() ──────────────────────────────────────────────────────────────────

/**
 * Encode a receipt and write it to the connected Bluetooth printer.
 *
 * - Requires an active connection — call `connect()` before printing.
 * - Retries failed writes automatically before giving up.
 * - Each copy is sent as a separate write to the device, or in pieces of
 *   `chunkSize` characters (each with its own retries) when that is set.
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
  const {
    copies = 1,
    retries = 2,
    retryDelayMs = 500,
    chunkSize = 0,
    chunkDelayMs = 0,
  } = options;

  const device = getConnectedDevice();

  if (!device) {
    throw new NotConnectedError();
  }

  const chunks = splitPayload(encode(data), chunkSize);

  for (let copy = 0; copy < copies; copy++) {
    const copyNumber = copy + 1;
    let lastError: unknown;

    emitPrintStatus({
      status: 'sending',
      copy: copyNumber,
      totalCopies: copies,
    });

    for (let part = 0; part < chunks.length; part++) {
      // attempt 0 is the first try, attempts 1..retries are the retries
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          await device.write(chunks[part]!);
          lastError = undefined;
          break; // success — move on to the next piece
        } catch (err) {
          lastError = err;

          const isLastAttempt = attempt === retries;
          if (!isLastAttempt) {
            await delay(retryDelayMs);
          }
        }
      }

      if (lastError !== undefined) break; // this piece failed — stop the copy

      const isLastPart = part === chunks.length - 1;
      if (!isLastPart && chunkDelayMs > 0) {
        await delay(chunkDelayMs);
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

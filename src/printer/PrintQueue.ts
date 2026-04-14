import { print as rawPrint, type PrintOptions } from './PrinterManager';
import type { ReceiptData } from './EscPosEncoder';

// ─── Job type ─────────────────────────────────────────────────────────────────

type PrintJob = {
  data: ReceiptData;
  options: PrintOptions;
  resolve: () => void;
  reject: (err: unknown) => void;
};

// ─── Queue state ──────────────────────────────────────────────────────────────

const _queue: PrintJob[] = [];
let _processing = false;

// ─── processNext ──────────────────────────────────────────────────────────────

async function processNext(): Promise<void> {
  if (_processing || _queue.length === 0) return;

  _processing = true;

  const job = _queue.shift()!;

  try {
    await rawPrint(job.data, job.options);
    job.resolve();
  } catch (err) {
    job.reject(err);
  } finally {
    _processing = false;
    processNext().catch(() => {});
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Add a print job to the queue.
 *
 * Returns a Promise that resolves when this specific job finishes printing,
 * or rejects if it fails. Jobs are processed one at a time in the order
 * they were enqueued.
 *
 * @example
 * ```ts
 * enqueue(receipt);                              // fire and forget
 * await enqueue(receipt, { copies: 2 });         // wait for completion
 * await enqueue(receipt, { retries: 5 });        // more retries
 * ```
 */
export function enqueue(
  data: ReceiptData,
  options: PrintOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    _queue.push({ data, options, resolve, reject });
    processNext().catch(() => {});
  });
}

/**
 * How many jobs are waiting in the queue (not counting the one currently
 * printing).
 */
export function getQueueLength(): number {
  return _queue.length;
}

/**
 * Whether a job is currently being sent to the printer.
 */
export function isProcessing(): boolean {
  return _processing;
}

/**
 * Remove all pending jobs from the queue.
 * The job currently printing is not affected — it will finish normally.
 */
export function clearQueue(): void {
  for (const job of _queue) {
    job.reject(new Error('Print queue was cleared.'));
  }
  _queue.length = 0;
}

import { print as rawPrint } from './PrinterManager';
import type { ReceiptData } from './EscPosEncoder';

// ─── Job type ─────────────────────────────────────────────────────────────────
//
// Each item in the queue is a print job. It holds the receipt data, the number
// of copies, and the resolve/reject callbacks of the Promise returned to the
// caller. When the job finishes, we call resolve() or reject() to settle that
// Promise.

type PrintJob = {
  data: ReceiptData;
  copies: number;
  resolve: () => void;
  reject: (err: unknown) => void;
};

// ─── Queue state ──────────────────────────────────────────────────────────────

const _queue: PrintJob[] = [];
let _processing = false;

// ─── processNext ──────────────────────────────────────────────────────────────
//
// Picks the next job off the front of the queue and runs it.
// Called after every job finishes (success or failure) so the queue keeps
// moving. If the queue is empty or a job is already running, it returns early.

async function processNext(): Promise<void> {
  if (_processing || _queue.length === 0) return;

  _processing = true;

  // shift() removes and returns the first item — FIFO order
  const job = _queue.shift()!;

  try {
    await rawPrint(job.data, job.copies);
    job.resolve();
  } catch (err) {
    // The job failed — reject its promise so the caller is notified.
    // The queue continues with the next job regardless.
    job.reject(err);
  } finally {
    _processing = false;
    // Kick off the next job without awaiting — keeps the call stack clean.
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
 * // Fire and forget — don't wait
 * enqueue(receipt);
 *
 * // Or await if you need to know when it's done
 * await enqueue(receipt, 2);
 * ```
 */
export function enqueue(data: ReceiptData, copies: number = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    _queue.push({ data, copies, resolve, reject });
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
  // Reject all waiting jobs so their Promises don't hang forever
  for (const job of _queue) {
    job.reject(new Error('Print queue was cleared.'));
  }
  _queue.length = 0;
}

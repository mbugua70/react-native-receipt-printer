// ─── Event types ──────────────────────────────────────────────────────────────

/**
 * Fired just before a copy is written to the printer.
 * Use this to show a spinner or progress indicator.
 */
export type PrintSendingEvent = {
  status: 'sending';
  /** Which copy is being sent (1-based). */
  copy: number;
  /** Total copies requested. */
  totalCopies: number;
};

/**
 * Fired after a copy has been written to the printer successfully.
 */
export type PrintDoneEvent = {
  status: 'done';
  copy: number;
  totalCopies: number;
};

/**
 * Fired when a copy fails after all retry attempts are exhausted.
 */
export type PrintErrorEvent = {
  status: 'error';
  copy: number;
  totalCopies: number;
  /** The error that caused the failure. */
  error: Error;
};

/** Union of all print status events. */
export type PrintStatusEvent =
  | PrintSendingEvent
  | PrintDoneEvent
  | PrintErrorEvent;

export type PrintStatusListener = (event: PrintStatusEvent) => void;

// ─── Emitter ──────────────────────────────────────────────────────────────────
//
// A simple pub/sub store. `emit()` is called internally by PrinterManager.
// `onPrintStatus()` is the public API for subscribing.

const _listeners = new Set<PrintStatusListener>();

/**
 * Subscribe to print status events.
 *
 * Returns an `unsubscribe` function — call it when you no longer need
 * the events (e.g. in a useEffect cleanup or component unmount).
 *
 * @example
 * ```ts
 * const unsubscribe = onPrintStatus((event) => {
 *   if (event.status === 'sending') showSpinner();
 *   if (event.status === 'done')    hideSpinner();
 *   if (event.status === 'error')   showError(event.error.message);
 * });
 *
 * // later
 * unsubscribe();
 * ```
 */
export function onPrintStatus(listener: PrintStatusListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/**
 * Emit a print status event to all active listeners.
 * Called internally by PrinterManager — not part of the public API.
 */
export function emitPrintStatus(event: PrintStatusEvent): void {
  for (const listener of _listeners) {
    listener(event);
  }
}

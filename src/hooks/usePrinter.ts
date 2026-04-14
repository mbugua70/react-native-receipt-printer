import { useState, useCallback, useEffect } from 'react';
import { enqueue } from '../printer/PrintQueue';
import { onPrintStatus } from '../printer/PrintEvents';
import type { ReceiptData } from '../printer/EscPosEncoder';
import type { PrintOptions } from '../printer/PrinterManager';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The current print status as a simple string — useful for UI labels. */
export type PrintStatus = 'idle' | 'sending' | 'done' | 'error';

export type UsePrinterReturn = {
  /**
   * Send a receipt to the printer.
   *
   * - Adds the job to the print queue — safe to call multiple times.
   * - `isPrinting` is `true` until this call resolves or rejects.
   * - On failure, `error` is set and the error is rethrown.
   *
   * @example
   * ```tsx
   * const { print, isPrinting, error } = usePrinter();
   *
   * <Button
   *   onPress={() => print(receipt)}
   *   disabled={isPrinting}
   * />
   * ```
   */
  print: (data: ReceiptData, options?: PrintOptions) => Promise<void>;

  /** True while this hook's print call is in flight. */
  isPrinting: boolean;

  /** The last error from a failed print, or null if no error. */
  error: Error | null;

  /**
   * The current print status.
   * - `idle`    — nothing is printing
   * - `sending` — bytes are being written to the printer
   * - `done`    — last copy printed successfully
   * - `error`   — last copy failed
   */
  status: PrintStatus;
};

// ─── usePrinter ───────────────────────────────────────────────────────────────

/**
 * React hook for printing receipts.
 *
 * Wraps the print queue with React state so you can bind `isPrinting`
 * directly to a button's `disabled` prop, show errors from `error`,
 * and display fine-grained progress from `status`.
 *
 * @example
 * ```tsx
 * function PrintButton({ receipt }: { receipt: ReceiptData }) {
 *   const { print, isPrinting, status, error } = usePrinter();
 *
 *   return (
 *     <>
 *       <Button
 *         title={isPrinting ? 'Printing...' : 'Print'}
 *         onPress={() => print(receipt)}
 *         disabled={isPrinting}
 *       />
 *       <Text>{status}</Text>
 *       {error && <Text>{error.message}</Text>}
 *     </>
 *   );
 * }
 * ```
 */
export function usePrinter(): UsePrinterReturn {
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<PrintStatus>('idle');

  // Subscribe to print status events for fine-grained progress updates.
  // Unsubscribe automatically when the component unmounts.
  useEffect(() => {
    const unsubscribe = onPrintStatus((event) => {
      setStatus(event.status);
    });
    return unsubscribe;
  }, []);

  const print = useCallback(
    async (data: ReceiptData, options: PrintOptions = {}): Promise<void> => {
      setIsPrinting(true);
      setError(null);

      try {
        await enqueue(data, options);
      } catch (err) {
        const printError = err instanceof Error ? err : new Error(String(err));
        setError(printError);
        throw printError;
      } finally {
        setIsPrinting(false);
      }
    },
    []
  );

  return { print, isPrinting, error, status };
}

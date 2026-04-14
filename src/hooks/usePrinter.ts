import { useState, useCallback } from 'react';
import { enqueue } from '../printer/PrintQueue';
import type { ReceiptData } from '../printer/EscPosEncoder';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UsePrinterReturn = {
  /**
   * Send a receipt to the printer.
   *
   * - Adds the job to the print queue — safe to call multiple times.
   * - `copies` defaults to 1.
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
  print: (data: ReceiptData, copies?: number) => Promise<void>;

  /** True while this hook's print call is in flight. */
  isPrinting: boolean;

  /** The last error from a failed print, or null if no error. */
  error: Error | null;
};

// ─── usePrinter ───────────────────────────────────────────────────────────────

/**
 * React hook for printing receipts.
 *
 * Wraps the print queue with React state so you can bind `isPrinting`
 * directly to a button's `disabled` prop and show errors from `error`.
 *
 * @example
 * ```tsx
 * function PrintButton({ receipt }: { receipt: ReceiptData }) {
 *   const { print, isPrinting, error } = usePrinter();
 *
 *   return (
 *     <>
 *       <Button
 *         title={isPrinting ? 'Printing...' : 'Print'}
 *         onPress={() => print(receipt)}
 *         disabled={isPrinting}
 *       />
 *       {error && <Text>{error.message}</Text>}
 *     </>
 *   );
 * }
 * ```
 */
export function usePrinter(): UsePrinterReturn {
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const print = useCallback(
    async (data: ReceiptData, copies: number = 1): Promise<void> => {
      setIsPrinting(true);
      setError(null);

      try {
        await enqueue(data, copies);
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

  return { print, isPrinting, error };
}

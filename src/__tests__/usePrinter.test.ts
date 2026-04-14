// Mock the print queue so no Bluetooth or native code runs in tests
jest.mock('../printer/PrintQueue', () => ({
  enqueue: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react-native';
import { usePrinter } from '../hooks/usePrinter';
import * as PrintQueue from '../printer/PrintQueue';
import type { ReceiptData } from '../printer/EscPosEncoder';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const receipt: ReceiptData = {
  lines: [{ type: 'text', content: 'Test' }],
};

const mockEnqueue = PrintQueue.enqueue as jest.MockedFunction<
  typeof PrintQueue.enqueue
>;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('usePrinter', () => {
  beforeEach(() => {
    mockEnqueue.mockReset();
  });

  it('starts with isPrinting=false and error=null', () => {
    const { result } = renderHook(() => usePrinter());

    expect(result.current.isPrinting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isPrinting=true while printing', async () => {
    let resolveJob!: () => void;
    mockEnqueue.mockImplementation(
      () => new Promise<void>((resolve) => (resolveJob = resolve))
    );

    const { result } = renderHook(() => usePrinter());

    act(() => {
      result.current.print(receipt).catch(() => {});
    });

    expect(result.current.isPrinting).toBe(true);

    await act(async () => {
      resolveJob();
    });

    expect(result.current.isPrinting).toBe(false);
  });

  it('clears isPrinting and error on success', async () => {
    mockEnqueue.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePrinter());

    await act(async () => {
      await result.current.print(receipt);
    });

    expect(result.current.isPrinting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error and clears isPrinting on failure', async () => {
    mockEnqueue.mockRejectedValue(new Error('printer offline'));

    const { result } = renderHook(() => usePrinter());

    await act(async () => {
      await result.current.print(receipt).catch(() => {});
    });

    expect(result.current.isPrinting).toBe(false);
    expect(result.current.error?.message).toBe('printer offline');
  });

  it('rethrows the error so the caller can handle it', async () => {
    mockEnqueue.mockRejectedValue(new Error('printer offline'));

    const { result } = renderHook(() => usePrinter());

    await act(async () => {
      await expect(result.current.print(receipt)).rejects.toThrow(
        'printer offline'
      );
    });
  });

  it('clears the previous error on a new print attempt', async () => {
    mockEnqueue
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => usePrinter());

    await act(async () => {
      await result.current.print(receipt).catch(() => {});
    });

    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.print(receipt);
    });

    expect(result.current.error).toBeNull();
  });

  it('passes options to enqueue', async () => {
    mockEnqueue.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePrinter());

    await act(async () => {
      await result.current.print(receipt, { copies: 3, retries: 1 });
    });

    expect(mockEnqueue).toHaveBeenCalledWith(receipt, {
      copies: 3,
      retries: 1,
    });
  });
});

// Mock PrinterManager so no Bluetooth or native code runs in tests
jest.mock('../printer/PrinterManager', () => ({
  print: jest.fn(),
}));

import { enqueue, getQueueLength, clearQueue } from '../printer/PrintQueue';
import * as PrinterManager from '../printer/PrinterManager';
import type { ReceiptData } from '../printer/EscPosEncoder';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const receipt: ReceiptData = {
  lines: [{ type: 'text', content: 'Test' }],
};

const mockPrint = PrinterManager.print as jest.MockedFunction<
  typeof PrinterManager.print
>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flush all pending microtasks and timers */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PrintQueue', () => {
  beforeEach(() => {
    mockPrint.mockReset();
    clearQueue();
  });

  describe('enqueue()', () => {
    it('calls print() with the receipt data', async () => {
      mockPrint.mockResolvedValue(undefined);

      await enqueue(receipt);

      expect(mockPrint).toHaveBeenCalledWith(receipt, 1);
    });

    it('passes copies to print()', async () => {
      mockPrint.mockResolvedValue(undefined);

      await enqueue(receipt, 3);

      expect(mockPrint).toHaveBeenCalledWith(receipt, 3);
    });

    it('resolves when the job succeeds', async () => {
      mockPrint.mockResolvedValue(undefined);

      await expect(enqueue(receipt)).resolves.toBeUndefined();
    });

    it('rejects when print() throws', async () => {
      mockPrint.mockRejectedValue(new Error('BT failed'));

      await expect(enqueue(receipt)).rejects.toThrow('BT failed');
    });
  });

  describe('serial processing', () => {
    it('processes jobs one at a time', async () => {
      // Each job resolves after a short delay so we can observe ordering
      const order: number[] = [];

      mockPrint.mockImplementation(async () => {
        await flush();
      });

      const job1 = enqueue(receipt).then(() => order.push(1));
      const job2 = enqueue(receipt).then(() => order.push(2));
      const job3 = enqueue(receipt).then(() => order.push(3));

      await Promise.all([job1, job2, job3]);

      expect(order).toEqual([1, 2, 3]);
    });

    it('processes the second job after the first finishes', async () => {
      let firstDone = false;

      mockPrint
        .mockImplementationOnce(async () => {
          await flush();
          firstDone = true;
        })
        .mockImplementationOnce(async () => {
          // By the time the second job runs, the first must be done
          expect(firstDone).toBe(true);
        });

      await Promise.all([enqueue(receipt), enqueue(receipt)]);
    });

    it('continues processing after a failed job', async () => {
      mockPrint
        .mockRejectedValueOnce(new Error('job 1 failed'))
        .mockResolvedValueOnce(undefined);

      const job1 = enqueue(receipt).catch(() => 'failed');
      const job2 = enqueue(receipt).then(() => 'success');

      const [result1, result2] = await Promise.all([job1, job2]);

      expect(result1).toBe('failed');
      expect(result2).toBe('success');
      expect(mockPrint).toHaveBeenCalledTimes(2);
    });
  });

  describe('getQueueLength()', () => {
    it('returns 0 when the queue is empty', () => {
      expect(getQueueLength()).toBe(0);
    });
  });

  describe('clearQueue()', () => {
    it('rejects all pending jobs', async () => {
      // Hold the first job open so jobs 2 and 3 pile up in the queue
      let releaseFirstJob!: () => void;
      mockPrint.mockImplementationOnce(
        () => new Promise((resolve) => (releaseFirstJob = resolve))
      );

      const job1 = enqueue(receipt);
      const job2 = enqueue(receipt).catch((e: Error) => e.message);
      const job3 = enqueue(receipt).catch((e: Error) => e.message);

      await flush();

      clearQueue();
      releaseFirstJob();

      const [, msg2, msg3] = await Promise.all([job1, job2, job3]);

      expect(msg2).toBe('Print queue was cleared.');
      expect(msg3).toBe('Print queue was cleared.');
    });
  });
});

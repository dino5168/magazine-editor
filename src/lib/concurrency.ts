/**
 * Runs at most `max` jobs at once; the rest wait in order. Used for work the cards start as they
 * scroll into view (thumbnails, audio durations), so a large library does not start everything at
 * once.
 *
 * Args:
 *   max: How many jobs may run at the same time (≥ 1).
 *
 * Returns:
 *   `run(job)`, resolving to the job's result once it had a slot and finished.
 */
export function createLimiter(max: number): <T>(job: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (running >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      return await job();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };
}

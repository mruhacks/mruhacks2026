import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

export interface RateLimiter {
  /** Consume one point for `key`. Returns ms to wait if limit is exceeded, null if allowed. */
  consume(key: string): Promise<{ retryAfterMs: number } | null>;
}

export function createRateLimiter(opts: {
  /** Max attempts allowed within `windowSeconds`. */
  points: number;
  /** Window size in seconds. */
  windowSeconds: number;
}): RateLimiter {
  const limiter = new RateLimiterMemory({
    points: opts.points,
    duration: opts.windowSeconds,
  });

  return {
    async consume(key) {
      try {
        await limiter.consume(key);
        return null;
      } catch (err) {
        if (err instanceof RateLimiterRes) {
          return { retryAfterMs: Math.ceil(err.msBeforeNext) };
        }
        throw err;
      }
    },
  };
}

import { auth } from '@/utils/auth';
import { createRateLimiter } from '@/utils/rate-limit';

const limiter = createRateLimiter({ points: 1, windowSeconds: 30 });

export async function POST(req: Request) {
  let email: string | undefined;
  try {
    const body = await req.clone().json();
    email = typeof body?.email === 'string' ? body.email : undefined;
  } catch {
    // malformed body — let Better Auth handle it
  }

  if (email) {
    const result = await limiter.consume(email);
    if (result) {
      return Response.json(
        { message: 'Please wait before requesting another verification email.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) },
        },
      );
    }
  }

  return auth.handler(req);
}

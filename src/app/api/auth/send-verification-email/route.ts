import { auth } from '@/utils/auth';

export async function POST(req: Request) {
  // Better Auth uses its database-backed rate-limit store, which remains
  // consistent across server processes and serverless invocations.
  return auth.handler(req);
}

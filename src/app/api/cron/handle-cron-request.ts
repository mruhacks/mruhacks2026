/**
 * Shared request shell for `/api/cron/*` routes: bearer auth, 401, run, 200, or 500.
 */
export async function handleCronRequest<T>(
  request: Request,
  options: {
    logLabel: string;
    extraSecrets?: string[];
    run: () => Promise<T>;
    failureBody: unknown;
  },
): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error(`${options.logLabel} CRON_SECRET is not configured`);
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [scheme, token] = authorization.split(' ');
  const extraSecrets = options.extraSecrets ?? [];
  const authorized =
    scheme?.toLowerCase() === 'bearer' &&
    (token === secret || extraSecrets.includes(token));

  if (!authorized) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await options.run();
    return Response.json(result);
  } catch (error) {
    console.error(`${options.logLabel} failed`, error);
    return Response.json(options.failureBody, { status: 500 });
  }
}

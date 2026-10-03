/**
 * Bearer tokens accepted by every `/api/cron/*` route: `CRON_MANUAL_SECRET`
 * (the Cloudflare Worker scheduler in `workers/rsvp-cron`, or manual curl
 * triggers) and, optionally, `CRON_SECRET`.
 */
function configuredCronSecrets(): string[] {
  return [process.env.CRON_SECRET, process.env.CRON_MANUAL_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

/**
 * Shared request shell for `/api/cron/*` routes: bearer auth, 401, run, 200, or 500.
 */
export async function handleCronRequest<T>(
  request: Request,
  options: {
    logLabel: string;
    run: () => Promise<T>;
    failureBody: unknown;
  },
): Promise<Response> {
  const secrets = configuredCronSecrets();
  if (secrets.length === 0) {
    console.error(
      `${options.logLabel} no cron secret configured (CRON_SECRET or CRON_MANUAL_SECRET)`,
    );
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [scheme, token] = authorization.split(' ');
  const authorized =
    scheme?.toLowerCase() === 'bearer' &&
    token !== undefined &&
    secrets.includes(token);

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

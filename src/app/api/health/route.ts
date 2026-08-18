import { timingSafeEqual } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/utils/db';
import { getUser } from '@/utils/auth';
import { hasRole } from '@/lib/rbac/authorization';
import { verifyMailConnection } from '@/utils/mail';
import { checkObjectStorageConnection } from '@/utils/object-storage';

const CHECK_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 10_000;

/** Vars required for the app to be fully functional. Presence-only — never logged or echoed. */
const REQUIRED_ENV_VARS = [
  'BETTER_AUTH_URL',
  'TURNSTILE_SECRET_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'EMAIL_FROM',
  'S3_BUCKET',
] as const;

type CheckResult = { ok: boolean; latencyMs: number; detail?: string };

/** Runs `fn`, capping it at CHECK_TIMEOUT_MS. Never rethrows — failures become `ok: false`. */
async function timed(fn: () => Promise<void>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS),
      ),
    ]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    const detail =
      error instanceof Error && error.message === 'timeout'
        ? 'timeout'
        : 'unreachable';
    return { ok: false, latencyMs: Date.now() - start, detail };
  }
}

function checkDatabase(): Promise<CheckResult> {
  return timed(async () => {
    await db.execute(sql`SELECT 1`);
  });
}

function checkMail(): Promise<CheckResult> {
  return timed(verifyMailConnection);
}

function checkObjectStorage(): Promise<CheckResult> {
  return timed(checkObjectStorageConnection);
}

/**
 * Cloudflare Turnstile has no persistent connection to probe, so this sends a
 * deliberately bogus response token to siteverify. Reaching the API and
 * getting a well-formed answer back — even a rejection — proves the service
 * and secret key are good; only a network failure or an "invalid secret"
 * verdict counts as unhealthy.
 */
async function checkTurnstile(): Promise<CheckResult> {
  const start = Date.now();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: false, latencyMs: 0, detail: 'not configured' };
  }
  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: 'health-check-probe' }),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      },
    );
    const data = (await res.json().catch(() => null)) as {
      'error-codes'?: string[];
    } | null;
    const errors = data?.['error-codes'] ?? [];
    if (errors.includes('invalid-input-secret')) {
      return { ok: false, latencyMs: Date.now() - start, detail: 'invalid secret' };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start, detail: 'unreachable' };
  }
}

function missingEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim());
}

type HealthReport = {
  status: 'ok' | 'degraded' | 'down';
  checks: {
    database: CheckResult;
    mail: CheckResult;
    objectStorage: CheckResult;
    turnstile: CheckResult;
  };
  missingEnv: string[];
  checkedAt: string;
};

let cached: { report: HealthReport; expiresAt: number } | null = null;

/** Cached briefly so a burst of probes (monitors, or abuse) can't hammer every
 *  upstream service on every request. */
async function buildReport(): Promise<HealthReport> {
  if (cached && cached.expiresAt > Date.now()) return cached.report;

  const [database, mail, objectStorage, turnstile] = await Promise.all([
    checkDatabase(),
    checkMail(),
    checkObjectStorage(),
    checkTurnstile(),
  ]);
  const missingEnv = missingEnvVars();

  const status: HealthReport['status'] = !database.ok
    ? 'down'
    : mail.ok && objectStorage.ok && turnstile.ok && missingEnv.length === 0
      ? 'ok'
      : 'degraded';

  const report: HealthReport = {
    status,
    checks: { database, mail, objectStorage, turnstile },
    missingEnv,
    checkedAt: new Date().toISOString(),
  };
  cached = { report, expiresAt: Date.now() + CACHE_TTL_MS };
  return report;
}

/** Constant-time string compare — a naive `===` would let an attacker time
 *  their way to the real key one byte at a time. */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Grants full-report access to external callers (uptime monitors, status
 * pages) that can't hold an admin session. Fails closed: if
 * HEALTH_CHECK_ACCESS_KEY isn't set, no key can pass this check.
 */
function hasValidAccessKey(request: Request): boolean {
  const configured = process.env.HEALTH_CHECK_ACCESS_KEY?.trim();
  if (!configured) return false;
  const provided = request.headers.get('x-health-access-key')?.trim();
  if (!provided) return false;
  return safeCompare(provided, configured);
}

/**
 * GET /api/health
 *
 * Unauthenticated callers (uptime monitors, load balancers) get only the
 * overall status — no service names, error detail, or config state, so a
 * scan of this endpoint can't be used to map out our infrastructure.
 * The full per-service breakdown is available to signed-in admins, or to
 * anyone presenting the `x-health-access-key` header matching
 * HEALTH_CHECK_ACCESS_KEY (for external monitoring tools).
 */
export async function GET(request: Request) {
  const report = await buildReport();
  const httpStatus = report.status === 'down' ? 503 : 200;

  const user = await getUser().catch(() => null);
  const isAdmin = user ? await hasRole(user.id, 'admin') : false;
  const hasFullAccess = isAdmin || hasValidAccessKey(request);

  if (!hasFullAccess) {
    return Response.json({ status: report.status }, { status: httpStatus });
  }

  return Response.json(report, { status: httpStatus });
}

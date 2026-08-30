import { timingSafeEqual } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/utils/db';
import { getUser } from '@/utils/auth';
import { hasPermission } from '@/lib/rbac/authorization';
import { verifyMailConnection } from '@/utils/mail';
import { checkObjectStorageConnection } from '@/utils/object-storage';
import { MRUHACKS_LOGO_URL } from '@/content';

/** Dedicated permission for the full health report — unrelated to any other admin permission. */
const HEALTH_PERMISSION = 'system:read:all';

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
  'GOOGLE_WALLET_ISSUER_ID',
  'GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_WALLET_SERVICE_ACCOUNT_PRIVATE_KEY',
  'APPLE_WALLET_WWDR_CERT',
  'APPLE_WALLET_SIGNER_CERT',
  'APPLE_WALLET_SIGNER_KEY',
  'CHECK_IN_SIGNING_PRIVATE_KEY',
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
      return {
        ok: false,
        latencyMs: Date.now() - start,
        detail: 'invalid secret',
      };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start, detail: 'unreachable' };
  }
}

/**
 * Google Wallet needs both its issuer credentials (checked here, since a
 * missing/invalid one fails silently until someone actually clicks "Add to
 * Google Wallet") and its externally-hosted logo — Google's servers fetch
 * that URL directly when rendering the pass, so a dead link breaks every
 * pass without ever touching our own error logs.
 */
async function checkGoogleWallet(): Promise<CheckResult> {
  const start = Date.now();
  const missing = [
    'GOOGLE_WALLET_ISSUER_ID',
    'GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_WALLET_SERVICE_ACCOUNT_PRIVATE_KEY',
  ].filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    return { ok: false, latencyMs: 0, detail: 'not configured' };
  }
  try {
    const res = await fetch(MRUHACKS_LOGO_URL, {
      method: 'HEAD',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        detail: `logo unreachable (${res.status})`,
      };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      detail: 'logo unreachable',
    };
  }
}

/**
 * Presence-only, deliberately: these env vars hold private key material,
 * and this route has no business ever decoding or loading them into memory
 * just to answer a health probe.
 */
async function checkAppleWallet(): Promise<CheckResult> {
  const missing = [
    'APPLE_WALLET_WWDR_CERT',
    'APPLE_WALLET_SIGNER_CERT',
    'APPLE_WALLET_SIGNER_KEY',
  ].filter((name) => !process.env[name]?.trim());
  return missing.length > 0
    ? { ok: false, latencyMs: 0, detail: 'not configured' }
    : { ok: true, latencyMs: 0 };
}

/**
 * Signs every check-in QR code (Apple pass barcode, Google Wallet barcode,
 * and the standalone QR) — shared across all three, not Apple-specific, so
 * it gets its own check rather than living inside `checkAppleWallet`.
 * Presence-only for the same reason: it's a private signing key.
 */
async function checkCheckInSigning(): Promise<CheckResult> {
  return process.env.CHECK_IN_SIGNING_PRIVATE_KEY?.trim()
    ? { ok: true, latencyMs: 0 }
    : { ok: false, latencyMs: 0, detail: 'not configured' };
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
    googleWallet: CheckResult;
    appleWallet: CheckResult;
    checkInSigning: CheckResult;
  };
  missingEnv: string[];
  checkedAt: string;
  /** `git describe --long --always` output, captured at build time. */
  buildInfo: string;
};

let cached: { report: HealthReport; expiresAt: number } | null = null;

/** Cached briefly so a burst of probes (monitors, or abuse) can't hammer every
 *  upstream service on every request. */
async function buildReport(): Promise<HealthReport> {
  if (cached && cached.expiresAt > Date.now()) return cached.report;

  const [
    database,
    mail,
    objectStorage,
    turnstile,
    googleWallet,
    appleWallet,
    checkInSigning,
  ] = await Promise.all([
    checkDatabase(),
    checkMail(),
    checkObjectStorage(),
    checkTurnstile(),
    checkGoogleWallet(),
    checkAppleWallet(),
    checkCheckInSigning(),
  ]);
  const missingEnv = missingEnvVars();

  const status: HealthReport['status'] = !database.ok
    ? 'down'
    : mail.ok &&
        objectStorage.ok &&
        turnstile.ok &&
        googleWallet.ok &&
        appleWallet.ok &&
        checkInSigning.ok &&
        missingEnv.length === 0
      ? 'ok'
      : 'degraded';

  const report: HealthReport = {
    status,
    checks: {
      database,
      mail,
      objectStorage,
      turnstile,
      googleWallet,
      appleWallet,
      checkInSigning,
    },
    missingEnv,
    checkedAt: new Date().toISOString(),
    buildInfo: process.env.BUILD_INFO ?? 'unknown',
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
 * overall status and build info — no service names, error detail, or config
 * state, so a scan of this endpoint can't be used to map out our infrastructure.
 * The full per-service breakdown is available to signed-in users holding the
 * dedicated `system:read:all` permission, or to anyone presenting the
 * `x-health-access-key` header matching HEALTH_CHECK_ACCESS_KEY (for
 * external monitoring tools).
 */
export async function GET(request: Request) {
  const report = await buildReport();
  const httpStatus = report.status === 'down' ? 503 : 200;

  const user = await getUser().catch(() => null);
  const canReadHealth = user
    ? await hasPermission(user.id, HEALTH_PERMISSION)
    : false;
  const hasFullAccess = canReadHealth || hasValidAccessKey(request);

  if (!hasFullAccess) {
    return Response.json(
      { status: report.status, buildInfo: report.buildInfo },
      { status: httpStatus },
    );
  }

  return Response.json(report, { status: httpStatus });
}

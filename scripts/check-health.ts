/**
 * CLI wrapper around GET /api/health. Automatically sends the
 * HEALTH_CHECK_ACCESS_KEY from the environment so you get the full
 * per-service breakdown instead of just the bare status.
 *
 * Usage: pnpm check-health [url]
 *   url defaults to http://localhost:3000
 */
import 'dotenv/config';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

type CheckResult = { ok: boolean; latencyMs: number; detail?: string };

type HealthReport = {
  status: 'ok' | 'degraded' | 'down';
  checks?: Record<string, CheckResult>;
  missingEnv?: string[];
  checkedAt?: string;
};

function statusColor(status: string): string {
  if (status === 'ok') return GREEN;
  if (status === 'degraded') return YELLOW;
  return RED;
}

function resolveHealthURL(input: string): string {
  const url = new URL(input.startsWith('http') ? input : `http://${input}`);
  if (!url.pathname.includes('/api/health')) {
    url.pathname = url.pathname.replace(/\/+$/, '') + '/api/health';
  }
  return url.toString();
}

async function main() {
  const arg = process.argv[2] ?? 'http://localhost:3000';
  const url = resolveHealthURL(arg);
  const accessKey = process.env.HEALTH_CHECK_ACCESS_KEY?.trim();

  console.log(`${DIM}GET ${url}${RESET}`);
  if (!accessKey) {
    console.log(
      `${DIM}(no HEALTH_CHECK_ACCESS_KEY in env — you'll only get the bare status)${RESET}`,
    );
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: accessKey ? { 'x-health-access-key': accessKey } : {},
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error(
      `${RED}${BOLD}Could not reach ${url}${RESET}`,
      error instanceof Error ? `— ${error.message}` : '',
    );
    process.exit(3);
  }

  let report: HealthReport;
  try {
    report = await res.json();
  } catch {
    console.error(
      `${RED}${BOLD}Unexpected response (HTTP ${res.status}) — not valid JSON${RESET}`,
    );
    process.exit(3);
  }

  const color = statusColor(report.status);
  console.log(
    `\n${BOLD}Status: ${color}${report.status.toUpperCase()}${RESET} ${DIM}(HTTP ${res.status})${RESET}`,
  );

  if (report.checkedAt) {
    console.log(`${DIM}Checked at: ${report.checkedAt}${RESET}`);
  }

  if (report.checks) {
    console.log(`\n${BOLD}Checks:${RESET}`);
    for (const [name, check] of Object.entries(report.checks)) {
      const mark = check.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      const detail = check.detail ? ` ${DIM}(${check.detail})${RESET}` : '';
      console.log(`  ${mark} ${name.padEnd(14)} ${check.latencyMs}ms${detail}`);
    }
  }

  if (report.missingEnv) {
    if (report.missingEnv.length > 0) {
      console.log(
        `\n${YELLOW}${BOLD}Missing env vars:${RESET} ${report.missingEnv.join(', ')}`,
      );
    } else {
      console.log(`\n${GREEN}No missing env vars.${RESET}`);
    }
  }

  if (!report.checks) {
    console.log(
      `\n${DIM}This is the minimal public response. Set HEALTH_CHECK_ACCESS_KEY ` +
        `(matching the server's) to see the full per-service breakdown.${RESET}`,
    );
  }

  process.exit(
    report.status === 'ok' ? 0 : report.status === 'degraded' ? 1 : 2,
  );
}

void main();

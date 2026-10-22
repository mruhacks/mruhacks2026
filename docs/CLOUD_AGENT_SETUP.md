# Running the app in a cloud agent container

Notes for AI agents (Claude Code on the web and similar) working in a fresh,
sandboxed cloud container. The normal [Setup Guide](./SETUP.md) assumes Docker
and open internet, and neither works here. Everything below was worked out
the hard way. Follow it as written and skip re-discovering it.

## TL;DR

```bash
bash scripts/cloud-dev-setup.sh        # deps, Postgres, migrate, seed (~1 min, idempotent)
source /tmp/mruhacks-dev.env           # in every new shell
```

Then:

| Task          | Command                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| Unit tests    | `pnpm test` (or `npx vitest run src/tests/<file>.test.ts`)                    |
| Lint / format | `npx eslint <paths>` · `npx prettier --check <paths>`                         |
| Typecheck     | `npx tsc --noEmit -p .` (see caveats)                                         |
| Dev server    | `pnpm dev`, **started as a background task** (see below)                      |
| Log in        | `COOKIE=$(bash scripts/dev-session.sh admin@example.com)`, then send it as the `better-auth.session_token` cookie |

## What's different here and why

**Docker doesn't work.** `dockerd` can be started, but pulls from Docker Hub
come back `429 Too Many Requests`, so `docker compose up` (db-dev, db-test,
MailHog) fails. The container already ships **PostgreSQL 16** as a system
service. `cloud-dev-setup.sh` starts it, sets the `postgres` password to
`postgres` and creates `devdb`. The dev server and seed use `devdb`. Vitest
uses the default `postgres` database, and its setup migrates and truncates it
itself.

**Env vars.** `cloud-dev-setup.sh` writes them all to `/tmp/mruhacks-dev.env`.
These are fake, dev-only values (the Turnstile keys are Cloudflare's
documented always-pass test keys). Without `BETTER_AUTH_URL` and
`BETTER_AUTH_SECRET`, any test that imports `@/utils/auth` dies at import time
with "BETTER_AUTH_URL is required". CI sets the same values in
`.github/workflows/ci.yml`.

**Node needs to be told about the proxy.** Outbound HTTPS goes through an
agent proxy, and Node's `fetch` ignores `HTTPS_PROXY` unless
`NODE_USE_ENV_PROXY=1` is set. The env file sets it, plus
`NODE_EXTRA_CA_CERTS`. You'll see a harmless `EnvHttpProxyAgent is
experimental` warning as a result.

**You can't sign in through the form.** Better Auth's captcha plugin calls
Cloudflare's siteverify endpoint, which the sandbox can't reach (`fetch
failed`, or the request gets cancelled). `scripts/dev-session.sh <email>`
inserts a `session` row directly and prints a correctly signed cookie value:

```bash
COOKIE=$(bash scripts/dev-session.sh admin@example.com)
curl -b "better-auth.session_token=$COOKIE" http://localhost:3000/dashboard
```

The seeded admin (`admin@example.com` / `adminpassword123`) holds the `admin`
role, which has every permission.

**The seed only gets partway.** `scripts/seed.ts` creates static data (roles,
permissions, lookups), the admin user and events. Then it fails on demo
resumes because there's no object storage (S3/MinIO). That's expected, and
`cloud-dev-setup.sh` ignores it (log in `/tmp/mruhacks-seed.log`). If you need
rows in a table the seed didn't reach (for example `audit_log`), insert them
with `psql "$DATABASE_URL"`.

**Start the dev server as a background task.** A `nohup pnpm dev &` launched
from a normal shell call gets killed when that call returns. Use the Bash
tool's `run_in_background: true`:

```bash
source /tmp/mruhacks-dev.env && pnpm dev > /tmp/dev.log 2>&1
```

It's ready in a few seconds, and each route compiles on its first hit, which
can take tens of seconds.

## Screenshots with Playwright

Playwright and Chromium are preinstalled globally but aren't a project
dependency, so import them by absolute path. **Set `locale`**: the container's
POSIX locale makes `navigator.language` read `en-US@posix`, which `Intl`
rejects. That crashes every `LocalDateTime` with `RangeError: Invalid
language tag`. This only happens in the sandbox, not in the app.

```js
// /tmp/shot.mjs  — run with: node /tmp/shot.mjs "$COOKIE"
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'en-US',
});
await ctx.addCookies([
  {
    name: 'better-auth.session_token',
    value: process.argv[2],
    domain: 'localhost',
    path: '/',
  },
]);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error(e.message));
await page.goto('http://localhost:3000/dashboard', {
  waitUntil: 'networkidle',
});
await page.screenshot({ path: '/tmp/dashboard.png', fullPage: true });
await browser.close();
```

Console errors about `va.vercel-scripts.com` violating the CSP are expected
in dev. A Next.js "uncached data … outside of `<Suspense>`" error, however,
is real. Wrap the data access in `<Suspense>`, following the pattern in
`src/app/dashboard/admin/displays/page.tsx`.

## Known failures that aren't yours

- `src/tests/mail.integration.test.ts` (7 tests) needs MailHog, which can't
  run here. Everything else in `pnpm test` should pass.
- `tsc` reports `Cannot find module '*.png'` until `next-env.d.ts` exists.
  It's gitignored and generated the first time `pnpm dev` or `pnpm build`
  runs. `src/tests/dietary-actions.test.ts` also has pre-existing type
  errors.
- `npx prettier` fails with "Cannot find package
  'prettier-plugin-tailwindcss'" until `pnpm install` has run.

# rsvp-cron

A Cloudflare Worker that calls the app's `/api/cron/rsvp` route every hour
(`0 * * * *` UTC). That one step sends any due follow-up RSVP waves, then
requeues invitations whose original queue publish never landed. Vercel Hobby
only allows daily crons, hence the Worker.

It authenticates with `Authorization: Bearer <CRON_MANUAL_SECRET>`, which must
match the `CRON_MANUAL_SECRET` env var on Vercel.

This package is standalone: its own `pnpm-workspace.yaml` and lockfile keep it
out of the root Next app's install and build.

## Deploy

```sh
cd workers/rsvp-cron
pnpm install
pnpm exec wrangler login
pnpm exec wrangler secret put CRON_MANUAL_SECRET   # paste the same value as Vercel
# set vars.APP_URL in wrangler.json to the production origin
pnpm run deploy
```

Runs (and failures) show up under the Worker's **Settings → Trigger Events /
Cron Events** and in Workers Logs.

## Local testing

```sh
echo 'CRON_MANUAL_SECRET=<your local value>' > .dev.vars
pnpm exec wrangler dev --test-scheduled --var APP_URL:http://localhost:3000
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

With `pnpm dev` running for the Next app, the worker's log shows the route's
JSON response.

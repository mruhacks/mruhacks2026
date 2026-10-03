# rsvp-cron

A Cloudflare Worker that calls the app's `/api/cron/rsvp` route on every
deployment listed in `APP_URLS` (e.g. production and test) every hour
(`0 * * * *` UTC). That one step sends any due follow-up RSVP waves, then
requeues invitations whose original queue publish never landed. Vercel Hobby
only allows daily crons, hence the Worker.

It authenticates with `Authorization: Bearer <CRON_SECRET>`, which must match
the `CRON_SECRET` env var on every targeted Vercel deployment. All origins are
called in parallel; if any of them fails, the Cron Event is marked failed with
each failing origin in the error message.

This package is standalone: its own `pnpm-workspace.yaml` and lockfile keep it
out of the root Next app's install and build.

## Deploy

```sh
cd workers/rsvp-cron
pnpm install
pnpm exec wrangler login
pnpm exec wrangler secret put CRON_SECRET   # paste the same value as Vercel
# set vars.APP_URLS in wrangler.json to the comma-separated origins (prod,test)
pnpm run deploy
```

Runs (and failures) show up under the Worker's **Settings → Trigger Events /
Cron Events** and in Workers Logs.

## Local testing

```sh
echo 'CRON_SECRET=<your local value>' > .dev.vars
pnpm exec wrangler dev --test-scheduled --var APP_URLS:http://localhost:3000
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

With `pnpm dev` running for the Next app, the worker's log shows the route's
JSON response.

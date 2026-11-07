# Static export: the public site without the app server

`pnpm build:static` builds the public pages as plain HTML/CSS/JS in `out/`.
Any static host can serve that directory with no Node process behind it. This
repo deploys it to Cloudflare as the `mruhacks-static-site` Worker (an
assets-only Worker, so no Worker code runs either). Use it to keep
mruhacks.ca up while the Vercel app has to be switched off, for example
during an unpatched Node vulnerability.

## What's in it

| Path                                      | Notes                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `/`                                       | The homepage with the winners podium. No Dashboard or Register buttons. |
| `/projects`, `/projects/<id>`             | The gallery and every showcase project's page.                           |
| `/privacy`, `/terms`                      |                                                                          |
| `/robots.txt`, `/sitemap.xml`, favicon    |                                                                          |
| everything else (`/dashboard`, `/api/…`)  | `404.html`, which says sign-in and the dashboard are offline.            |

The data is a snapshot. The build reads the featured event, podium, projects
and team rosters from the database once. Redeploy to pick up any change.
Images load the way they do on the live site: cover and write-up images
straight from the public bucket, everything bundled from `out/` itself.

## Build and preview locally

The build needs read access to the database and the public bucket's URL:

```bash
DATABASE_URL=postgres://… S3_PUBLIC_BASE_URL=https://… pnpm build:static
```

`S3_PUBLIC_BASE_URL` is the origin the live site loads `…-w960.webp` cover
images from. If the app's env only has `S3_BUCKET`/`S3_REGION`, setting
those works too (see `readPublicAssetsBaseUrl`). Without it, a project with a
cover image fails the build, which is intended: its images would point at
`/api/assets`.

To serve `out/` exactly as Cloudflare will, with its `_headers`, clean URLs
and the 404 page:

```bash
cd workers/static-site && npx wrangler@4 dev
```

Restart it after a rebuild: the build replaces `out/`, and a running
`wrangler dev` keeps serving 404s from the old directory.

## Deploy

**From GitHub:** run the **Deploy Static Site** workflow (Actions tab,
manual only). It builds against the `production` environment and deploys.
Set these on that environment once:

- `DATABASE_URL` (secret): already there for `migrate-and-seed.yml`. The build
  only reads, so a read-only role is enough.
- `S3_PUBLIC_BASE_URL` (variable): as above.
- `CLOUDFLARE_API_TOKEN` (secret): a token from the "Edit Cloudflare Workers"
  template.
- `CLOUDFLARE_ACCOUNT_ID` (secret).

**From your machine:** after `pnpm build:static`,

```bash
cd workers/static-site && npx wrangler@4 login && npx wrangler@4 deploy
```

The first deploy creates the Worker at
`mruhacks-static-site.<account>.workers.dev`. Check it there before
switching the domain.

## Switch mruhacks.ca over

1. In the Cloudflare dashboard, delete the DNS record for `mruhacks.ca` (and
   `www`, if used) that points at Vercel.
2. Workers & Pages → `mruhacks-static-site` → Settings → Domains & Routes →
   Add → Custom domain → `mruhacks.ca`.
3. Turn the Node app off for real. Moving DNS doesn't stop it: the
   `*.vercel.app` URLs (production and `mruhacks2026-test.vercel.app`) keep
   serving it. Pause or remove those Vercel deployments.
4. Disable the `mruhacks-rsvp-cron` Worker's cron trigger. It calls
   `/api/cron/hourly` on both deployments, which now 404s.

## Switch back

Re-enable the Vercel deployments, remove the custom domain from
`mruhacks-static-site`, restore the DNS record pointing at Vercel, and
re-enable the cron trigger.

## How it works

- **Only `*.static.tsx` / `*.static.ts` files are routes.** With
  `STATIC_EXPORT=1`, `next.config.ts` switches to `output: 'export'` with
  `pageExtensions: ['static.tsx', 'static.ts']`. API routes, server actions,
  `proxy.ts` and the dashboard aren't part of the build at all. Most
  `*.static.tsx` files re-export the real page, so the static site renders
  the same components. To add a public page to the export, add a
  `page.static.tsx` next to its `page.tsx`.
- **`STATIC_EXPORT` in `src/content.ts`** turns off `LOGIN_ENABLED` and
  `REGISTRATION_OPEN`, so no button links into the offline app. The root
  layout also skips Vercel's analytics.
- **Metadata routes** (`robots.ts`, `sitemap.ts`) don't work with a
  multi-dot page extension, so `robots.txt/route.static.ts` and
  `sitemap.xml/route.static.ts` serialize the same data themselves.
- **No Cache Components.** Export mode can't do PPR, so this build uses the
  deprecated `experimental.useCache` flag instead, which keeps `'use cache'`
  working in the data layer.
- **Images.** There's no image optimizer, so `src/lib/static-image-loader.ts`
  points `next/image` at `/_img/<width>/<quality>/<src>.webp`.
  `scripts/static-export/postbuild.ts` then renders every one the HTML
  references. Placeholder covers (normally `/api/project-cover`) are written
  per project by `project-covers/[file]/route.static.ts`.
- **The postbuild check fails the build** if any page links to or loads a
  same-origin path that isn't in `out/` (an `/api/` URL, `/dashboard`, …).
  The legal pages' in-text links to account settings are the only allowed
  exceptions (`ALLOWED_OFFLINE_LINKS`).
- **`.next` is shared.** Export mode always builds into `.next` (a custom
  `distDir` only renames `out/`), and this build's route types only know the
  static routes. `build:static` ends with `next typegen` to put the full app's
  types back, so `tsc` and editors keep working.
- **`_headers`** carries the live app's security headers, with a CSP trimmed
  to what the static pages load.

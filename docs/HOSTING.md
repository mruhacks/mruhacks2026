# Hosting

What is hosted where and why.

> The current setup is a Frankenstein, mostly because we hunt for what is easy and cheap--a rare combination.
> If you want to host this repo from scratch, I implore you to think long and hard about whether you want to mirror
> exactly what we do. I will try my best to note what is and is not a hard requirement.

# Glossary

- UGC : User Generated Content; assets uploaded by participants or organizers, including but not limited to resumes and
  uploaded wiki attachments.

# Environments:

- **local dev**, secrets for testing login with GitHub and Google as well as wallet secrets. Non-sensitive ones are in
  `.env.example`; sensitive ones are in the [vault](https://vault.mruhacks.ca).

- **deployed test**, has its own DB and distinct credentials for most things, the exception being the Apple cert.
  - hosted at [mruhacks2026-test.vercel.app](https://mruhacks2026-test.vercel.app)
  - deploys on push to the `test` branch

- **deployed prod**, has its own DB and distinct credentials for most things, the exception being our Apple cert.
  - hosted at [mruhacks.ca](https://mruhacks.ca)
  - deploys on push to the `main` branch


# SLDs

  - mruhacks.ca  -- our main domain; everything lives here
  - mruhack.ca   -- uses a Cloudflare rewrite rule to direct back to the above
  - mruhacks.com -- ditto

  > We have these extras to try to avoid being [typosquatted](https://en.wikipedia.org/wiki/Typosquatting).

# 1. The Database(s)

We host on Neon. If you are a developer on this team, you can get into that account using the usual shared method.

On here we have a database for prod and a database for test. These are `projects` in Neon; if you are familiar with
Postgres you may instead refer to these as `clusters`. TL;DR: these are independent instances of Postgres.

# 2. Oh the Buckets!

## 2.1 Assets and resources

1. The main UGC bucket is:
  - for the test env `arn:aws:s3:::mruhacks-asset-prod` (us-west-2)
  - for the prod env `arn:aws:s3:::mruhacks-2026-prod-actual` (us-west-2)

  > Yes, the naming sucks. Sue me.

2. For static assets that we own we use the R2 bucket `mruhacks-static`, hosted at the domain `static.mruhacks.ca`.

  This hosts assets that we have used over time in emails. The main site is mostly able to host itself, but there are
  old emails already sent and possibly random external services that fetch branding assets from here. Mainly:

  - [color_chevron.png](https://static.mruhacks.ca/color_chevron.png), and
  - [logo.png](https://static.mruhacks.ca/logo.png).

  We also host a random PDF here that a sponsor asked us to send out.

> This bucket is legacy; we don't use it much anymore. The main repo does depend on it softly, and it could be torn
> out of there easily, but leaving it up is a good option so we don't break old sent emails and such.

3. For other UGC that we host but don't want in S3 we use the R2 bucket `user-media-mruhacks/`.

- It hosts exactly one MP4 that we needed to host for a team because they did not upload to YouTube and we needed to put
  it somewhere. This is, again, not ideal. Hosted at [usercontent.mruhacks.ca](https://usercontent.mruhacks.ca/).


## 2.2 Infra and backups

We host backups of our prod database in `arn:aws:s3:::mruhacks-prod-backup` on S3. The only way to access this is by
logging into the AWS console at the moment, because the CI job has write-only access.

This is a secondary backup, as we use Neon's built-in WAL and snapshot backups; we have historically only needed to use
those. We retain backups there for 90 days, done daily using a GitHub Action.

> TODO: This **works**, to be clear, but if these backups ever stop working and we don't notice for 90 days, the
> retention rules on AWS will delete them. We should have a way of detecting that condition and paging someone to fix it.


# Other external services

- **Email** -- we use SES over SMTP; this uses the same IAM user as the main _UGC_ bucket.
- **Turnstile** -- used as a captcha on our login form. There is a secret key per deployed env; locally we use a testing
  key that will always pass.
- **Google Login** -- This is in the GCP project `mruhacks-prod`; the usual admin account is added as an admin
  principal.
- **Google Wallet** -- Uses a service account from the project above for the app; the admin account is added to the
  Google Pay console as well.
- **Apple Wallet** -- Passes are issued through Thomas's developer account.


# Internal Secrets

- `CRON_SECRET` -- used to authenticate when triggering cron jobs from Cloudflare.
- Auth secret -- signs sessions. Unique per deployed environment, never reused between test and prod.
- `HEALTH_CHECK_ACCESS_KEY` -- can be used as a header `x-health-access-key` for programmatic access
  to the verbose output of `/api/health`.
- `BETTER_AUTH_SECRET` -- used by Better Auth for its own internal things; we don't use it directly.
- `APP_SIGNING_KEY` -- an ed25519 private key used for signing payloads. At the time of writing, it is used for the
  campaigns feature and the QR codes used at check-in.

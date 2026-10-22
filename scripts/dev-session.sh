#!/usr/bin/env bash
# Mint a logged-in session cookie for a dev user without going through the
# sign-in form, which needs Cloudflare Turnstile's siteverify endpoint (not
# reachable from sandboxed cloud containers). Dev databases only.
# See docs/CLOUD_AGENT_SETUP.md.
#
#   source /tmp/mruhacks-dev.env
#   COOKIE=$(bash scripts/dev-session.sh admin@example.com)
#   curl -b "better-auth.session_token=$COOKIE" http://localhost:3000/dashboard
set -euo pipefail

EMAIL="${1:?usage: dev-session.sh <email>}"
: "${DATABASE_URL:?source /tmp/mruhacks-dev.env first}"
: "${BETTER_AUTH_SECRET:?source /tmp/mruhacks-dev.env first}"

TOKEN=$(openssl rand -hex 16)
INSERTED=$(psql "$DATABASE_URL" -qtAc "
  INSERT INTO session (token, expires_at, user_id)
  SELECT '$TOKEN', now() + interval '7 days', id FROM \"user\" WHERE email = '$EMAIL'
  RETURNING 1")
[ "$INSERTED" = 1 ] || { echo "no user with email $EMAIL" >&2; exit 1; }

# Better Auth signs the cookie as `<token>.<base64 HMAC-SHA256(secret, token)>`.
SIG=$(printf '%s' "$TOKEN" | openssl dgst -sha256 -hmac "$BETTER_AUTH_SECRET" -binary | base64)
node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$TOKEN.$SIG"
echo

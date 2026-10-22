#!/usr/bin/env bash
# One-shot environment bring-up for cloud agent containers (Claude Code on the
# web and similar), where Docker Hub pulls are rate-limited and the
# docker-compose services can't start. Uses the container's own PostgreSQL
# instead. Idempotent: safe to re-run. See docs/CLOUD_AGENT_SETUP.md.
#
#   bash scripts/cloud-dev-setup.sh && source /tmp/mruhacks-dev.env
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=/tmp/mruhacks-dev.env
cat >"$ENV_FILE" <<'EOF'
# Dev server + seed (database `devdb`)
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/devdb
export BETTER_AUTH_SECRET=dev-fake-secret-dev-fake-secret-123456
export BETTER_AUTH_URL=http://localhost:3000
export TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
export NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
export SEED_ADMIN_EMAIL=admin@example.com
export SEED_ADMIN_PASSWORD=adminpassword123
# Vitest (database `postgres`; the test setup migrates and truncates it)
export TEST_POSTGRES_HOST=localhost
export TEST_POSTGRES_PORT=5432
export TEST_POSTGRES_USER=postgres
export TEST_POSTGRES_PASSWORD=postgres
export TEST_POSTGRES_DB=postgres
# Node's fetch ignores HTTPS_PROXY unless told otherwise
export NODE_USE_ENV_PROXY=1
export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
export NO_PROXY="localhost,127.0.0.1,${NO_PROXY:-}"
EOF
# shellcheck source=/dev/null
source "$ENV_FILE"

echo '▶ Installing dependencies…'
pnpm install --frozen-lockfile >/dev/null

echo '▶ Starting PostgreSQL…'
service postgresql start >/dev/null
su postgres -c "psql -qc \"ALTER USER postgres PASSWORD 'postgres';\""
if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname = 'devdb'\"" | grep -q 1; then
  su postgres -c "psql -qc 'CREATE DATABASE devdb'"
fi

echo '▶ Migrating devdb…'
npx drizzle-kit migrate >/dev/null

echo '▶ Seeding devdb (demo data needs object storage and is expected to fail; static data + admin user land first)…'
npx tsx scripts/seed.ts >/tmp/mruhacks-seed.log 2>&1 || true
psql "$DATABASE_URL" -tAc "SELECT 'admin user: ' || email FROM \"user\" WHERE email = '$SEED_ADMIN_EMAIL'"

echo "✅ Done. Run: source $ENV_FILE"

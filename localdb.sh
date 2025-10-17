#! /bin/env sh

# this should never ever ever be used in prod, for the sake of making local dev easy
# and not adding openssl as dep we can hard code this.
DB_PASS=g61Veraq1DssIKfsEk5zEzuwJTdozJHwHrQiOBCd

docker run --name mruhacks-postgres -e POSTGRES_PASSWORD=$DB_PASS -d -p 5432:5432 postgres
>&2 printf "Put the following into your .env.local: \n"
printf "DATABASE_URL=postgres://postgres:$DB_PASS@localhost:5432/postgres\n"

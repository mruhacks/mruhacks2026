#!/usr/bin/env bash

set -e

# this should never ever ever be used in prod, for the sake of making local dev easy
# and not adding OpenSSL as dep we can hard code this.
DB_PASS=g61Veraq1DssIKfsEk5zEzuwJTdozJHwHrQiOBCd


CONTAINER_NAME="mruhacks-postgres"

# Stop container if it's running
if [ "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    >&2 echo "Stopping $CONTAINER_NAME..."
    >&2 docker stop $CONTAINER_NAME
fi

# Remove container if it exists (stopped or exited)
if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
    >&2 echo "Removing $CONTAINER_NAME..."
    >&2 docker rm -v $CONTAINER_NAME
fi

# Run fresh container
>&2 echo "Starting new $CONTAINER_NAME..."
>&2 docker run --name $CONTAINER_NAME \
    -e POSTGRES_PASSWORD="$DB_PASS" \
    -d -p 5432:5432 postgres:17

>&2 printf "Put the following into your .env.local:\n"
printf "DATABASE_URL=postgres://postgres:$DB_PASS@localhost:5432/postgres\n"

# The vendored Gavel plus oracle.py, for src/tests/gavel-differential.test.ts.
# Build context is vendor/ (see the test, or vendor/README.md).
FROM python:3.9-slim

WORKDIR /vendor
# ADD unpacks a local tarball: gavel.tar.gz → /vendor/gavel.
ADD gavel.tar.gz ./
# Gavel's own pins, verbatim, except psycopg2 → its binary wheel: Gavel only
# imports it for an error class, and building it from source needs libpq.
RUN sed 's/^psycopg2==/psycopg2-binary==/' gavel/requirements.txt > /tmp/requirements.txt \
 && pip install --no-cache-dir -r /tmp/requirements.txt

COPY gavel-oracle/oracle.py gavel-oracle/oracle.py

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONWARNINGS=ignore
ENTRYPOINT ["python", "gavel-oracle/oracle.py"]

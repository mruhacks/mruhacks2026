# Fictional resume fixtures

These 20 one-page resumes are invented development fixtures. Their names do not
match seeded users: the seeder randomly reuses the PDFs as-is.

`pnpm db:seed` reads the committed PDFs and uploads a separate copy for each new
fake user through the existing S3/MinIO configuration. Start local storage with
`docker compose up -d minio` before seeding. Each copy has its own storage key so
replacing or deleting one user's resume cannot affect another user. Storage
failures stop seeding instead of creating profiles with broken download links.
`SEED_COUNT=0` does not read or upload resumes. Existing users and the configured
admin's profile are left unchanged by resume seeding.

LaTeX is only required when editing these fixtures. From this directory, rebuild
the PDFs with a TeX distribution that includes `pdflatex`:

```sh
for source in resume-*.tex; do
  pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape "$source" || exit 1
done
```

Keep the `.tex` sources, shared `common.tex`, and generated `.pdf` files in Git.
Compilation logs and auxiliary files are ignored. Normal seeding never invokes
LaTeX or downloads external sample resumes.

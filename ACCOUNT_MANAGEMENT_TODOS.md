# Account & Privacy Section – Post-Implementation TODOs

## Critical: Before shipping

- [ ] **Apply the database migration**
  - Run `pnpm db:seed` or `drizzle-kit migrate` to create the `user_consents` table
  - Verify schema: `psql <db-url> -c "SELECT * FROM user_consents LIMIT 1;"`
  - All existing users will have no row yet; they'll get a default (opted-out) view on first account page visit

- [ ] **Review & customize legal pages**
  - [ ] `/src/app/privacy/page.tsx` — update contact email from `privacy@mruhacks.ca` to real address
  - [ ] `/src/app/terms/page.tsx` — update contact email from `hello@mruhacks.ca` to real address
  - [ ] Have the organizing committee review both for accuracy (PIPEDA/PIPA compliance)
  - [ ] Consider looping in legal counsel if available
  - [ ] Update the "last updated" dates if you customize the text

## Recommended: Wire in consent enforcement

- [ ] **When broadcasting announcements/newsletters**, filter recipients by `userConsents.marketingEmails`
  - Currently, the opt-in/toggle exists but isn't enforced at send-time
  - Location: likely `/src/app/dashboard/admin/comms` (Communications area)
  - Query pattern: `WHERE user_consents.marketing_emails = true` when pulling recipients
  - Essential communications (event updates, account alerts) should ignore this flag and send unconditionally

## Nice-to-have: UX polish

- [ ] Add a toast/banner on successful account deletion: "Check your email for the final confirmation link"
- [ ] Consider pre-populating the data-export timestamp in the downloaded filename for easier archival
- [ ] Add a "last updated" date to session cards (cosmetic, but improves clarity)

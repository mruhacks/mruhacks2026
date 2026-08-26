// NOTE: Template terms for the MRUHacks participant portal. Review with the
// organizing committee before relying on it in production.
const CONTACT_EMAIL = 'hello@mruhacks.ca';

export const TERMS_TITLE = 'Terms of Service';
export const TERMS_UPDATED = 'July 10, 2026';

/** Shared with the full /terms page and the welcome-flow modal. */
export function TermsContent() {
  return (
    <>
      <p>
        These terms govern your use of the MRUHacks participant portal (the
        &ldquo;Service&rdquo;). By creating an account or using the Service, you
        agree to these terms.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be 18 years of age or older to create an account or participate
        in MRUHacks events. By using the Service, you confirm that you meet this
        requirement.
      </p>
      <p>
        You must provide accurate information when registering and keep it up to
        date. You are responsible for activity that happens under your account
        and for keeping your login credentials secure.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not misuse, disrupt, or attempt to gain unauthorized access to the Service.</li>
        <li>Do not impersonate others or submit false information.</li>
        <li>Do not upload unlawful, harmful, or infringing content.</li>
        <li>Follow the event code of conduct at all times.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You retain ownership of the profile information, applications, and
        project submissions you provide. You grant us the limited permission
        needed to operate the event — for example, to display your submission to
        judges and organizers. We use your personal information only as
        described in our <a href='/privacy'>Privacy Policy</a>.
      </p>

      <h2>Account deletion</h2>
      <p>
        You may delete your account at any time from your{' '}
        <a href='/dashboard/account'>Account &amp; Privacy</a> settings. Deletion
        is permanent and removes your account and associated data. We may
        suspend or terminate accounts that violate these terms.
      </p>

      <h2>Disclaimer</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without warranties of any
        kind. We do not guarantee that the Service will be uninterrupted or
        error-free. To the extent permitted by law, MRUHacks and its organizers
        are not liable for any indirect or consequential damages arising from
        your use of the Service.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms from time to time. We will post the updated
        terms here and revise the &ldquo;last updated&rdquo; date. Continued use
        of the Service after changes means you accept the updated terms.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about these terms? Contact us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

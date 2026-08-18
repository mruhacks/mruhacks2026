// NOTE: This is a good-faith template aligned with PIPEDA and Alberta's PIPA.
// Have it reviewed by the organizing committee (and, ideally, counsel) and fill
// in the contact details before relying on it in production.
const CONTACT_EMAIL = 'privacy@mruhacks.ca';

export const PRIVACY_TITLE = 'Privacy Policy';
export const PRIVACY_UPDATED = 'July 10, 2026';

/** Shared with the full /privacy page and the welcome-flow modal. */
export function PrivacyContent() {
  return (
    <>
      <p>
        MRUHacks (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;)
        respects your privacy. This policy explains what personal information we
        collect, why we collect it, how we use and protect it, and the rights
        you have over it. We handle personal information in accordance with
        Canada&apos;s Personal Information Protection and Electronic Documents
        Act (PIPEDA) and Alberta&apos;s Personal Information Protection Act
        (PIPA).
      </p>

      <h2>Information we collect</h2>
      <p>We collect only what we need to run the event, including:</p>
      <ul>
        <li>
          <strong>Account information</strong> — your name, email address, and
          authentication details (password or the social login you choose).
        </li>
        <li>
          <strong>Profile information</strong> — university, program, year of
          study, gender, and dietary restrictions you provide.
        </li>
        <li>
          <strong>Participation information</strong> — event applications and
          responses, registrations, RSVPs, check-ins, team membership, and
          project submissions.
        </li>
        <li>
          <strong>Technical information</strong> — session data such as IP
          address and browser/device information, used to keep your account
          secure.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To create and manage your account and authenticate you.</li>
        <li>
          To process your event applications, registrations, and check-ins.
        </li>
        <li>
          To communicate essential information about events you apply to or
          register for, and about your account.
        </li>
        <li>
          To accommodate dietary and accessibility needs you tell us about.
        </li>
        <li>
          To send optional newsletters and announcements — only if you opt in.
        </li>
      </ul>

      <h2>Consent</h2>
      <p>
        We rely on your consent to collect and use your personal information for
        the purposes above. Essential communications about your account and the
        events you participate in are part of providing the service. Non-
        essential marketing email is opt-in only, and you can withdraw that
        consent at any time from your{' '}
        <a href='/dashboard/account'>Account &amp; Privacy</a> settings.
      </p>

      <h2>Sharing your information</h2>
      <p>
        We do not sell your personal information. We share it only where
        necessary to operate the event — for example, with service providers
        that host our systems or send email on our behalf, and, where you
        consent, with event sponsors. Service providers are bound to protect
        your information and use it only for the services they provide to us.
      </p>

      <h2>Retention</h2>
      <p>
        We keep your personal information only as long as needed for the
        purposes described here or as required by law. When you delete your
        account, we permanently erase your account and all associated data.
      </p>

      <h2>Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>
          <strong>Access</strong> the personal information we hold about you —
          download a copy from your{' '}
          <a href='/dashboard/account'>Account &amp; Privacy</a> settings.
        </li>
        <li>
          <strong>Correct</strong> your information — update it on your{' '}
          <a href='/dashboard/profile'>profile</a>.
        </li>
        <li>
          <strong>Delete</strong> your account and data at any time from your{' '}
          <a href='/dashboard/account'>Account &amp; Privacy</a> settings.
        </li>
        <li>
          <strong>Withdraw consent</strong> to non-essential communications.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        We use reasonable technical and organizational safeguards to protect
        your information, including encryption in transit and access controls.
        No system is perfectly secure, but we work to protect your data and to
        notify you if a breach affecting your information occurs.
      </p>

      <h2>Contact us</h2>
      <p>
        For any privacy question or request, contact us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If you are not
        satisfied with our response, you may contact the Office of the
        Information and Privacy Commissioner of Alberta or the Office of the
        Privacy Commissioner of Canada.
      </p>
    </>
  );
}

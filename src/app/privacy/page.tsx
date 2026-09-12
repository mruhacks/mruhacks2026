import { LegalPage } from '@/components/legal-page';
import { PrivacyContent, PRIVACY_TITLE, PRIVACY_UPDATED } from './content';

export const metadata = {
  title: 'Privacy Policy — MRUHacks',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title={PRIVACY_TITLE} updated={PRIVACY_UPDATED}>
      <PrivacyContent />
    </LegalPage>
  );
}

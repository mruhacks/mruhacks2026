import { LegalPage } from '@/components/legal-page';
import { TermsContent, TERMS_TITLE, TERMS_UPDATED } from './content';

export const metadata = {
  title: 'Terms of Service — MRUHacks',
};

export default function TermsPage() {
  return (
    <LegalPage title={TERMS_TITLE} updated={TERMS_UPDATED}>
      <TermsContent />
    </LegalPage>
  );
}

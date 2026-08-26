import { LegalModal } from '@/components/legal-modal';
import { TermsContent, TERMS_TITLE, TERMS_UPDATED } from '@/app/terms/content';

export default function InterceptedTermsModal() {
  return (
    <LegalModal title={TERMS_TITLE} updated={TERMS_UPDATED}>
      <TermsContent />
    </LegalModal>
  );
}

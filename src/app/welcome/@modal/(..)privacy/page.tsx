import { LegalModal } from '@/components/legal-modal';
import {
  PrivacyContent,
  PRIVACY_TITLE,
  PRIVACY_UPDATED,
} from '@/app/privacy/content';

export default function InterceptedPrivacyModal() {
  return (
    <LegalModal title={PRIVACY_TITLE} updated={PRIVACY_UPDATED}>
      <PrivacyContent />
    </LegalModal>
  );
}

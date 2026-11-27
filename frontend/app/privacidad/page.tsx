import type { Metadata } from 'next';
import { LegalPage } from '@/features/legal/components/legal-page';
import { getT } from '@/shared/i18n';

export const metadata: Metadata = { title: getT('legal')('privacy.title') };

export default function PrivacyPage() {
  return <LegalPage document="privacy" />;
}

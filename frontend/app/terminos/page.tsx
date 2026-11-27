import type { Metadata } from 'next';
import { LegalPage } from '@/features/legal/components/legal-page';
import { getT } from '@/shared/i18n';

export const metadata: Metadata = { title: getT('legal')('terms.title') };

export default function TermsPage() {
  return <LegalPage document="terms" />;
}

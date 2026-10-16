import type { Metadata } from 'next';
import { MfaSettings } from '@/features/settings/components/mfa-settings';

export const metadata: Metadata = { title: 'Segundo factor' };

export default function Page() {
  return <MfaSettings />;
}

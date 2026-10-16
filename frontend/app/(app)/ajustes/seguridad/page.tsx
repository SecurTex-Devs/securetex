import type { Metadata } from 'next';
import { SecuritySettings } from '@/features/settings/components/security-settings';

export const metadata: Metadata = { title: 'Seguridad y sesiones' };

export default function Page() {
  return <SecuritySettings />;
}

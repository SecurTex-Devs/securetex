import type { Metadata } from 'next';
import { LinkedAccounts } from '@/features/settings/components/other-settings';

export const metadata: Metadata = { title: 'Cuentas vinculadas' };

export default function Page() {
  return <LinkedAccounts />;
}

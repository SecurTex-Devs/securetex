import type { Metadata } from 'next';
import { AdminOverview } from '@/features/admin/components/admin-pages';

export const metadata: Metadata = { title: 'Administración' };

export default function Page() {
  return <AdminOverview />;
}

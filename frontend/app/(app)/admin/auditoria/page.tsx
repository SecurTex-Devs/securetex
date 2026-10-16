import type { Metadata } from 'next';
import { AdminAudit } from '@/features/admin/components/admin-pages';

export const metadata: Metadata = { title: 'Auditoría' };

export default function Page() {
  return <AdminAudit />;
}

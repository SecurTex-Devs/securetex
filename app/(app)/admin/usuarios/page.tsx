import type { Metadata } from 'next';
import { AdminUsers } from '@/features/admin/components/admin-pages';

export const metadata: Metadata = { title: 'Usuarios' };

export default function Page() {
  return <AdminUsers />;
}

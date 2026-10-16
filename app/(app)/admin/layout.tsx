import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/components/admin-pages';

/** P-38 … P-41. La API exige rol de administrador del sistema; la interfaz solo lo refleja. */
export default function AdminLayout({ children }: { readonly children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}

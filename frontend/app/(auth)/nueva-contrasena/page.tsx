import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/features/auth/components/recovery-forms';

export const metadata: Metadata = { title: 'Nueva contraseña' };

export default function ResetPage() {
  return <ResetPasswordForm />;
}

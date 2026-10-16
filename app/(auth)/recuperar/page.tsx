import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/features/auth/components/recovery-forms';

export const metadata: Metadata = { title: 'Recuperar el acceso' };

export default function ForgotPage() {
  return <ForgotPasswordForm />;
}

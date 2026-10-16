import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MfaForm } from '@/features/auth/components/mfa-form';

export const metadata: Metadata = { title: 'Verificación en dos pasos' };

export default function MfaPage() {
  return <Suspense><MfaForm /></Suspense>;
}

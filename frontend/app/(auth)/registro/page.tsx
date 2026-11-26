import type { Metadata } from 'next';
import { RegistrationGate } from '@/features/auth/components/registration-gate';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function RegisterPage() {
  return <RegistrationGate />;
}

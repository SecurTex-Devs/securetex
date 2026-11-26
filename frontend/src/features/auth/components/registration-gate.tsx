'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, unwrap } from '@/shared/api/client';
import { getT } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';
import { ErrorState } from '@/shared/ui/states';
import { AuthHeading } from './auth-heading';
import { RegisterForm } from './register-form';

export function RegistrationGate() {
  const t = getT('auth');
  const config = useQuery({ queryKey: ['public-config'], queryFn: () => unwrap(api.GET('/api/v1/auth/demo')), retry: false });
  if (config.isPending) return <div role="status" aria-label={t('registration.loading')}><Spinner /></div>;
  if (config.isError) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  if (config.data?.registrationEnabled) return <RegisterForm />;
  return <div>
    <AuthHeading title={t('registration.closed')} subtitle={t('registration.demo')} />
    <Button asChild variant="primary"><Link href="/">{t('registration.back')}</Link></Button>
  </div>;
}

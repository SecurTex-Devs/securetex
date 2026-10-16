'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';
import type { components } from '@/shared/api/generated';

type Schemas = components['schemas'];

import { authKeys } from '@/shared/api/session';

export { authKeys, useMe, useLogout } from '@/shared/api/session';

export function useProviders() {
  return useQuery({
    queryKey: authKeys.providers,
    queryFn: () => unwrap(api.GET('/api/v1/auth/providers')),
    staleTime: Infinity,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['LoginDto']) => unwrap(api.POST('/api/v1/auth/login', { body })),
    onSuccess: () => qc.removeQueries({ queryKey: authKeys.me }),
  });
}

export function useRegister() {
  return useMutation({ mutationFn: (body: Schemas['RegisterDto']) => unwrap(api.POST('/api/v1/auth/register', { body })) });
}

export function useVerifyEmail() {
  return useMutation({ mutationFn: (token: string) => unwrap(api.POST('/api/v1/auth/verify-email', { body: { token } })) });
}

export function useResendVerification() {
  return useMutation({ mutationFn: () => unwrap(api.POST('/api/v1/auth/verify-email/resend')) });
}

export function useMfaVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['MfaVerifyDto']) => unwrap(api.POST('/api/v1/auth/mfa/verify', { body })),
    onSuccess: () => qc.removeQueries({ queryKey: authKeys.me }),
  });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => unwrap(api.POST('/api/v1/auth/password/forgot', { body: { email } })) });
}

export function useResetPassword() {
  return useMutation({ mutationFn: (body: Schemas['ResetPasswordDto']) => unwrap(api.POST('/api/v1/auth/password/reset', { body })) });
}


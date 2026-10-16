import type { ReactNode } from 'react';
import { SettingsShell } from '@/features/settings/components/settings-shell';

export default function SettingsLayout({ children }: { readonly children: ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}

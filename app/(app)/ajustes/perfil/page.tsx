import type { Metadata } from 'next';
import { ProfileSettings } from '@/features/settings/components/profile-settings';

export const metadata: Metadata = { title: 'Perfil' };

export default function Page() {
  return <ProfileSettings />;
}

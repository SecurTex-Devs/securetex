import type { Metadata } from 'next';
import { MyData } from '@/features/settings/components/other-settings';

export const metadata: Metadata = { title: 'Mis datos' };

export default function Page() {
  return <MyData />;
}

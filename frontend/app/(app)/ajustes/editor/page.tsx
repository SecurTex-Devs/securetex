import type { Metadata } from 'next';
import { EditorPreferences } from '@/features/settings/components/other-settings';

export const metadata: Metadata = { title: 'Preferencias del editor' };

export default function Page() {
  return <EditorPreferences />;
}

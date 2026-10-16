import type { Metadata } from 'next';
import { TemplateGallery } from '@/features/templates/components/template-page';

export const metadata: Metadata = { title: 'Plantillas' };

export default function Page() {
  return <TemplateGallery />;
}

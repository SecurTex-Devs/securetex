import type { Metadata } from 'next';
import { TemplateDetail } from '@/features/templates/components/template-page';

export const metadata: Metadata = { title: 'Plantilla' };

export default async function Page({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateDetail id={id} />;
}

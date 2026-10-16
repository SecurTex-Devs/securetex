import type { Metadata } from 'next';
import { EditorPage } from './editor-page';

export const metadata: Metadata = { title: 'Editor' };

export default async function Page({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorPage projectId={id} />;
}

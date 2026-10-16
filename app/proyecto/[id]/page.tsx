import type { Metadata } from 'next';
import { EditorPage } from './editor-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Editor' };

export default async function Page({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Puerto público del servicio de colaboración (WebSocket); el host es el mismo con el que se abrió la página.
  return <EditorPage projectId={id} collabPort={process.env['COLLAB_PUBLIC_PORT'] ?? '4000'} />;
}

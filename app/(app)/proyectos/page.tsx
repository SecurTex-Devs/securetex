import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProjectsPage } from '@/features/projects/components/projects-page';

export const metadata: Metadata = { title: 'Proyectos' };

export default function Page() {
  return <Suspense><ProjectsPage /></Suspense>;
}

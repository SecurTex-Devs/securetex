'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { ProjectFilter, ProjectListParams, ProjectSort } from '@/shared/api/projects';

const FILTERS: readonly ProjectFilter[] = ['all', 'owned', 'shared', 'archived', 'trash'];
const SORTS: readonly ProjectSort[] = ['-lastActivity', 'lastActivity', 'name', '-name'];
export type ProjectView = 'list' | 'grid';

/** Filtros, búsqueda y vista viven en la URL: compartibles y recargables (AGENTS.md §2.1). */
export function useProjectParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = useMemo(() => {
    const filter = params.get('filtro') as ProjectFilter | null;
    const sort = params.get('orden') as ProjectSort | null;
    const q = params.get('q') ?? '';
    const tag = params.get('etiqueta') ?? '';
    const view: ProjectView = params.get('vista') === 'cuadricula' ? 'grid' : 'list';
    const list: ProjectListParams = {
      filter: filter && FILTERS.includes(filter) ? filter : 'all',
      sort: sort && SORTS.includes(sort) ? sort : '-lastActivity',
      ...(q ? { q } : {}),
      ...(tag ? { tag } : {}),
    };
    return { list, view, q, tag };
  }, [params]);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { ...state, update };
}

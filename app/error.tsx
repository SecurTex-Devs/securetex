'use client';

import { ErrorState } from '@/shared/ui/states';

/** P-43 · límite de error global: mensaje genérico, sin detalles internos (RNF-031). */
export default function GlobalError({ error, reset }: { readonly error: Error; readonly reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg">
      <ErrorState error={error} onRetry={reset} />
    </main>
  );
}

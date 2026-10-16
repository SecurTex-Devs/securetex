'use client';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isApiError } from './api/errors';
import { useTheme } from './theme/theme';
import { Toaster } from './ui/toast';
import { TooltipProvider } from './ui/menu';

const NonceContext = createContext<string>('');

let documentNonce: string | null = null;

/**
 * El nonce válido es el de la CSP con la que se cargó ESTE documento. Tras una
 * navegación de cliente, el payload de React trae el nonce de otra respuesta,
 * que el navegador rechazaría. El navegador oculta el atributo `nonce` del DOM,
 * pero la propiedad `.nonce` de un script ya ejecutado conserva el valor real.
 */
function resolveNonce(fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  documentNonce ??= document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce || fallback || null;
  return documentNonce ?? fallback;
}

/** Nonce de la CSP del documento, para librerías que inyectan <style> (CodeMirror). */
export function useNonce(): string {
  return resolveNonce(useContext(NonceContext));
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.['silent401']) return;
        // Sesión perdida definitivamente (el refresco ya falló): a iniciar sesión.
        if (isApiError(error) && error.kind === 'unauthorized' && typeof window !== 'undefined') {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.assign(`/entrar?next=${next}&motivo=sesion`);
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Docs/05 §3: 2 reintentos en GET, nunca ante errores definitivos.
        retry: (count, error) => !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 2,
      },
      mutations: { retry: 0 },
    },
  });
}

// Variable mágica de webpack: las librerías que inyectan <style> en tiempo de
// ejecución (bloqueo de scroll de los diálogos de Radix, vía get-nonce) leen de
// aquí el nonce de la CSP. Sin él, la CSP bloquea esos estilos.
declare let __webpack_nonce__: string | undefined;

export function Providers({ children, nonce }: { readonly children: ReactNode; readonly nonce: string }) {
  if (typeof window !== 'undefined' && nonce) __webpack_nonce__ = resolveNonce(nonce);
  const [client] = useState(makeQueryClient);
  const hydrate = useTheme((s) => s.hydrate);
  useEffect(() => hydrate(), [hydrate]);

  return (
    <NonceContext.Provider value={nonce}>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={350} skipDelayDuration={200}>
          {children}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </NonceContext.Provider>
  );
}

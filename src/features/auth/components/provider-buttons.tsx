'use client';

import { getT } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';
import { Tooltip } from '@/shared/ui/menu';
import { useProviders } from '../api';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3a7.16 7.16 0 0 1-10.66-3.76H1.39v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.32a7.2 7.2 0 0 1 0-4.64v-3.1H1.39a12 12 0 0 0 0 10.84l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 1.39 6.58l4.01 3.1A7.15 7.15 0 0 1 12 4.77Z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[16px]" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10.4v10.4H1z" />
      <path fill="#7FBA00" d="M12.6 1H23v10.4H12.6z" />
      <path fill="#00A4EF" d="M1 12.6h10.4V23H1z" />
      <path fill="#FFB900" d="M12.6 12.6H23V23H12.6z" />
    </svg>
  );
}

/**
 * Botones de Google y Microsoft (RF-002, RF-003). Navegan a la API, que
 * inicia el flujo OIDC con PKCE. Si el despliegue no tiene el proveedor
 * configurado, se muestran deshabilitados con el motivo.
 */
export function ProviderButtons() {
  const t = getT('auth');
  const { data } = useProviders();
  const enabled = new Set(data?.providers ?? []);
  const items = [
    { id: 'google', label: t('login.google'), mark: <GoogleMark /> },
    { id: 'microsoft', label: t('login.microsoft'), mark: <MicrosoftMark /> },
  ] as const;

  return (
    <div className="grid gap-2.5">
      {items.map((p) => {
        const on = enabled.has(p.id);
        const button = (
          <Button
            size="lg"
            className="w-full justify-center"
            disabled={!on}
            leading={p.mark}
            onClick={() => window.location.assign(`/api/v1/auth/oidc/${p.id}`)}
            aria-describedby={on ? undefined : `${p.id}-off`}
          >
            {p.label}
          </Button>
        );
        return on ? <div key={p.id}>{button}</div> : (
          <Tooltip key={p.id} content={t('login.providerOff')}>
            <span tabIndex={0} className="block rounded-[var(--radius-control)]">
              {button}
              <span id={`${p.id}-off`} className="sr-only">{t('login.providerOff')}</span>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function Divider({ label }: { readonly label: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-fg-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

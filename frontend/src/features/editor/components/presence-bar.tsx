'use client';

import { useEffect, useState } from 'react';
import { getT } from '@/shared/i18n';
import { Avatar } from '@/shared/ui/avatar';
import { Tooltip } from '@/shared/ui/menu';
import { useEditor } from '../store';

interface Peer {
  readonly clientId: number;
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly file: string | null;
}

/**
 * Quién está en el proyecto ahora mismo (Yjs Awareness). El nombre y el color
 * los fija el servidor a partir de la sesión: no se pueden suplantar. Se
 * muestran como texto (Avatar), nunca como HTML.
 */
export function PresenceBar() {
  const t = getT('editor');
  const collab = useEditor((s) => s.collab);
  const [peers, setPeers] = useState<readonly Peer[]>([]);

  useEffect(() => {
    if (!collab) return;
    const read = () => {
      const out: Peer[] = [];
      const seen = new Set<string>();
      for (const [clientId, state] of collab.awareness.getStates()) {
        if (clientId === collab.doc.clientID) continue;
        const user = (state as { user?: { id?: unknown; name?: unknown; color?: unknown } }).user;
        if (!user || typeof user.id !== 'string' || typeof user.name !== 'string' || seen.has(user.id)) continue;
        seen.add(user.id);
        const file = (state as { file?: unknown }).file;
        out.push({ clientId, id: user.id, name: user.name, color: typeof user.color === 'string' ? user.color : 'var(--brand)', file: typeof file === 'string' ? file : null });
      }
      setPeers(out);
    };
    read();
    collab.awareness.on('change', read);
    return () => collab.awareness.off('change', read);
  }, [collab]);

  if (peers.length === 0) return null;
  return (
    <div className="hidden items-center gap-1.5 lg:flex" role="group" aria-label={t('presence.label')}>
      {peers.slice(0, 5).map((p) => (
        <Tooltip key={p.id} content={p.file ? t('presence.editing', { name: p.name, file: p.file }) : p.name}>
          <span className="relative rounded-full" style={{ boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${p.color}` }}>
            <Avatar name={p.name} seed={p.id} size="sm" />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-ok ring-2 ring-[var(--surface)]" aria-hidden="true" />
          </span>
        </Tooltip>
      ))}
      {peers.length > 5 && <span className="text-xs text-fg-3">+{peers.length - 5}</span>}
    </div>
  );
}

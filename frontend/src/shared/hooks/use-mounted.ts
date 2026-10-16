'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** true solo en el cliente tras hidratar: para texto que depende de la hora o del dispositivo. */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

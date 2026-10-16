import { getT } from '@/shared/i18n';

/** «hace 4 min», «ayer», «hace 3 días» o la fecha corta. */
export function relativeTime(input: string | Date, now: Date = new Date()): string {
  const t = getT('common');
  const date = typeof input === 'string' ? new Date(input) : input;
  const diff = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t('time.now');
  if (minutes < 60) return t('time.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t('time.yesterday');
  if (days < 7) return t('time.days', { n: days });
  return shortDate(date);
}

export function shortDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function dateTime(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function daysUntil(input: string | Date, days: number): number {
  const date = typeof input === 'string' ? new Date(input) : input;
  const end = date.getTime() + days * 86_400_000;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

/** «0,4 KB», «1,2 MB»: tamaños en el formato del español. */
export function fileSize(bytes: number): string {
  const fmt = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 });
  if (bytes >= 1_000_000) return `${fmt(bytes / 1_000_000)} MB`;
  return `${fmt(Math.max(bytes, 0) / 1000)} KB`;
}

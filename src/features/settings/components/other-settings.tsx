'use client';

import { Download, Info, Mail, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isApiError } from '@/shared/api/errors';
import { useMe } from '@/shared/api/session';
import { getT } from '@/shared/i18n';
import { shortDate } from '@/shared/lib/format';
import { useTheme, type ThemeChoice } from '@/shared/theme/theme';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Segmented, Select, Switch } from '@/shared/ui/controls';
import { Field, Input } from '@/shared/ui/field';
import { Notice } from '@/shared/ui/notice';
import { Skeleton } from '@/shared/ui/states';
import { toast } from '@/shared/ui/toast';
import { exportMyData, useDeleteAccount, useDeletionImpact, useIdentities, usePreferences, useSavePreferences } from '../api';
import { useSensitive } from './reauth';
import { Panel, SettingsHeader } from './settings-shell';

const PROVIDERS = [
  { id: 'local', label: 'linked.local', icon: <Mail className="size-5" strokeWidth={1.5} /> },
  { id: 'google', label: 'Google', icon: <span className="font-semibold text-[#4285F4]">G</span> },
  { id: 'microsoft', label: 'Microsoft', icon: <span className="grid grid-cols-2 gap-px" aria-hidden="true">{['#F25022', '#7FBA00', '#00A4EF', '#FFB900'].map((c) => <span key={c} className="size-2" style={{ background: c }} />)}</span> },
] as const;

/** P-30 · cuentas vinculadas (RF-005). */
export function LinkedAccounts() {
  const t = getT('account');
  const identities = useIdentities();
  return (
    <>
      <SettingsHeader title={t('linked.title')} subtitle={t('linked.subtitle')} />
      <Panel>
        {identities.isLoading ? <Skeleton className="h-40" /> : (
          <ul className="grid divide-y divide-line">
            {PROVIDERS.map((p) => {
              const linked = identities.data?.find((i) => i.provider === p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="grid size-10 place-items-center rounded-[11px] bg-surface-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--border)]">{p.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{p.id === 'local' ? t('linked.local') : p.label}</p>
                    <p className="text-[13px] text-fg-3">{linked ? `${linked.providerEmail ?? ''} · ${t('linked.linkedOn', { date: shortDate(linked.linkedAt) })}` : t('linked.notLinked')}</p>
                  </div>
                  {linked ? <Badge tone="ok" size="sm">{p.id === 'local' ? t('mfa.active') : t('linked.linkedOn', { date: shortDate(linked.linkedAt) })}</Badge>
                    : <Button size="sm" onClick={() => window.location.assign(`/api/v1/auth/oidc/${p.id}`)}>{t('linked.link')}</Button>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Notice tone="info" title={t('linked.rule')}>{t('linked.ruleBody')}</Notice>
    </>
  );
}

interface Prefs { fontSize: number; lineHeight: number; wrap: boolean; autocomplete: boolean; autoclose: boolean; lineNumbers: boolean; spell: string; font: string }
const DEFAULT_PREFS: Prefs = { fontSize: 14, lineHeight: 1.75, wrap: true, autocomplete: true, autoclose: true, lineNumbers: true, spell: 'es', font: 'jetbrains' };

/** P-32 · preferencias del editor, persistidas en la cuenta (F-021). */
export function EditorPreferences() {
  const t = getT('account');
  const c = getT('common');
  const query = usePreferences();
  const save = useSavePreferences();
  const { choice, setChoice } = useTheme();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => { if (query.data) setPrefs({ ...DEFAULT_PREFS, ...(query.data.prefs as Partial<Prefs>) }); }, [query.data]);
  const update = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    save.mutate(next as unknown as Record<string, unknown>, { onSuccess: () => toast.success(t('editor.saved')) });
  };
  if (query.isLoading) return <Skeleton className="h-96" />;
  return (
    <>
      <SettingsHeader title={t('editor.title')} subtitle={t('editor.subtitle')} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="mb-0">
          <div className="grid gap-5">
            <Field label={t('editor.theme')}>{() => <Segmented<ThemeChoice> label={t('editor.theme')} value={choice} onValueChange={setChoice} options={(['light', 'dark', 'system'] as const).map((v) => ({ value: v, label: c(`theme.${v}`) }))} />}</Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('editor.font')}>{(a) => <Select {...a} value={prefs.font} onValueChange={(v) => update('font', v)} options={[{ value: 'jetbrains', label: 'JetBrains Mono' }, { value: 'system', label: 'Monoespaciada del sistema' }]} />}</Field>
              <Field label={t('editor.size')}>{(a) => <Select {...a} value={String(prefs.fontSize)} onValueChange={(v) => update('fontSize', Number(v))} options={['12', '13', '14', '15', '16', '18'].map((s) => ({ value: s, label: `${s} px` }))} />}</Field>
              <Field label={t('editor.lineHeight')}>{(a) => <Select {...a} value={String(prefs.lineHeight)} onValueChange={(v) => update('lineHeight', Number(v))} options={['1.5', '1.65', '1.75', '2'].map((s) => ({ value: s, label: s }))} />}</Field>
            </div>
            <Field label={t('editor.spell')}>{(a) => <Select {...a} value={prefs.spell} onValueChange={(v) => update('spell', v)} options={[{ value: 'es', label: 'Español (Ecuador)' }, { value: 'en', label: 'English (US)' }]} />}</Field>
            <ul className="grid divide-y divide-line rounded-[12px] shadow-[inset_0_0_0_1px_var(--border)]">
              {([['wrap', t('editor.wrap')], ['autocomplete', t('editor.autocomplete')], ['autoclose', t('editor.autoclose')], ['lineNumbers', t('editor.lineNumbers')]] as const).map(([k, label]) => (
                <li key={k} className="flex items-center justify-between px-4 py-3 text-[13px] text-fg">{label}<Switch label={label} checked={prefs[k]} onCheckedChange={(v) => update(k, v)} /></li>
              ))}
            </ul>
          </div>
        </Panel>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">{t('editor.preview')}</p>
          <pre className="card overflow-hidden p-4 font-mono" style={{ fontSize: prefs.fontSize, lineHeight: prefs.lineHeight }} aria-hidden="true">
            {prefs.lineNumbers && <span className="mr-3 text-fg-3">1</span>}<span className="text-brand">\documentclass</span><span className="text-fg-3">{'{'}</span><span className="text-sec">article</span><span className="text-fg-3">{'}'}</span>{'\n'}
            {prefs.lineNumbers && <span className="mr-3 text-fg-3">2</span>}<span className="text-brand">\begin</span><span className="text-fg-3">{'{'}</span><span className="text-sec">document</span><span className="text-fg-3">{'}'}</span>{'\n'}
            {prefs.lineNumbers && <span className="mr-3 text-fg-3">3</span>}Hola, <span className="text-brand">\textbf</span><span className="text-fg-3">{'{'}</span>mundo<span className="text-fg-3">{'}'}</span>.{'\n'}
            {prefs.lineNumbers && <span className="mr-3 text-fg-3">4</span>}<span className="italic text-fg-3">% comentario de ejemplo</span>{'\n'}
            {prefs.lineNumbers && <span className="mr-3 text-fg-3">5</span>}<span className="text-brand">\end</span><span className="text-fg-3">{'{'}</span><span className="text-sec">document</span><span className="text-fg-3">{'}'}</span>
          </pre>
        </div>
      </div>
    </>
  );
}

const RETENTION = [
  ['Correo y nombre', 'Identificación', 'Hasta el borrado'],
  ['Hash de contraseña (Argon2id)', 'Autenticación', 'Hasta el borrado'],
  ['Contenido de proyectos', 'Prestación del servicio', 'Hasta el borrado + 30 días'],
  ['Dirección IP (red /24)', 'Seguridad', '90 días'],
  ['Registro de auditoría', 'Seguridad y obligación legal', '2 años'],
] as const;

const CONFIRMATION = 'ELIMINAR MI CUENTA';

/** P-34 · mis datos y eliminación de la cuenta (RF-011, CU-07, CU-08). */
export function MyData() {
  const t = getT('account');
  const me = useMe();
  const impact = useDeletionImpact();
  const del = useDeleteAccount();
  const sensitive = useSensitive();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const download = async () => {
    setExporting(true);
    try {
      const data = await exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `securtex-mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t('data.exported'), t('data.exportedHint', { n: data.projects.length }));
    } catch (e) {
      toast.error(isApiError(e) ? e.message : getT('states')('error.title'));
    } finally {
      setExporting(false);
    }
  };
  const remove = async () => {
    setError(undefined);
    try { await sensitive(() => del.mutateAsync(text)); } catch (e) { setError(isApiError(e) ? (e.fields['confirmation'] ?? e.message) : undefined); }
  };
  return (
    <>
      <SettingsHeader title={t('data.title')} subtitle={t('data.subtitle')} />
      <Panel title={t('data.export')} description={t('data.exportBody')} action={<Button loading={exporting} leading={<Download className="size-4" strokeWidth={1.5} />} onClick={() => void download()}>{t('data.exportCta')}</Button>}>
        <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium text-fg"><Info className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />{t('data.what')}</h3>
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-fg-3"><th className="pb-2 font-semibold">{t('data.col.data')}</th><th className="pb-2 font-semibold">{t('data.col.purpose')}</th><th className="pb-2 font-semibold">{t('data.col.retention')}</th></tr></thead>
          <tbody>{RETENTION.map(([d, p, r]) => <tr key={d} className="border-b border-line last:border-0"><td className="py-2.5 text-fg">{d}</td><td className="text-fg-2">{p}</td><td className="text-fg-2">{r}</td></tr>)}</tbody>
        </table>
      </Panel>
      <section className="rounded-[14px] bg-danger-soft/50 p-5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_22%,transparent)] animate-rise">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-danger"><Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />{t('data.delete')}</h2>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-fg-2">{t('data.deleteBody')}</p>
        {impact.data && impact.data.sharedOwnedProjects > 0 && (
          <Notice tone="warn" className="mt-4" title={t('data.deleteImpact', { n: impact.data.sharedOwnedProjects })}>{t('data.deleteImpactBody')}</Notice>
        )}
        <div className="mt-4 grid max-w-[460px] gap-3">
          <Field label={t('data.confirmLabel')} error={error}>
            {(a) => <Input {...a} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} placeholder={CONFIRMATION} className="font-mono" />}
          </Field>
          <Button variant="danger" disabled={text !== CONFIRMATION || !me.data} loading={del.isPending} onClick={() => void remove()}>{t('data.deleteCta')}</Button>
        </div>
      </section>
    </>
  );
}

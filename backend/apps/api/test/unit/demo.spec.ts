import { describe, expect, it } from 'vitest';
import { DEMO, DemoBudget, demoProjectId, isDemoEmail } from '../../src/domain/demo';
import { DemoLimits } from '../../src/application/demo/demo-limits';

describe('Presupuestos de la demostración', () => {
  it('los inicios rechazados de una IP no consumen el presupuesto de las demás', () => {
    const limits = new DemoLimits();
    for (let i = 0; i < DEMO.STARTS_PER_HOUR; i++) limits.start('saturada');
    for (let i = 0; i < 100; i++) expect(() => limits.start('saturada')).toThrowError();
    for (let i = 0; i < DEMO.GLOBAL_STARTS_PER_HOUR - DEMO.STARTS_PER_HOUR; i++) limits.start(`otra-${i}`);
    expect(() => limits.start('exceso-global')).toThrowError();
  });

  it('aplica los límites de compilación y peticiones por IP y de todo el servicio', () => {
    const limits = new DemoLimits();
    for (let i = 0; i < DEMO.COMPILES_PER_MINUTE; i++) limits.compile('una-ip');
    expect(() => limits.compile('una-ip')).toThrowError();
    for (let i = 0; i < DEMO.GLOBAL_COMPILES_PER_HOUR - DEMO.COMPILES_PER_MINUTE; i++) limits.compile(`compila-${i}`);
    expect(() => limits.compile('exceso-global')).toThrowError();
    for (let i = 0; i < DEMO.REQUESTS_PER_MINUTE; i++) limits.request('una-ip');
    expect(() => limits.request('una-ip')).toThrowError();
    for (let i = 0; i < DEMO.GLOBAL_REQUESTS_PER_MINUTE - DEMO.REQUESTS_PER_MINUTE; i++) limits.request(`consulta-${i % 100}`);
    expect(() => limits.request('exceso-global')).toThrowError();
  });
  it('solo extrae un alcance válido del método guardado en el servidor', () => {
    const id = '019cf442-3456-7890-abcd-123456789012';
    expect(demoProjectId(`demo:${id}`)).toBe(id);
    expect(demoProjectId('password')).toBeNull();
    expect(demoProjectId('demo:otro-proyecto')).toBeNull();
    expect(demoProjectId('demo')).toBeNull();
  });
  it('admite el límite exacto y devuelve el plazo de espera al agotarlo', () => {
    const budget = new DemoBudget();
    expect(budget.consume('ip', 2, 60_000, 0)).toBeNull();
    expect(budget.consume('ip', 2, 60_000, 100)).toBeNull();
    expect(budget.consume('ip', 2, 60_000, 1_000)).toBe(59);
    expect(budget.consume('ip', 2, 60_000, 60_000)).toBeNull();
  });

  it('separa las IP y no aumenta la memoria cuando se llena', () => {
    const budget = new DemoBudget();
    for (let i = 0; i < DEMO.MAX_BUDGET_KEYS; i++) expect(budget.consume(String(i), 1, 60_000, 0)).toBeNull();
    expect(budget.consume('overflow', 1, 60_000, 0)).toBe(60);
    expect(budget.consume('overflow', 1, 60_000, 60_000)).toBeNull();
  });

  it('reconoce exclusivamente los correos reservados completos', () => {
    expect(isDemoEmail(DEMO.OWNER_EMAIL)).toBe(true);
    for (const email of DEMO.GUEST_EMAILS) expect(isDemoEmail(email)).toBe(true);
    expect(isDemoEmail('demo.99@securtex.invalid')).toBe(false);
    expect(isDemoEmail('demo.1@securtex.invalid.example.com')).toBe(false);
    expect(isDemoEmail('usuario@example.com')).toBe(false);
  });
});

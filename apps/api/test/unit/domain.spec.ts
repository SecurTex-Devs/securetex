import { describe, expect, it } from 'vitest';
import { allowedActions, decide } from '../../src/domain/project-policy';
import { Email, ProjectName, checkPasswordPolicy } from '../../src/domain/values';

describe('Política de proyectos (matriz RBAC 05-Seguridad §8.1)', () => {
  it('quien no es miembro no puede nada', () => {
    expect(decide(null, 'view')).toEqual({ allowed: false, reason: 'not_member' });
  });

  it.each([
    ['viewer', 'view', true], ['viewer', 'compile', true], ['viewer', 'comment', false], ['viewer', 'edit_content', false],
    ['reviewer', 'comment', true], ['reviewer', 'edit_content', false],
    ['editor', 'edit_content', true], ['editor', 'change_settings', true], ['editor', 'rename', false], ['editor', 'manage_access', false],
    ['owner', 'rename', true], ['owner', 'manage_access', true], ['owner', 'delete_forever', true], ['owner', 'leave', false],
  ] as const)('%s → %s = %s', (role, action, allowed) => {
    expect(decide(role, action).allowed).toBe(allowed);
  });

  it('solo el propietario gestiona el acceso', () => {
    expect(allowedActions('owner')).toContain('manage_access');
    for (const role of ['editor', 'reviewer', 'viewer'] as const) expect(allowedActions(role)).not.toContain('manage_access');
  });
});

describe('Objetos de valor', () => {
  it('Email normaliza y rechaza formatos inválidos', () => {
    expect(Email.of('  Ana.Torres@UTA.edu.ec ').toString()).toBe('ana.torres@uta.edu.ec');
    for (const bad of ['', 'ana', 'ana@', '@uta.ec', 'a b@uta.ec', '<script>@x.io']) expect(() => Email.of(bad)).toThrow();
  });

  it('ProjectName rechaza vacíos, excesos y caracteres de control', () => {
    expect(ProjectName.of('  Tesis   final ').toString()).toBe('Tesis final');
    expect(() => ProjectName.of('   ')).toThrow();
    expect(() => ProjectName.of('a'.repeat(121))).toThrow();
    expect(() => ProjectName.of('nombre\u0000oculto')).toThrow();
  });

  it('la política de contraseñas sigue NIST: longitud, no derivada del correo, no común', () => {
    const email = Email.of('ana.torres@uta.edu.ec');
    expect(checkPasswordPolicy('corta', email)).toBe('too_short');
    expect(checkPasswordPolicy('ana.torres-es-genial', email)).toBe('contains_email');
    expect(checkPasswordPolicy('aaaaaaaaaaaaaaa', email)).toBe('common');
    expect(checkPasswordPolicy('caballo correcto batería grapa', email)).toBeNull();
  });
});

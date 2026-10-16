import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { ProjectRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { EncryptedFileStore } from '../application/files/file-store';
import { templateFiles, type TemplateId } from '../domain/templates';
import { asUserId, SafeFilePath } from '../domain/values';
import { Databases } from '../infrastructure/db/databases';
import { FileCrypto } from '../infrastructure/security/envelope';
import { PasswordHasher } from '../infrastructure/security/passwords';

/**
 * Escenario canónico sintético (AGENTS.md §5): 4 usuarios, 5 proyectos y los
 * 4 roles. Idempotente: si ya hay usuarios, no hace nada. Correos en el
 * dominio reservado .test: nunca datos reales.
 */
const USERS = [
  { key: 'ana', email: 'ana.torres@securtex.test', firstName: 'Ana', lastName: 'Torres', admin: true, title: 'Estudiante de maestría' },
  { key: 'maria', email: 'maria.rodriguez@securtex.test', firstName: 'María', lastName: 'Rodríguez', admin: false, title: 'Directora de tesis' },
  { key: 'jorge', email: 'jorge.cardenas@securtex.test', firstName: 'Jorge', lastName: 'Cárdenas', admin: false, title: 'Revisor' },
  { key: 'luis', email: 'luis.perez@securtex.test', firstName: 'Luis', lastName: 'Pérez', admin: false, title: 'Estudiante' },
] as const;

type Key = (typeof USERS)[number]['key'];

const PROJECTS: ReadonlyArray<{ name: string; owner: Key; template: TemplateId; members: ReadonlyArray<readonly [Key, ProjectRole]>; tag?: string; archived?: boolean }> = [
  { name: 'Tesis · Detección de intrusiones en tiempo real', owner: 'ana', template: 'tesis-uta', members: [['maria', 'editor'], ['jorge', 'reviewer']], tag: 'Tesis' },
  { name: 'Artículo IEEE · Sandboxing de compiladores', owner: 'maria', template: 'articulo', members: [['ana', 'editor']], tag: 'Artículos' },
  { name: 'Revisión · Criptografía post-cuántica', owner: 'jorge', template: 'articulo', members: [['ana', 'reviewer'], ['luis', 'viewer']] },
  { name: 'Guía de laboratorio · Seguridad de Software', owner: 'ana', template: 'informe-lab', members: [], tag: 'Docencia' },
  { name: 'Presentación · Defensa de tesis', owner: 'luis', template: 'presentacion', members: [['ana', 'viewer']] },
  { name: 'Póster · Congreso de estudiantes 2025', owner: 'ana', template: 'blank', members: [], archived: true },
];

const TAGS = [
  { name: 'Tesis', color: 'blue' },
  { name: 'Artículos', color: 'green' },
  { name: 'Docencia', color: 'amber' },
] as const;

async function main(): Promise<void> {
  const log = new Logger('Seed');
  const db = new Databases();
  if ((await db.identity.user.count()) > 0) {
    log.log('Ya hay datos: no se siembra nada.');
    await db.onModuleDestroy();
    return;
  }
  const provided = process.env['SEED_DEMO_PASSWORD'];
  const password = provided && provided.length >= 12 ? provided : randomBytes(12).toString('base64url');
  const hash = await new PasswordHasher().hash(password);

  const store = new EncryptedFileStore(new FileCrypto());
  const ids = new Map<Key, string>();
  for (const u of USERS) {
    const user = await db.identity.user.create({
      data: {
        primaryEmail: u.email, passwordHash: hash, passwordUpdatedAt: new Date(), emailVerifiedAt: new Date(), status: 'active',
        firstName: u.firstName, lastName: u.lastName, roleTitle: u.title, institution: 'Universidad Técnica de Ambato', isSystemAdmin: u.admin,
        identities: { create: { provider: 'local', providerSubject: u.email, providerEmail: u.email } },
      },
    });
    ids.set(u.key, user.id);
  }
  const id = (k: Key): string => ids.get(k) ?? '';

  const tagIds = await db.asUser(asUserId(id('ana')), async (tx) => {
    const map = new Map<string, string>();
    for (const t of TAGS) map.set(t.name, (await tx.tag.create({ data: { userId: id('ana'), name: t.name, color: t.color } })).id);
    return map;
  });

  for (const [index, p] of PROJECTS.entries()) {
    const ownerId = id(p.owner);
    const owner = USERS.find((u) => u.key === p.owner);
    const files = templateFiles(p.template, p.name, owner ? `${owner.firstName} ${owner.lastName}` : '');
    await db.asUser(asUserId(ownerId), async (tx) => {
      const project = await tx.project.create({
        data: {
          ownerId, name: p.name, compiler: p.template === 'presentacion' ? 'xelatex' : 'pdflatex',
          lastActivityAt: new Date(Date.now() - index * 26 * 3_600_000),
          ...(p.archived ? { archivedAt: new Date() } : {}),
        },
      });
      await tx.projectMember.create({ data: { projectId: project.id, userId: ownerId, role: 'owner' } });
      // Clave del proyecto y archivos de la plantilla, cifrados igual que desde la API.
      await store.createProjectKey(tx, project.id);
      for (const f of files) await store.insert(tx, project.id, ownerId, SafeFilePath.of(f.path), f.content);
      for (const [member, role] of p.members) {
        await tx.projectMember.create({ data: { projectId: project.id, userId: id(member), role, invitedBy: ownerId } });
      }
      const tagId = p.tag ? tagIds.get(p.tag) : undefined;
      if (tagId && p.owner === 'ana') await tx.projectTag.create({ data: { projectId: project.id, tagId } });
    });
  }

  log.log(`Escenario sembrado: ${USERS.length} usuarios y ${PROJECTS.length} proyectos.`);
  if (!provided) {
    // Solo si no se configuró: contraseña aleatoria de demostración mostrada una vez.
    log.warn(`Contraseña de demostración generada (cuentas *@securtex.test): ${password}`);
  }
  await db.onModuleDestroy();
}

void main();

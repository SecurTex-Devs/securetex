import { loadEnv } from '../config/env';
import { DEMO } from '../domain/demo';
import { DEMO_DOCUMENT } from '../domain/demo-document';
import { asUserId, SafeFilePath } from '../domain/values';
import { EncryptedFileStore } from '../application/files/file-store';
import { Databases } from '../infrastructure/db/databases';
import { FileCrypto } from '../infrastructure/security/envelope';
import { FIELD, FieldCipher } from '../infrastructure/security/field-cipher';

const cipher = new FieldCipher();
const db = new Databases();
const store = new EncryptedFileStore(new FileCrypto(), cipher);
const day = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(date);

async function account(email: string, index: number): Promise<string> {
  const emailIndex = cipher.emailIndex(email);
  const existing = await db.identity.user.findUnique({ where: { emailIndex }, include: { _count: { select: { identities: true } } } });
  if (existing) {
    if (existing.isSystemAdmin || existing.passwordHash || existing._count.identities !== 0 || existing.status !== 'active') {
      throw new Error('La identidad reservada de la demo tiene credenciales, privilegios o un estado no permitido.');
    }
    return existing.id;
  }
  const user = await db.identity.user.create({ data: {
    emailIndex, primaryEmail: cipher.encrypt(email, FIELD.userEmail),
    firstName: cipher.encrypt(index === 0 ? 'Biblioteca' : `Visitante ${index}`, FIELD.userFirstName),
    lastName: cipher.encrypt('Demo', FIELD.userLastName),
    institution: cipher.encrypt('', FIELD.userInstitution), roleTitle: cipher.encrypt('', FIELD.userRoleTitle),
    emailVerifiedAt: new Date(), status: 'active', passwordHash: null, isSystemAdmin: false,
  } });
  return user.id;
}

async function seed(reset: boolean): Promise<void> {
  const owner = await account(DEMO.OWNER_EMAIL, 0);
  const guests: string[] = [];
  for (const [index, email] of DEMO.GUEST_EMAILS.entries()) guests.push(await account(email, index + 1));
  const ids = [owner, ...guests];
  const existing = await db.asUser(asUserId(owner), (tx) => tx.project.findMany({ where: { ownerId: owner }, select: { id: true, createdAt: true } }));
  if (!reset && existing.length === 1 && existing[0] && day(existing[0].createdAt) === day()) return;
  // Revocar primero: las conexiones abiertas lo detectan en su revalidación periódica.
  await db.identity.session.updateMany({ where: { userId: { in: ids }, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'demo_reset' } });
  await db.asUser(asUserId(owner), async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('securtex:demo-reset'))`;
    // La política RLS exige pasar por la papelera antes del borrado definitivo.
    await tx.project.updateMany({ where: { ownerId: owner }, data: { trashedAt: new Date() } });
    await tx.project.deleteMany({ where: { ownerId: owner } });
    if (await tx.project.count({ where: { ownerId: owner } }) !== 0) throw new Error('El reinicio no pudo retirar los proyectos anteriores de la demo.');
    const project = await tx.project.create({ data: {
      ownerId: owner, name: cipher.encrypt('Un currículum para empezar', FIELD.projectName),
      mainFile: cipher.encrypt('main.tex', FIELD.projectMainFile), compiler: 'pdflatex',
    } });
    await tx.projectMember.createMany({ data: [
      { projectId: project.id, userId: owner, role: 'owner' },
      ...guests.map((userId) => ({ projectId: project.id, userId, role: 'editor' as const, invitedBy: owner })),
    ] });
    await store.createProjectKey(tx, project.id);
    await store.insert(tx, project.id, owner, SafeFilePath.of('main.tex'), DEMO_DOCUMENT);
  });
  await db.identity.session.deleteMany({ where: { userId: { in: ids } } });
  await db.identity.emailToken.deleteMany({ where: { userId: { in: ids } } });
  console.info('Documento de demostración preparado.');
}

async function main(): Promise<void> {
  if (!loadEnv().DEMO_ENABLED) throw new Error('La demostración está deshabilitada.');
  await seed(process.argv.includes('--reset'));
  if (!process.argv.includes('--watch')) { await db.onModuleDestroy(); return; }
  let previous = day();
  let resetting = false;
  setInterval(() => {
    const current = day();
    if (current === previous || resetting) return;
    resetting = true;
    void seed(true).then(() => { previous = current; }).catch(() => console.error('No se pudo reiniciar la demo; se reintentará.')).finally(() => { resetting = false; });
  }, 60_000);
}

void main().catch(async () => { console.error('No se pudo preparar la demo. Revisa su configuración y las identidades reservadas.'); await db.onModuleDestroy(); process.exitCode = 1; });

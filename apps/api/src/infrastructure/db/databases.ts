import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { loadEnv } from '../../config/env';
import type { UserId } from '../../domain/values';

export type AppTx = Prisma.TransactionClient;

/**
 * Tres conexiones, tres roles de PostgreSQL con el mínimo privilegio:
 *
 * | Cliente    | Rol                 | Puede tocar                                   |
 * |------------|---------------------|-----------------------------------------------|
 * | identity   | securtex_identity   | cuentas, sesiones, MFA, tokens de correo      |
 * | app        | securtex_app        | proyectos y acceso, SIEMPRE bajo RLS          |
 * | audit      | securtex_audit      | solo INSERT/SELECT en audit_events            |
 *
 * Un fallo de autorización en el servicio de proyectos no puede leer hashes
 * de contraseña ni borrar la auditoría: la base de datos no se lo permite.
 */
@Injectable()
export class Databases implements OnModuleDestroy {
  readonly identity: PrismaClient;
  readonly audit: PrismaClient;
  private readonly app: PrismaClient;

  constructor() {
    const env = loadEnv();
    this.identity = new PrismaClient({ datasourceUrl: env.DATABASE_URL_IDENTITY });
    this.app = new PrismaClient({ datasourceUrl: env.DATABASE_URL_APP });
    this.audit = new PrismaClient({ datasourceUrl: env.DATABASE_URL_AUDIT });
  }

  /**
   * Única puerta de acceso a las tablas de proyectos. Fija `app.user_id` en la
   * transacción para que las políticas RLS sepan quién pregunta. No existe
   * ninguna otra forma de obtener el cliente `app`: olvidar el contexto es
   * imposible por construcción (AGENTS.md §2.4).
   */
  async asUser<T>(userId: UserId, fn: (tx: AppTx) => Promise<T>): Promise<T> {
    return this.app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.identity.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.identity.$disconnect(), this.app.$disconnect(), this.audit.$disconnect()]);
  }
}

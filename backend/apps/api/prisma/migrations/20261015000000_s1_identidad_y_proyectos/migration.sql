-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- uuidv7(): identificadores ordenables en el tiempo y no secuenciales (RS-011).
-- PostgreSQL 17 no la incluye de serie.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  ts bytea := substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3);
  b  bytea := ts || gen_random_bytes(10);
BEGIN
  b := set_byte(b, 6, (b'0111' || get_byte(b, 6)::bit(4))::bit(8)::int);
  b := set_byte(b, 8, (b'10'   || get_byte(b, 8)::bit(6))::bit(8)::int);
  RETURN encode(b, 'hex')::uuid;
END $$;

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('pending', 'active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "idp_provider" AS ENUM ('local', 'google', 'microsoft');

-- CreateEnum
CREATE TYPE "mfa_type" AS ENUM ('totp', 'recovery_code');

-- CreateEnum
CREATE TYPE "challenge_kind" AS ENUM ('mfa', 'oidc');

-- CreateEnum
CREATE TYPE "email_token_purpose" AS ENUM ('verify_email', 'reset_password');

-- CreateEnum
CREATE TYPE "project_role" AS ENUM ('owner', 'editor', 'reviewer', 'viewer');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "compiler_engine" AS ENUM ('pdflatex', 'xelatex', 'lualatex');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "primary_email" CITEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "password_hash" TEXT,
    "password_updated_at" TIMESTAMPTZ(3),
    "first_name" TEXT NOT NULL DEFAULT '',
    "last_name" TEXT NOT NULL DEFAULT '',
    "institution" TEXT NOT NULL DEFAULT '',
    "role_title" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT 'es',
    "timezone" TEXT NOT NULL DEFAULT 'America/Guayaquil',
    "status" "user_status" NOT NULL DEFAULT 'pending',
    "is_system_admin" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "provider" "idp_provider" NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "provider_email" CITEXT,
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "csrf_hash" BYTEA NOT NULL,
    "ip_prefix" TEXT NOT NULL,
    "user_agent_hash" TEXT NOT NULL,
    "device_label" TEXT NOT NULL,
    "auth_method" TEXT NOT NULL,
    "remember" BOOLEAN NOT NULL DEFAULT false,
    "elevated_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "session_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID,
    "kind" "challenge_kind" NOT NULL,
    "secret_hash" BYTEA NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "purpose" "email_token_purpose" NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_methods" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "type" "mfa_type" NOT NULL,
    "secret_encrypted" BYTEA,
    "code_hash" BYTEA,
    "label" TEXT NOT NULL DEFAULT '',
    "last_used_step" BIGINT,
    "confirmed_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_throttle" (
    "key_hash" BYTEA NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),

    CONSTRAINT "login_throttle_pkey" PRIMARY KEY ("key_hash")
);

-- CreateTable
CREATE TABLE "editor_preferences" (
    "user_id" UUID NOT NULL,
    "prefs" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editor_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "seq" BIGSERIAL NOT NULL,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trace_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "actor_user_id" UUID,
    "actor_ip_prefix" TEXT,
    "actor_ua_hash" TEXT,
    "target_type" TEXT,
    "target_id" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "prev_hash" BYTEA NOT NULL,
    "hash" BYTEA NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "compiler" "compiler_engine" NOT NULL DEFAULT 'pdflatex',
    "main_file" TEXT NOT NULL DEFAULT 'main.tex',
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "trashed_at" TIMESTAMPTZ(3),
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "project_role" NOT NULL,
    "invited_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "project_role" NOT NULL,
    "invited_by" UUID NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_tags" (
    "tag_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "project_tags_pkey" PRIMARY KEY ("tag_id","project_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_primary_email_key" ON "users"("primary_email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_provider_subject_key" ON "user_identities"("provider", "provider_subject");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_user_id_purpose_idx" ON "email_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "mfa_methods_user_id_type_idx" ON "mfa_methods"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_id_key" ON "audit_events"("id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_occurred_at_idx" ON "audit_events"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_event_type_occurred_at_idx" ON "audit_events"("event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_revoked_at_idx" ON "project_members"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "invitations_email_status_idx" ON "invitations"("email", "status");

-- CreateIndex
CREATE INDEX "invitations_project_id_idx" ON "invitations"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_user_id_name_key" ON "tags"("user_id", "name");

-- CreateIndex
CREATE INDEX "project_tags_project_id_idx" ON "project_tags"("project_id");

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_methods" ADD CONSTRAINT "mfa_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_preferences" ADD CONSTRAINT "editor_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tags" ADD CONSTRAINT "project_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tags" ADD CONSTRAINT "project_tags_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
--  SEGURIDAD DE LA BASE DE DATOS
--  · Un rol por frontera de confianza, con el mínimo privilegio (RS-012).
--  · Row Level Security HABILITADA y FORZADA en toda tabla con datos de usuario.
--  · Auditoría append-only (RS-050, RS-051).
-- ════════════════════════════════════════════════════════════════════════════

-- Los roles con LOGIN y contraseña los crea infra/postgres/01-roles.sh.
-- Aquí solo se garantiza que existan para que la migración sea autocontenida.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'securtex_identity') THEN CREATE ROLE securtex_identity NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'securtex_app')      THEN CREATE ROLE securtex_app NOLOGIN;      END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'securtex_audit')    THEN CREATE ROLE securtex_audit NOLOGIN;    END IF;
  -- Propietario de las funciones auxiliares de RLS. BYPASSRLS es necesario para
  -- que esas funciones consulten project_members sin recursión de políticas.
  -- No puede iniciar sesión.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'securtex_rls_helper') THEN CREATE ROLE securtex_rls_helper NOLOGIN BYPASSRLS; END IF;
END $$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO securtex_identity, securtex_app, securtex_audit, securtex_rls_helper;

-- ─────────────────────────── Funciones auxiliares ───────────────────────────

-- Usuario efectivo de la transacción. Si el servicio olvida establecerlo,
-- devuelve NULL y ninguna política deja ver filas: fallo seguro (fail closed).
CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

GRANT SELECT ON users, projects, project_members, invitations TO securtex_rls_helper;

CREATE OR REPLACE FUNCTION app_current_email() RETURNS citext
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT primary_email FROM users WHERE id = app_current_user() AND email_verified_at IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION app_has_project_role(p_project uuid, p_roles project_role[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members m
    WHERE m.project_id = p_project
      AND m.user_id    = app_current_user()
      AND m.role       = ANY (p_roles)
      AND m.revoked_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION app_is_project_owner(p_project uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project AND p.owner_id = app_current_user())
$$;

CREATE OR REPLACE FUNCTION app_shares_project(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members mine
    JOIN project_members theirs ON theirs.project_id = mine.project_id
    WHERE mine.user_id = app_current_user() AND mine.revoked_at IS NULL
      AND theirs.user_id = p_user AND theirs.revoked_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION app_has_pending_invitation(p_project uuid, p_role project_role DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM invitations i
    WHERE i.project_id = p_project
      AND i.email      = app_current_email()
      AND i.status     = 'pending'
      AND i.expires_at > now()
      AND (p_role IS NULL OR i.role = p_role)
  )
$$;

ALTER FUNCTION app_current_email()                           OWNER TO securtex_rls_helper;
ALTER FUNCTION app_has_project_role(uuid, project_role[])     OWNER TO securtex_rls_helper;
ALTER FUNCTION app_is_project_owner(uuid)                     OWNER TO securtex_rls_helper;
ALTER FUNCTION app_shares_project(uuid)                       OWNER TO securtex_rls_helper;
ALTER FUNCTION app_has_pending_invitation(uuid, project_role) OWNER TO securtex_rls_helper;

-- ─────────────────────── Identidad · rol securtex_identity ───────────────────────
-- El servicio de identidad necesita buscar cuentas por correo antes de que
-- exista un usuario autenticado; por eso su política es de servicio. Ningún
-- otro rol puede leer estas tablas (salvo las columnas públicas de users).

GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, user_identities, sessions, refresh_tokens, auth_challenges,
  email_tokens, mfa_methods, login_throttle, editor_preferences
TO securtex_identity;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','user_identities','sessions','refresh_tokens','auth_challenges',
                           'email_tokens','mfa_methods','login_throttle','editor_preferences']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY identity_service ON %I TO securtex_identity USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- El servicio de proyectos solo ve nombre y correo de sí mismo y de quienes
-- comparten algún proyecto con él; nunca hashes, estado de MFA ni sesiones.
GRANT SELECT (id, primary_email, first_name, last_name, status) ON users TO securtex_app;
CREATE POLICY users_app_read ON users FOR SELECT TO securtex_app
  USING (id = app_current_user() OR app_shares_project(id));

-- ─────────────────────── Proyectos · rol securtex_app ───────────────────────

GRANT SELECT, INSERT, DELETE ON projects TO securtex_app;
-- owner_id no figura: la propiedad no se cambia con un UPDATE (T-A11).
GRANT UPDATE (name, compiler, main_file, confidential, archived_at, trashed_at, last_activity_at, updated_at) ON projects TO securtex_app;
GRANT SELECT, INSERT ON project_members TO securtex_app;
GRANT UPDATE (role, revoked_at) ON project_members TO securtex_app;
GRANT SELECT, INSERT ON invitations TO securtex_app;
GRANT UPDATE (status, responded_at) ON invitations TO securtex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tags, project_tags TO securtex_app;

ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects        FORCE  ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members FORCE  ROW LEVEL SECURITY;
ALTER TABLE invitations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations     FORCE  ROW LEVEL SECURITY;
ALTER TABLE tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags            FORCE  ROW LEVEL SECURITY;
ALTER TABLE project_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tags    FORCE  ROW LEVEL SECURITY;

-- Proyectos: se ven los propios, aquellos en los que se colabora y aquellos
-- a los que se ha sido invitado (para mostrar el nombre en la invitación).
CREATE POLICY projects_select ON projects FOR SELECT TO securtex_app USING (
  owner_id = app_current_user()
  OR app_has_project_role(id, ARRAY['owner','editor','reviewer','viewer']::project_role[])
  OR app_has_pending_invitation(id)
);
CREATE POLICY projects_insert ON projects FOR INSERT TO securtex_app
  WITH CHECK (owner_id = app_current_user());
CREATE POLICY projects_update ON projects FOR UPDATE TO securtex_app
  USING      (app_has_project_role(id, ARRAY['owner','editor']::project_role[]))
  WITH CHECK (app_has_project_role(id, ARRAY['owner','editor']::project_role[]));
-- El borrado definitivo solo es posible desde la papelera y por el propietario.
CREATE POLICY projects_delete ON projects FOR DELETE TO securtex_app
  USING (owner_id = app_current_user() AND trashed_at IS NOT NULL);

CREATE POLICY members_select ON project_members FOR SELECT TO securtex_app USING (
  user_id = app_current_user()
  OR app_has_project_role(project_id, ARRAY['owner','editor','reviewer','viewer']::project_role[])
);
-- Alta de miembros: el propietario, o el propio invitado con una invitación
-- pendiente para ese rol exacto. Nadie que no sea el propietario se da «owner».
CREATE POLICY members_insert ON project_members FOR INSERT TO securtex_app WITH CHECK (
  (app_is_project_owner(project_id) AND (role <> 'owner' OR user_id = app_current_user()))
  OR (user_id = app_current_user() AND role <> 'owner' AND app_has_pending_invitation(project_id, role))
);
-- Cambiar rol o revocar: el propietario. Un colaborador solo puede marcar su
-- propia fila como revocada (abandonar el proyecto), nunca reactivarla.
CREATE POLICY members_update ON project_members FOR UPDATE TO securtex_app
  USING      (app_is_project_owner(project_id) OR user_id = app_current_user())
  WITH CHECK (app_is_project_owner(project_id) OR (user_id = app_current_user() AND revoked_at IS NOT NULL));

CREATE POLICY invitations_select ON invitations FOR SELECT TO securtex_app
  USING (app_is_project_owner(project_id) OR email = app_current_email());
CREATE POLICY invitations_insert ON invitations FOR INSERT TO securtex_app
  WITH CHECK (app_is_project_owner(project_id) AND invited_by = app_current_user() AND role <> 'owner');
CREATE POLICY invitations_update ON invitations FOR UPDATE TO securtex_app
  USING      (app_is_project_owner(project_id) OR email = app_current_email())
  WITH CHECK (app_is_project_owner(project_id) OR email = app_current_email());

-- Etiquetas: estrictamente privadas.
CREATE POLICY tags_owner ON tags TO securtex_app
  USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());
CREATE POLICY project_tags_owner ON project_tags TO securtex_app
  USING (EXISTS (SELECT 1 FROM tags t WHERE t.id = tag_id AND t.user_id = app_current_user()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM tags t WHERE t.id = tag_id AND t.user_id = app_current_user())
    AND app_has_project_role(project_id, ARRAY['owner','editor','reviewer','viewer']::project_role[])
  );

-- ─────────────────────── Auditoría · rol securtex_audit ───────────────────────

GRANT SELECT, INSERT ON audit_events TO securtex_audit;
GRANT USAGE, SELECT ON SEQUENCE audit_events_seq_seq TO securtex_audit;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE  ROW LEVEL SECURITY;
CREATE POLICY audit_append ON audit_events FOR INSERT TO securtex_audit WITH CHECK (true);
CREATE POLICY audit_read   ON audit_events FOR SELECT TO securtex_audit USING (true);

-- Estrictamente append-only, también para el propietario de la tabla.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;
CREATE RULE audit_no_update AS ON UPDATE TO audit_events DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO audit_events DO INSTEAD NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
--  S3 · Cifrado por columna de datos personales y de contenido (capa C3c)
--
--  Las columnas marcadas pasan a guardar `c3c:v1:<iv ‖ AES-256-CBC ‖ HMAC-SHA-256>`
--  (encrypt-then-MAC, 14-Criptografia-Multicapa §6.3). La aplicación cifra
--  y descifra; PostgreSQL solo ve bytes opacos.
--
--  Para buscar sin descifrar se añaden índices ciegos (*_index): HMAC-SHA-256
--  con una clave propia, nunca cifrado determinista. Las búsquedas por
--  igualdad (correo, sujeto OIDC, ruta, nombre de etiqueta) y las restricciones
--  de unicidad pasan a esos índices.
--
--  ⚠️ Requiere una base vacía o reiniciada: los valores existentes en claro
--  no se pueden convertir desde SQL porque la clave no está en la base.
-- ════════════════════════════════════════════════════════════════════════════

-- Las políticas que comparan correos en claro se rehacen al final con el índice ciego.
DROP POLICY invitations_select ON invitations;
DROP POLICY invitations_update ON invitations;

-- ─── users ───
ALTER TABLE "users" ALTER COLUMN "primary_email" TYPE TEXT;
DROP INDEX "users_primary_email_key";
ALTER TABLE "users" ADD COLUMN "email_index" TEXT NOT NULL;
CREATE UNIQUE INDEX "users_email_index_key" ON "users"("email_index");

-- ─── user_identities ───
ALTER TABLE "user_identities" ALTER COLUMN "provider_email" TYPE TEXT;
DROP INDEX "user_identities_provider_provider_subject_key";
ALTER TABLE "user_identities" ADD COLUMN "subject_index" TEXT NOT NULL;
CREATE UNIQUE INDEX "user_identities_provider_subject_index_key" ON "user_identities"("provider", "subject_index");

-- ─── projects ───
-- El documento principal se fija siempre cifrado al crear el proyecto.
ALTER TABLE "projects" ALTER COLUMN "main_file" DROP DEFAULT;

-- ─── invitations ───
ALTER TABLE "invitations" ALTER COLUMN "email" TYPE TEXT;
DROP INDEX "invitations_email_status_idx";
ALTER TABLE "invitations" ADD COLUMN "email_index" TEXT NOT NULL;
CREATE INDEX "invitations_email_index_status_idx" ON "invitations"("email_index", "status");

-- ─── tags ───
DROP INDEX "tags_user_id_name_key";
ALTER TABLE "tags" ADD COLUMN "name_index" TEXT NOT NULL;
CREATE UNIQUE INDEX "tags_user_id_name_index_key" ON "tags"("user_id", "name_index");

-- ─── project_files ───
DROP INDEX "project_files_project_id_path_key";
ALTER TABLE "project_files" ADD COLUMN "path_index" TEXT NOT NULL;
CREATE UNIQUE INDEX "project_files_project_id_path_index_key" ON "project_files"("project_id", "path_index");
GRANT UPDATE ("path_index") ON "project_files" TO securtex_app;

-- ─── RLS: las invitaciones se casan por índice ciego, no por el correo en claro ───

CREATE OR REPLACE FUNCTION app_current_email_index() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT email_index FROM users WHERE id = app_current_user() AND email_verified_at IS NOT NULL
$$;
ALTER FUNCTION app_current_email_index() OWNER TO securtex_rls_helper;

CREATE OR REPLACE FUNCTION app_has_pending_invitation(p_project uuid, p_role project_role DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM invitations i
    WHERE i.project_id  = p_project
      AND i.email_index = app_current_email_index()
      AND i.status      = 'pending'
      AND i.expires_at  > now()
      AND (p_role IS NULL OR i.role = p_role)
  )
$$;

DROP FUNCTION app_current_email();

CREATE POLICY invitations_select ON invitations FOR SELECT TO securtex_app
  USING (app_is_project_owner(project_id) OR email_index = app_current_email_index());
CREATE POLICY invitations_update ON invitations FOR UPDATE TO securtex_app
  USING      (app_is_project_owner(project_id) OR email_index = app_current_email_index())
  WITH CHECK (app_is_project_owner(project_id) OR email_index = app_current_email_index());

-- El servicio de proyectos puede leer el índice ciego de los usuarios que ya
-- ve (para casar invitaciones), nunca el de los demás: la política no cambia.
GRANT SELECT ("email_index") ON "users" TO securtex_app;

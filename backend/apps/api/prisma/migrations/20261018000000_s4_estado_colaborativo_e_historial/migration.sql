-- ════════════════════════════════════════════════════════════════════════════
--  S4 · Estado CRDT de la colaboración e historial de versiones
--  Ambos se guardan cifrados con la KEK del proyecto (C3) y con HMAC (C4).
--  La base solo ve bytes opacos; RLS limita quién lee y quién escribe.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE "project_collab_states" (
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "wrapped_dek" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "mac" BYTEA NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_collab_states_pkey" PRIMARY KEY ("project_id")
);
ALTER TABLE "project_collab_states" ADD CONSTRAINT "project_collab_states_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "project_file_versions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "wrapped_dek" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "mac" BYTEA NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_file_versions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_file_versions_project_id_file_id_created_at_idx" ON "project_file_versions"("project_id", "file_id", "created_at");
ALTER TABLE "project_file_versions" ADD CONSTRAINT "project_file_versions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE project_collab_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_collab_states FORCE  ROW LEVEL SECURITY;
ALTER TABLE project_file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_file_versions FORCE  ROW LEVEL SECURITY;

-- Estado de la sala: lo lee cualquier miembro (la sala se abre con quien entra
-- primero) y lo escriben propietario o editores en su propio nombre.
GRANT SELECT, INSERT ON project_collab_states TO securtex_app;
GRANT UPDATE (version, wrapped_dek, nonce, ciphertext, mac, updated_by, updated_at) ON project_collab_states TO securtex_app;
CREATE POLICY collab_read ON project_collab_states FOR SELECT TO securtex_app
  USING (app_has_project_role(project_id, ARRAY['owner','editor','reviewer','viewer']::project_role[]));
CREATE POLICY collab_create ON project_collab_states FOR INSERT TO securtex_app
  WITH CHECK (app_has_project_role(project_id, ARRAY['owner','editor']::project_role[]) AND updated_by = app_current_user());
CREATE POLICY collab_update ON project_collab_states FOR UPDATE TO securtex_app
  USING      (app_has_project_role(project_id, ARRAY['owner','editor']::project_role[]))
  WITH CHECK (app_has_project_role(project_id, ARRAY['owner','editor']::project_role[]) AND updated_by = app_current_user());

-- Historial: se lee como el proyecto; se inserta en nombre propio; se poda
-- (borrar las más antiguas) solo con rol de escritura. Sin UPDATE: inmutable.
GRANT SELECT, INSERT, DELETE ON project_file_versions TO securtex_app;
CREATE POLICY versions_read ON project_file_versions FOR SELECT TO securtex_app
  USING (app_has_project_role(project_id, ARRAY['owner','editor','reviewer','viewer']::project_role[]));
CREATE POLICY versions_create ON project_file_versions FOR INSERT TO securtex_app
  WITH CHECK (app_has_project_role(project_id, ARRAY['owner','editor']::project_role[]) AND created_by = app_current_user());
CREATE POLICY versions_prune ON project_file_versions FOR DELETE TO securtex_app
  USING (app_has_project_role(project_id, ARRAY['owner','editor']::project_role[]));

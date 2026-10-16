-- CreateTable
CREATE TABLE "project_keys" (
    "project_id" UUID NOT NULL,
    "wrapped_kek" BYTEA NOT NULL,
    "master_version" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_keys_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "project_files" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "wrapped_dek" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "mac" BYTEA NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_files_project_id_path_key" ON "project_files"("project_id", "path");

-- AddForeignKey
ALTER TABLE "project_keys" ADD CONSTRAINT "project_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
--  SEGURIDAD · archivos cifrados en reposo (C3) con integridad verificable (C4)
--  La base de datos solo ve bytes cifrados. Aun con un volcado completo, sin la
--  clave maestra (Vault en producción) no se puede leer ningún documento.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE project_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_keys  FORCE  ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files FORCE  ROW LEVEL SECURITY;

-- La KEK no se puede modificar: no hay UPDATE ni DELETE. Desaparece solo con
-- el borrado definitivo del proyecto (ON DELETE CASCADE): crypto-shredding.
GRANT SELECT, INSERT ON project_keys TO securtex_app;
CREATE POLICY project_keys_read ON project_keys FOR SELECT TO securtex_app
  USING (app_has_project_role(project_id, ARRAY['owner','editor','reviewer','viewer']::project_role[]));
CREATE POLICY project_keys_create ON project_keys FOR INSERT TO securtex_app
  WITH CHECK (app_is_project_owner(project_id));

GRANT SELECT, INSERT, DELETE ON project_files TO securtex_app;
-- project_id y created_by no figuran: un archivo no se puede «mover» a otro proyecto.
GRANT UPDATE (path, kind, size, version, wrapped_dek, nonce, ciphertext, mac, updated_by, updated_at) ON project_files TO securtex_app;

CREATE POLICY files_read ON project_files FOR SELECT TO securtex_app
  USING (app_has_project_role(project_id, ARRAY['owner','editor','reviewer','viewer']::project_role[]));
CREATE POLICY files_create ON project_files FOR INSERT TO securtex_app
  WITH CHECK (app_has_project_role(project_id, ARRAY['owner','editor']::project_role[]) AND created_by = app_current_user());
CREATE POLICY files_update ON project_files FOR UPDATE TO securtex_app
  USING      (app_has_project_role(project_id, ARRAY['owner','editor']::project_role[]))
  WITH CHECK (app_has_project_role(project_id, ARRAY['owner','editor']::project_role[]) AND updated_by = app_current_user());
CREATE POLICY files_delete ON project_files FOR DELETE TO securtex_app
  USING (app_has_project_role(project_id, ARRAY['owner','editor']::project_role[]));

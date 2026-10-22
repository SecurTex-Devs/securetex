-- ─────────────────────────────────────────────────────────────────────────────
-- S5 · Bloqueo de cuentas aplicado por PostgreSQL (RF-009, T-A01, T-A09)
--
-- Hasta ahora la API contaba los fallos y decidía el bloqueo, y su rol
-- (securtex_identity) podía leer, poner a cero o borrar los contadores. Desde
-- esta migración:
--
--  · Solo el rol securtex_lockout (NOLOGIN) toca login_throttle. La API cuenta
--    fallos y aciertos a través de funciones SECURITY DEFINER y no puede
--    quitar un bloqueo vigente ni borrar el historial que lo agrava.
--  · Un trigger en sessions impide crear una sesión para una cuenta
--    bloqueada, suspendida o borrada, se intente desde la API (contraseña,
--    segundo factor, Google, Microsoft) o con una conexión directa como
--    securtex_identity. Tampoco se puede reasignar una sesión a otra cuenta
--    ni revivir una revocada.
--  · El bloqueo se agrava: 15 min, 1 h, 6 h y 24 h para los bloqueos
--    sucesivos; el nivel vuelve a empezar tras 24 h sin bloqueos.
--
-- Fuera del alcance (documentado): el propietario de la base o un superusuario
-- puede desactivar triggers; ese rol solo lo usan las migraciones.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'securtex_lockout') THEN
    CREATE ROLE securtex_lockout NOLOGIN BYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO securtex_lockout;

-- La clave pasa a ser el índice ciego del correo (el mismo de users.email_index),
-- para que el trigger relacione el bloqueo con la cuenta. Sigue existiendo una
-- fila igual para correos sin cuenta: el bloqueo no sirve para enumerar (T-A09).
-- Los contadores anteriores usaban otra clave y son efímeros: se descartan.
DELETE FROM "login_throttle";
ALTER TABLE "login_throttle"
  ADD COLUMN "lock_level"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_locked_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "login_throttle_key_len" CHECK (octet_length("key_hash") = 16),
  ADD CONSTRAINT "login_throttle_counts"  CHECK ("failed_count" >= 0 AND "lock_level" >= 0);

REVOKE ALL ON "login_throttle" FROM securtex_identity;
DROP POLICY IF EXISTS identity_service ON "login_throttle";
GRANT SELECT, INSERT, UPDATE, DELETE ON "login_throttle" TO securtex_lockout;
GRANT SELECT ("id", "email_index", "status") ON "users" TO securtex_lockout;

-- ───────────────────────────── Política ─────────────────────────────
-- Única fuente de los umbrales: la API ya no los decide.

CREATE FUNCTION auth_lock_duration(p_level integer) RETURNS interval
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_level <= 1 THEN interval '15 minutes'
    WHEN p_level = 2  THEN interval '1 hour'
    WHEN p_level = 3  THEN interval '6 hours'
    ELSE                   interval '24 hours'
  END
$$;

-- ───────────────────────────── Funciones para la API ─────────────────────────────

/** Fin del bloqueo vigente para esa clave, o NULL. */
CREATE FUNCTION auth_login_locked_until(p_key bytea) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT "locked_until" FROM "login_throttle" WHERE "key_hash" = p_key AND "locked_until" > now()
$$;

/** Fin del bloqueo vigente de una cuenta, o NULL (para informar del plazo). */
CREATE FUNCTION auth_user_locked_until(p_user uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT lt."locked_until"
  FROM "users" u JOIN "login_throttle" lt ON lt."key_hash" = decode(u."email_index", 'hex')
  WHERE u."id" = p_user AND lt."locked_until" > now()
$$;

/**
 * Registra un fallo. Devuelve los intentos que quedan antes del bloqueo y,
 * si lo hay, hasta cuándo dura y su nivel. Con un bloqueo vigente no cuenta
 * nada más ni lo alarga.
 */
CREATE FUNCTION auth_register_login_failure(p_key bytea,
  OUT remaining integer, OUT locked_until timestamptz, OUT lock_level integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c_max_failures CONSTANT integer  := 10;                    -- RF-009
  c_window       CONSTANT interval := interval '15 minutes'; -- ventana de conteo
  c_level_decay  CONSTANT interval := interval '24 hours';   -- el nivel se olvida tras esto
  v_now timestamptz := now();
  r "login_throttle"%ROWTYPE;
BEGIN
  IF p_key IS NULL OR octet_length(p_key) <> 16 THEN
    RAISE EXCEPTION 'clave de bloqueo no válida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO "login_throttle" ("key_hash", "failed_count", "window_started_at")
  VALUES (p_key, 0, v_now) ON CONFLICT ("key_hash") DO NOTHING;
  -- FOR UPDATE: dos fallos simultáneos no pueden contarse como uno.
  SELECT * INTO r FROM "login_throttle" WHERE "key_hash" = p_key FOR UPDATE;

  IF r."locked_until" IS NOT NULL AND r."locked_until" > v_now THEN
    remaining := 0; locked_until := r."locked_until"; lock_level := r."lock_level";
    RETURN;
  END IF;

  IF r."window_started_at" < v_now - c_window THEN
    r."failed_count" := 0;
    r."window_started_at" := v_now;
  END IF;
  r."failed_count" := r."failed_count" + 1;
  r."locked_until" := NULL;

  IF r."failed_count" >= c_max_failures THEN
    r."lock_level" := CASE
      WHEN r."last_locked_at" IS NULL OR r."last_locked_at" < v_now - c_level_decay THEN 1
      ELSE r."lock_level" + 1 END;
    r."locked_until" := v_now + auth_lock_duration(r."lock_level");
    r."last_locked_at" := v_now;
    r."failed_count" := 0;
    r."window_started_at" := v_now;
  END IF;

  UPDATE "login_throttle" SET
    "failed_count" = r."failed_count", "window_started_at" = r."window_started_at",
    "locked_until" = r."locked_until", "lock_level" = r."lock_level", "last_locked_at" = r."last_locked_at"
  WHERE "key_hash" = p_key;

  remaining := CASE WHEN r."locked_until" IS NULL THEN c_max_failures - r."failed_count" ELSE 0 END;
  locked_until := r."locked_until";
  lock_level := r."lock_level";
END $$;

/**
 * Inicio de sesión correcto: pone a cero el contador de fallos. No quita un
 * bloqueo vigente ni borra el nivel, que es lo que agrava los siguientes.
 */
CREATE FUNCTION auth_register_login_success(p_key bytea) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE "login_throttle" SET "failed_count" = 0, "window_started_at" = now()
  WHERE "key_hash" = p_key AND ("locked_until" IS NULL OR "locked_until" <= now())
$$;

/**
 * Desbloqueo manual por un operador. No se concede a ningún rol de la API:
 * solo puede ejecutarlo el propietario de la base.
 */
CREATE FUNCTION auth_unlock_account(p_user uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH done AS (
    UPDATE "login_throttle" lt SET "locked_until" = NULL, "failed_count" = 0, "lock_level" = 0
    FROM "users" u
    WHERE u."id" = p_user AND lt."key_hash" = decode(u."email_index", 'hex')
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM done)
$$;

-- ───────────────────────────── Guardia de sesiones ─────────────────────────────

CREATE FUNCTION auth_guard_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_status "user_status";
  v_until  timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Una sesión nunca cambia de dueño ni vuelve a la vida.
    IF NEW."user_id" IS DISTINCT FROM OLD."user_id" THEN
      RAISE EXCEPTION 'session_immutable' USING ERRCODE = 'SX409', DETAIL = 'user_id';
    END IF;
    IF OLD."revoked_at" IS NOT NULL AND NEW."revoked_at" IS DISTINCT FROM OLD."revoked_at" THEN
      RAISE EXCEPTION 'session_immutable' USING ERRCODE = 'SX409', DETAIL = 'revoked_at';
    END IF;
    RETURN NEW;
  END IF;

  SELECT u."status", lt."locked_until" INTO v_status, v_until
  FROM "users" u
  LEFT JOIN "login_throttle" lt ON lt."key_hash" = decode(u."email_index", 'hex')
  WHERE u."id" = NEW."user_id";

  IF NOT FOUND OR v_status IN ('suspended', 'deleted') THEN
    RAISE EXCEPTION 'account_unavailable' USING ERRCODE = 'SX403';
  END IF;
  IF v_until IS NOT NULL AND v_until > now() THEN
    RAISE EXCEPTION 'account_locked' USING ERRCODE = 'SX429';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "sessions_account_guard"
  BEFORE INSERT OR UPDATE OF "user_id", "revoked_at" ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION auth_guard_session();

-- ───────────────────────────── Propiedad y permisos ─────────────────────────────

ALTER FUNCTION auth_login_locked_until(bytea)       OWNER TO securtex_lockout;
ALTER FUNCTION auth_user_locked_until(uuid)         OWNER TO securtex_lockout;
ALTER FUNCTION auth_register_login_failure(bytea)   OWNER TO securtex_lockout;
ALTER FUNCTION auth_register_login_success(bytea)   OWNER TO securtex_lockout;
ALTER FUNCTION auth_unlock_account(uuid)            OWNER TO securtex_lockout;
ALTER FUNCTION auth_guard_session()                 OWNER TO securtex_lockout;

REVOKE ALL ON FUNCTION auth_login_locked_until(bytea), auth_user_locked_until(uuid),
  auth_register_login_failure(bytea), auth_register_login_success(bytea),
  auth_unlock_account(uuid), auth_guard_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_login_locked_until(bytea), auth_user_locked_until(uuid),
  auth_register_login_failure(bytea), auth_register_login_success(bytea) TO securtex_identity;

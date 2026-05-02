-- 1. Eliminamos la constraint única y el índice del email antes de borrar la columna
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS idx_users_email;

-- 2. El email vive en Clerk, no lo necesitamos en local
ALTER TABLE users DROP COLUMN IF EXISTS email;

-- 3. Limpieza de filas legacy pre-Clerk: cualquier usuario sin clerk_user_id es de la era
--    JWT propia (V1-V2) y ya no puede autenticarse contra Clerk. Borrarlas también
--    elimina sus informes vía ON DELETE CASCADE en reports.user_id.
DELETE FROM users WHERE clerk_user_id IS NULL;

-- 4. clerk_user_id es la identidad real: obligatorio y único
ALTER TABLE users ALTER COLUMN clerk_user_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_users_clerk_user_id
    ON users(clerk_user_id);

-- 1. El email deja de ser obligatorio
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 2. Eliminamos la constraint única del email
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- 3. (opcional pero recomendable) eliminamos índice redundante
DROP INDEX IF EXISTS idx_users_email;

-- 4. Nos aseguramos de que clerk_user_id es obligatorio
ALTER TABLE users ALTER COLUMN clerk_user_id SET NOT NULL;

-- 5. La unicidad REAL
-- (ya la tienes, pero lo dejamos claro)
CREATE UNIQUE INDEX IF NOT EXISTS uk_users_clerk_user_id
    ON users(clerk_user_id);
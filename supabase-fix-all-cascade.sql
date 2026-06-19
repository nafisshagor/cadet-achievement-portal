-- ============================================================
-- FIX: Add ON DELETE CASCADE to ALL foreign keys → auth.users
--
-- This fixes "Database error deleting user" when deleting from
-- the Supabase Auth dashboard. Run in: SQL Editor → New query
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Loop over every FK in the public schema that points at auth.users
  FOR r IN
    SELECT
      tc.table_name,
      kcu.column_name,
      tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.key_column_usage AS ccu
      ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.constraint_type  = 'FOREIGN KEY'
      AND tc.table_schema     = 'public'
      AND ccu.table_schema    = 'auth'
      AND ccu.table_name      = 'users'
      AND rc.delete_rule     != 'CASCADE'   -- only fix ones that aren't already CASCADE
  LOOP
    RAISE NOTICE 'Fixing: %.% → constraint %',
      r.table_name, r.column_name, r.constraint_name;

    -- Drop the old constraint
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I',
      r.table_name, r.constraint_name
    );

    -- Re-add with ON DELETE CASCADE
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE CASCADE',
      r.table_name, r.constraint_name, r.column_name
    );
  END LOOP;

  RAISE NOTICE 'Done. All auth.users foreign keys now have ON DELETE CASCADE.';
END;
$$;

-- ── Verify: all delete_rule values should now be "CASCADE" ───────────────────
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.key_column_usage AS ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema    = 'public'
  AND ccu.table_schema   = 'auth'
  AND ccu.table_name     = 'users'
ORDER BY tc.table_name;

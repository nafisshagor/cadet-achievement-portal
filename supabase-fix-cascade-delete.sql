-- ============================================================
-- FIX: Allow deleting auth users from the Supabase dashboard
--
-- Problem:
--   "Database error deleting user" when deleting from Auth dashboard.
--   Cause: staff_profiles.id has a FOREIGN KEY → auth.users(id) with
--   no ON DELETE action (defaults to RESTRICT), so Postgres refuses to
--   delete the auth user while a referencing row exists in staff_profiles.
--
-- Fix:
--   Re-create the foreign key with ON DELETE CASCADE so that when an
--   auth user is deleted (from the dashboard or via admin API), their
--   staff_profiles row is automatically deleted too.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Step 1: Find and drop the existing FK constraint.
-- The constraint name is usually "staff_profiles_id_fkey" but may differ.
-- This DO block handles both the common name and any variation.
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.staff_profiles'::regclass
    AND contype = 'f'
    AND confrelid = 'auth.users'::regclass
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.staff_profiles DROP CONSTRAINT %I', v_constraint);
    RAISE NOTICE 'Dropped constraint: %', v_constraint;
  ELSE
    RAISE NOTICE 'No FK constraint found — adding fresh one.';
  END IF;
END;
$$;

-- Step 2: Re-add the FK with ON DELETE CASCADE.
-- Now deleting an auth user automatically deletes their staff_profiles row.
ALTER TABLE public.staff_profiles
  ADD CONSTRAINT staff_profiles_id_fkey
  FOREIGN KEY (id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Run this to confirm the constraint is in place:
-- SELECT conname, confdeltype
-- FROM pg_constraint
-- WHERE conrelid = 'public.staff_profiles'::regclass
--   AND contype = 'f';
-- confdeltype = 'c' means CASCADE. ✓

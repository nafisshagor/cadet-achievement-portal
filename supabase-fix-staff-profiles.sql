-- ============================================================
-- FIX: staff_profiles RLS policies
--
-- Problems fixed:
--   1. Staff registration failed with "new row violates row-level
--      security policy for table staff_profiles" for College Admin,
--      Vice Principal, Principal, and System Admin roles.
--      Root cause: the INSERT policy only allowed the inserting user's
--      own row when the session was the new user's, but after session
--      restore the admin's uid didn't match. We now allow a user to
--      insert their OWN row (id = auth.uid()), and admins to insert
--      any row within their scope.
--
--   2. Staff deletion silently failed (UI showed success but DB row
--      remained). The DELETE policy was missing or too restrictive.
--      College Admins can now delete rows within their own college.
--      System Admins can delete any row.
--
--   3. College admins were able to query staff data from other colleges
--      via the SELECT policy gap. Now enforced server-side too.
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================

-- ── Helper functions (SECURITY DEFINER avoids RLS recursion) ─────────────────
-- These may already exist from earlier fixes; CREATE OR REPLACE is safe.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.staff_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_college()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT college FROM public.staff_profiles WHERE id = auth.uid();
$$;

-- ── Enable RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- ── Drop all existing policies to start fresh ────────────────────────────────
DROP POLICY IF EXISTS "Staff can read own profile"          ON public.staff_profiles;
DROP POLICY IF EXISTS "Staff can read profiles"             ON public.staff_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles"        ON public.staff_profiles;
DROP POLICY IF EXISTS "Admins can read college profiles"    ON public.staff_profiles;
DROP POLICY IF EXISTS "System admins can read all"          ON public.staff_profiles;
DROP POLICY IF EXISTS "Users can insert own profile"        ON public.staff_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles"          ON public.staff_profiles;
DROP POLICY IF EXISTS "Staff can update own profile"        ON public.staff_profiles;
DROP POLICY IF EXISTS "Admins can update profiles"          ON public.staff_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles"          ON public.staff_profiles;
DROP POLICY IF EXISTS "Staff can delete own profile"        ON public.staff_profiles;
DROP POLICY IF EXISTS "Allow own profile insert"            ON public.staff_profiles;
DROP POLICY IF EXISTS "Allow admin insert"                  ON public.staff_profiles;
DROP POLICY IF EXISTS "Allow own profile read"              ON public.staff_profiles;
DROP POLICY IF EXISTS "Allow scoped read"                   ON public.staff_profiles;
DROP POLICY IF EXISTS "Allow own profile update"            ON public.staff_profiles;
DROP POLICY IF EXISTS "Allow scoped update"                 ON public.staff_profiles;
DROP POLICY IF EXISTS "Allow scoped delete"                 ON public.staff_profiles;

-- ── SELECT policies ───────────────────────────────────────────────────────────

-- Every authenticated user can read their own profile (needed for login flow)
CREATE POLICY "Allow own profile read"
  ON public.staff_profiles FOR SELECT
  USING (id = auth.uid());

-- System admins can read ALL profiles across colleges
-- College admins, vice principals, and principals can read profiles in their college
CREATE POLICY "Allow scoped read"
  ON public.staff_profiles FOR SELECT
  USING (
    public.current_user_role() = 'system_admin'
    OR college = public.current_user_college()
  );

-- ── INSERT policies ───────────────────────────────────────────────────────────

-- A new user can insert their own profile row (id must equal auth.uid()).
-- This is the critical policy that allows registration to work:
-- during signUp the client is signed in as the new user, so auth.uid() == new user id.
CREATE POLICY "Allow own profile insert"
  ON public.staff_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- System admins can insert any profile (cross-college management)
CREATE POLICY "Allow admin insert"
  ON public.staff_profiles FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'system_admin'
    OR (
      public.current_user_role() = 'admin'
      AND college = public.current_user_college()
    )
  );

-- ── UPDATE policies ───────────────────────────────────────────────────────────

-- Every user can update their own profile (name, password hash is separate)
CREATE POLICY "Allow own profile update"
  ON public.staff_profiles FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- System admins and college admins can update profiles in their scope
CREATE POLICY "Allow scoped update"
  ON public.staff_profiles FOR UPDATE
  USING (
    public.current_user_role() = 'system_admin'
    OR (
      public.current_user_role() = 'admin'
      AND college = public.current_user_college()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'system_admin'
    OR (
      public.current_user_role() = 'admin'
      AND college = public.current_user_college()
    )
  );

-- ── DELETE policies ───────────────────────────────────────────────────────────

-- System admins can delete any profile.
-- College admins can delete profiles within their own college only.
-- NOTE: No user can delete their own profile (prevents self-deletion accidents).
CREATE POLICY "Allow scoped delete"
  ON public.staff_profiles FOR DELETE
  USING (
    -- System admin can delete any row except their own
    (public.current_user_role() = 'system_admin' AND id != auth.uid())
    OR
    -- College admin can delete rows in their college, but not their own
    (
      public.current_user_role() = 'admin'
      AND college = public.current_user_college()
      AND id != auth.uid()
    )
  );

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Run this to confirm policies are set:
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'staff_profiles'
-- ORDER BY cmd, policyname;

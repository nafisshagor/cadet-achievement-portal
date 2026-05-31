-- ============================================================
-- FIX: Form Master Assignment visibility
-- Form masters couldn't see their assigned intakes because
-- RLS on form_master_assignments blocked them from reading
-- their own assignment rows.
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Drop existing policies to start clean
DROP POLICY IF EXISTS "Staff can read assignments" ON public.form_master_assignments;
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.form_master_assignments;
DROP POLICY IF EXISTS "System admins can read all assignments" ON public.form_master_assignments;
DROP POLICY IF EXISTS "System admins can manage all assignments" ON public.form_master_assignments;
DROP POLICY IF EXISTS "Form masters can read own assignments" ON public.form_master_assignments;

-- 2. Make sure RLS is enabled
ALTER TABLE public.form_master_assignments ENABLE ROW LEVEL SECURITY;

-- 3. Helper functions (SECURITY DEFINER bypasses RLS to avoid recursion)
--    These may already exist from the earlier login fix; CREATE OR REPLACE is safe.
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

-- 4. CRITICAL: Form masters can read THEIR OWN assignment rows
CREATE POLICY "Form masters can read own assignments"
  ON public.form_master_assignments FOR SELECT
  USING (staff_user_id = auth.uid());

-- 5. Admins / system admins can read assignments in their scope
CREATE POLICY "Admins can read assignments"
  ON public.form_master_assignments FOR SELECT
  USING (
    public.current_user_role() = 'system_admin'
    OR (
      public.current_user_role() = 'admin'
      AND college = public.current_user_college()
    )
  );

-- 6. Admins / system admins can insert/update/delete assignments
CREATE POLICY "Admins can manage assignments"
  ON public.form_master_assignments FOR ALL
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

-- 7. Verify
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'form_master_assignments';

-- ── Run this if cadet_remarks table already exists ───────────────────────────
-- Drops old policies and recreates with new roles, adds house column

-- Add house column to staff_profiles (safe to re-run)
alter table public.staff_profiles
  add column if not exists house text;

-- Drop old policies
drop policy if exists "read own college remarks"  on public.cadet_remarks;
drop policy if exists "insert own remark"         on public.cadet_remarks;
drop policy if exists "update own remark"         on public.cadet_remarks;
drop policy if exists "delete own remark"         on public.cadet_remarks;

-- Recreate with new roles included

create policy "read own college remarks"
  on public.cadet_remarks for select
  using (
    exists (
      select 1 from public.cadets c
      join public.staff_profiles sp on sp.id = auth.uid()
      where c.id = cadet_remarks.cadet_id
        and (sp.role = 'system_admin' or c.college = sp.college)
    )
  );

create policy "insert own remark"
  on public.cadet_remarks for insert
  with check (
    staff_id = auth.uid()
    and exists (
      select 1 from public.cadets c
      join public.staff_profiles sp on sp.id = auth.uid()
      where c.id = cadet_remarks.cadet_id
        and c.college = sp.college
        and (
          sp.role in ('vice_principal','principal','adjutant','medical_officer')
          or (
            sp.role = 'form_master'
            and exists (
              select 1 from public.form_master_assignments fma
              where fma.staff_user_id = auth.uid()
                and fma.college = c.college
                and fma.intake  = c.intake
                and fma.form    = c.form
            )
          )
          or (
            sp.role = 'house_master'
            and lower(c.house) = lower(coalesce(sp.house, ''))
          )
        )
    )
  );

create policy "update own remark"
  on public.cadet_remarks for update
  using (staff_id = auth.uid());

create policy "delete own remark"
  on public.cadet_remarks for delete
  using (staff_id = auth.uid());

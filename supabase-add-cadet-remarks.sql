-- ── Run this in Supabase SQL Editor ──────────────────────────────────────────

-- 1. Fix role check constraint to include new roles
alter table public.staff_profiles
  drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role in (
    'system_admin','admin','form_master','vice_principal','principal',
    'house_master','adjutant','medical_officer'
  ));

-- 2. Add house column (safe to re-run)
alter table public.staff_profiles
  add column if not exists house text;

-- 3. Create cadet_remarks table (safe to re-run)
create table if not exists public.cadet_remarks (
  id         uuid primary key default gen_random_uuid(),
  cadet_id   bigint not null references public.cadets(id) on delete cascade,
  staff_id   uuid   not null references public.staff_profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cadet_id, staff_id)
);
create index if not exists idx_cadet_remarks_cadet on public.cadet_remarks(cadet_id);
create index if not exists idx_cadet_remarks_staff on public.cadet_remarks(staff_id);
alter table public.cadet_remarks enable row level security;

-- 4. Drop and recreate RLS policies
drop policy if exists "read own college remarks"  on public.cadet_remarks;
drop policy if exists "insert own remark"         on public.cadet_remarks;
drop policy if exists "update own remark"         on public.cadet_remarks;
drop policy if exists "delete own remark"         on public.cadet_remarks;

create policy "read own college remarks" on public.cadet_remarks for select
  using (
    exists (
      select 1 from public.cadets c
      join public.staff_profiles sp on sp.id = auth.uid()
      where c.id = cadet_remarks.cadet_id
        and (sp.role = 'system_admin' or c.college = sp.college)
    )
  );

create policy "insert own remark" on public.cadet_remarks for insert
  with check (
    staff_id = auth.uid()
    and exists (
      select 1 from public.cadets c
      join public.staff_profiles sp on sp.id = auth.uid()
      where c.id = cadet_remarks.cadet_id and c.college = sp.college
        and (
          sp.role in ('vice_principal','principal','adjutant','medical_officer')
          or (sp.role = 'form_master' and exists (
            select 1 from public.form_master_assignments fma
            where fma.staff_user_id = auth.uid()
              and fma.college = c.college and fma.intake = c.intake and fma.form = c.form
          ))
          or (sp.role = 'house_master' and lower(c.house) = lower(coalesce(sp.house,'')))
        )
    )
  );

create policy "update own remark" on public.cadet_remarks for update
  using (staff_id = auth.uid());

create policy "delete own remark" on public.cadet_remarks for delete
  using (staff_id = auth.uid());

-- ── Fix storage: allow VP, Principal, Adjutant, Medical Officer to upload photos ──
-- Run this in Supabase Dashboard → Storage → cadet-photos → Policies
-- OR paste into SQL editor:

-- Drop existing insert policy on the bucket (if named)
drop policy if exists "Allow form masters to upload cadet photos" on storage.objects;
drop policy if exists "form_master upload" on storage.objects;
drop policy if exists "authenticated upload" on storage.objects;

-- New policy: allow all staff who can view cadets to upload photos
create policy "staff can upload cadet photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cadet-photos'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.role in (
          'form_master','vice_principal','principal',
          'adjutant','medical_officer','admin','system_admin'
        )
    )
  );

-- Allow same roles to update (upsert)
drop policy if exists "staff can update cadet photos" on storage.objects;
create policy "staff can update cadet photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'cadet-photos'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
        and sp.role in (
          'form_master','vice_principal','principal',
          'adjutant','medical_officer','admin','system_admin'
        )
    )
  );

-- ── Staff profile photos ──────────────────────────────────────────────────────

-- 1. Add photo_url to staff_profiles
alter table public.staff_profiles
  add column if not exists photo_url text;

-- 2. Create the staff-photos storage bucket (run in Supabase Dashboard > Storage
--    OR use the SQL below — note: bucket creation via SQL requires pg_net or
--    use the Dashboard UI to create a PUBLIC bucket named "staff-photos")
--
--    In Dashboard: Storage → New Bucket → name: staff-photos → Public: ON
--
-- 3. Storage RLS for staff-photos bucket
drop policy if exists "staff can upload own photo"   on storage.objects;
drop policy if exists "staff can update own photo"   on storage.objects;
drop policy if exists "staff photos are public"      on storage.objects;

create policy "staff photos are public"
  on storage.objects for select
  to public
  using (bucket_id = 'staff-photos');

create policy "staff can upload own photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'staff-photos'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
    )
  );

create policy "staff can update own photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'staff-photos'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.id = auth.uid()
    )
  );

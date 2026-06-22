-- ── cadet_remarks table ──────────────────────────────────────────────────────
create table if not exists public.cadet_remarks (
  id          uuid primary key default gen_random_uuid(),
  cadet_id    bigint not null references public.cadets(id) on delete cascade,
  staff_id    uuid not null references public.staff_profiles(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cadet_id, staff_id)
);

create index if not exists idx_cadet_remarks_cadet  on public.cadet_remarks(cadet_id);
create index if not exists idx_cadet_remarks_staff  on public.cadet_remarks(staff_id);

alter table public.cadet_remarks enable row level security;

-- Read: any authenticated staff in the same college (or system admin)
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

-- Insert: form_master (own form), vice_principal, principal,
--         house_master (own house), adjutant, medical_officer (whole college)
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

-- ── Add house column to staff_profiles (for House Master) ─────────────────────
alter table public.staff_profiles
  add column if not exists house text;

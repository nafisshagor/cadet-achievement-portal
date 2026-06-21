-- ── cadet_remarks table ──────────────────────────────────────────────────────
-- One remark row per staff member per cadet.
-- Role-gating (who can write what) is enforced in application code + RLS.

create table if not exists public.cadet_remarks (
  id          uuid primary key default gen_random_uuid(),
  cadet_id    uuid not null references public.cadets(id) on delete cascade,
  staff_id    uuid not null references public.staff_profiles(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cadet_id, staff_id)   -- one remark per staff per cadet
);

-- Indexes
create index if not exists idx_cadet_remarks_cadet  on public.cadet_remarks(cadet_id);
create index if not exists idx_cadet_remarks_staff  on public.cadet_remarks(staff_id);

-- RLS
alter table public.cadet_remarks enable row level security;

-- Anyone authenticated can read remarks for cadets in their college
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

-- Form masters can only write remarks for cadets in their assigned form
-- Vice principals and Principals can write for any cadet in their college
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
          sp.role in ('vice_principal', 'principal')
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
        )
    )
  );

create policy "update own remark"
  on public.cadet_remarks for update
  using (staff_id = auth.uid());

create policy "delete own remark"
  on public.cadet_remarks for delete
  using (staff_id = auth.uid());

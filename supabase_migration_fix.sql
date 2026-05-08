-- ============================================================
-- AMORE GESTÃO — Migration Fix
-- Corrects infinite recursion in profiles RLS policies
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor)
-- ============================================================

-- ── 1. Drop broken policies ─────────────────────────────────

drop policy if exists "profiles_self_read" on profiles;
drop policy if exists "profiles_admin_all" on profiles;
drop policy if exists "audit_admin_read" on audit_logs;

-- ── 2. Security-definer helper (avoids recursion) ───────────
-- This function runs with elevated privileges so it can query
-- profiles without triggering the RLS policy on itself.

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('super_admin', 'admin')
  )
$$;

-- ── 3. New profiles policies (no recursion) ─────────────────

-- Any authenticated user can read any profile (needed for user lists in UI)
create policy "profiles_select"
  on profiles for select
  using (auth.uid() is not null);

-- Users can create only their own profile (auto-created on first login)
create policy "profiles_insert"
  on profiles for insert
  with check (auth.uid() = id);

-- Users can update their own profile; admins can update any
create policy "profiles_update"
  on profiles for update
  using (auth.uid() = id or is_admin());

-- Only admins can delete profiles
create policy "profiles_delete"
  on profiles for delete
  using (is_admin());

-- ── 4. Fix audit_logs policy (same recursion issue) ─────────

create policy "audit_admin_read"
  on audit_logs for select
  using (is_admin());

-- ── 5. Ensure tenant_settings has a default row ─────────────

insert into tenant_settings (slug, company_name)
values ('default', 'Amore Gestão')
on conflict (slug) do nothing;

-- ── Done ─────────────────────────────────────────────────────
-- After running this, create your first admin user:
--
-- Option A — Supabase Dashboard:
--   1. Go to Authentication > Users > "Invite user" or "Add user"
--   2. Create user with email admin@amore.com.br and a password
--   3. Copy the new user's UUID from the Users table
--   4. Run in SQL editor:
--        insert into profiles (id, email, name, role, loja, status, avatar_color, initials)
--        values ('<UUID_HERE>', 'admin@amore.com.br', 'Rodrigo Admin',
--                'super_admin', 'Todas', 'active', '#6B1212', 'RA');
--
-- Option B — SQL only (sets a bcrypt password hash):
--   Use the Supabase Dashboard > Authentication > Users > "Add user" button.
--   That is the safest approach for creating the first admin.
-- ============================================================

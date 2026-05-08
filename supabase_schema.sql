-- ============================================================
-- AMORE GESTÃO — Supabase Schema
-- Run this in the Supabase SQL editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── TENANT SETTINGS (White Label) ──────────────────────────
create table if not exists tenant_settings (
  id            uuid primary key default uuid_generate_v4(),
  slug          text unique not null default 'default',
  company_name  text not null default 'Amore Gestão',
  logo_url      text,
  favicon_url   text,
  primary_color text not null default '#6B1212',
  primary_dark  text not null default '#4A0C0C',
  primary_light text not null default '#8B1A1A',
  sidebar_color text not null default '#1A0505',
  accent_color  text not null default '#6B1212',
  font_heading  text not null default 'Plus Jakarta Sans',
  font_body     text not null default 'Inter',
  stores        text[] not null default '{"Amore CD","Amore Paiva","Flow CD"}',
  plan          text not null default 'pro' check (plan in ('starter','pro','enterprise')),
  support_email text,
  support_whatsapp text,
  footer_text   text,
  custom_domain text,
  features      jsonb not null default '{"dashboard":true,"pendencias":true,"gamificacao":true,"marketing":true,"vendas":true,"compras":true,"financeiro":true,"cozinha":true,"salao":true}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Upsert default tenant
insert into tenant_settings (slug, company_name) values ('default','Amore Gestão')
on conflict (slug) do nothing;

-- ── ROLES ──────────────────────────────────────────────────
create table if not exists role_definitions (
  id          uuid primary key default uuid_generate_v4(),
  name        text unique not null,
  label       text not null,
  description text not null default '',
  permissions jsonb not null default '{}',
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Default roles
insert into role_definitions (name, label, description, permissions, is_system) values
('super_admin', 'Super Admin', 'Acesso total ao sistema, incluindo configurações white label',
 '{"dashboard":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"pendencias":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"gamificacao":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"marketing":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"vendas":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"compras":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"financeiro":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"cozinha":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"salao":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"usuarios":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"configuracoes":{"view":true,"create":true,"edit":true,"delete":true,"export":true}}',
 true),
('admin', 'Administrador', 'Acesso completo exceto configurações white label',
 '{"dashboard":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"pendencias":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"gamificacao":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"marketing":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"vendas":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"compras":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"financeiro":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"cozinha":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"salao":{"view":true,"create":true,"edit":true,"delete":true,"export":true},"usuarios":{"view":true,"create":true,"edit":true,"delete":false,"export":true},"configuracoes":{"view":false,"create":false,"edit":false,"delete":false,"export":false}}',
 true),
('manager', 'Gerente', 'Gerencia módulos operacionais de uma loja',
 '{"dashboard":{"view":true,"create":false,"edit":false,"delete":false,"export":true},"pendencias":{"view":true,"create":true,"edit":true,"delete":false,"export":false},"gamificacao":{"view":true,"create":true,"edit":true,"delete":false,"export":false},"marketing":{"view":true,"create":true,"edit":true,"delete":false,"export":false},"vendas":{"view":true,"create":true,"edit":true,"delete":false,"export":true},"compras":{"view":true,"create":true,"edit":true,"delete":false,"export":false},"financeiro":{"view":true,"create":false,"edit":false,"delete":false,"export":true},"cozinha":{"view":true,"create":true,"edit":true,"delete":false,"export":false},"salao":{"view":true,"create":true,"edit":true,"delete":false,"export":false},"usuarios":{"view":false,"create":false,"edit":false,"delete":false,"export":false},"configuracoes":{"view":false,"create":false,"edit":false,"delete":false,"export":false}}',
 true),
('user', 'Colaborador', 'Acesso básico a módulos operacionais',
 '{"dashboard":{"view":true,"create":false,"edit":false,"delete":false,"export":false},"pendencias":{"view":true,"create":false,"edit":false,"delete":false,"export":false},"gamificacao":{"view":true,"create":false,"edit":false,"delete":false,"export":false},"vendas":{"view":true,"create":true,"edit":false,"delete":false,"export":false},"cozinha":{"view":true,"create":true,"edit":false,"delete":false,"export":false},"salao":{"view":true,"create":true,"edit":false,"delete":false,"export":false}}',
 true),
('viewer', 'Visualizador', 'Acesso somente leitura',
 '{"dashboard":{"view":true,"create":false,"edit":false,"delete":false,"export":false},"pendencias":{"view":true,"create":false,"edit":false,"delete":false,"export":false},"gamificacao":{"view":true,"create":false,"edit":false,"delete":false,"export":false},"financeiro":{"view":true,"create":false,"edit":false,"delete":false,"export":false}}',
 true)
on conflict (name) do nothing;

-- ── PROFILES ───────────────────────────────────────────────
create table if not exists profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text unique not null,
  name                text not null,
  role                text not null default 'user' references role_definitions(name),
  loja                text,
  status              text not null default 'active' check (status in ('active','inactive','pending')),
  avatar_color        text not null default '#6B1212',
  initials            text not null default 'US',
  permissions_override jsonb,
  created_at          timestamptz not null default now(),
  last_login          timestamptz,
  created_by          uuid references profiles(id)
);

-- Security-definer helper to check admin role without RLS recursion
create or replace function is_admin()
returns boolean
language sql security definer stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin'))
$$;

-- RLS
alter table profiles enable row level security;
create policy "profiles_select" on profiles for select using (auth.uid() is not null);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id or is_admin());
create policy "profiles_delete" on profiles for delete using (is_admin());

-- ── AUDIT LOGS ─────────────────────────────────────────────
create table if not exists audit_logs (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references profiles(id),
  user_name  text not null,
  action     text not null,
  module     text not null,
  entity_id  text,
  detail     text not null default '',
  ip         text,
  created_at timestamptz not null default now()
);

alter table audit_logs enable row level security;
create policy "audit_admin_read" on audit_logs for select using (is_admin());
create policy "audit_insert_all" on audit_logs for insert with check (auth.uid() is not null);

-- ── PENDENCIAS ─────────────────────────────────────────────
create table if not exists pendencias (
  id           uuid primary key default uuid_generate_v4(),
  title        text not null,
  description  text,
  loja         text not null,
  priority     text not null default 'media' check (priority in ('alta','media','baixa')),
  status       text not null default 'pendente' check (status in ('pendente','em_andamento','concluido')),
  responsible  text,
  cost         numeric(10,2),
  created_by   text not null,
  updated_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table pendencias enable row level security;
create policy "pendencias_auth_read" on pendencias for select using (auth.uid() is not null);
create policy "pendencias_auth_write" on pendencias for all using (auth.uid() is not null);

-- ── COLABORADORES ──────────────────────────────────────────
create table if not exists colaboradores (
  id         uuid primary key default uuid_generate_v4(),
  nome       text not null,
  func       text not null default 'Colaborador',
  setor      text not null default 'salao' check (setor in ('salao','cozinha','balcao')),
  loja       text not null,
  cor        text not null default '#6B1212',
  meta_fat   numeric default 25000,
  meta_tick  numeric default 45,
  meta_aval  numeric default 4.5,
  meta_tempo numeric default 15,
  fat        numeric default 0,
  tick       numeric default 0,
  aval       numeric default 0,
  tempo      numeric default 0,
  erros      numeric default 0,
  pres       integer default 0,
  obs        text default '',
  created_at timestamptz not null default now()
);

alter table colaboradores enable row level security;
create policy "colabs_auth_read" on colaboradores for select using (auth.uid() is not null);
create policy "colabs_auth_write" on colaboradores for all using (auth.uid() is not null);

-- ── FUNCTION: update updated_at ────────────────────────────
create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger set_pendencias_updated_at
  before update on pendencias
  for each row execute procedure handle_updated_at();

create trigger set_tenant_updated_at
  before update on tenant_settings
  for each row execute procedure handle_updated_at();

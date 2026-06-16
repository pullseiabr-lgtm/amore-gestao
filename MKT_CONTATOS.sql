-- ═══════════════════════════════════════════════════════════════════
-- MÓDULO DE DISPAROS — FASE 1: Contatos + Consentimento (LGPD)
-- Rode no SQL Editor do Supabase (projeto Amore: xdwnsqkzgopymufsuccr)
-- ═══════════════════════════════════════════════════════════════════
create table if not exists mkt_contatos (
  id                 uuid primary key default gen_random_uuid(),
  loja               text,
  nome               text not null,
  telefone           text not null unique,
  email              text,
  origem             text,          -- qr_code, wifi, delivery, site, instagram, presencial, manual, importacao
  consentimento      boolean default true,
  data_optin         timestamptz default now(),
  data_optout        timestamptz,
  status             text default 'ativo' check (status in ('ativo','cancelado','bloqueado')),
  -- segmentação (Fase 3)
  aniversario        date,
  ultima_compra      date,
  ticket_medio       numeric default 0,
  total_pedidos      integer default 0,
  categoria_favorita text,
  tags               text[] default '{}',
  observacoes        text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists idx_mkt_contatos_status on mkt_contatos(status);
create index if not exists idx_mkt_contatos_loja   on mkt_contatos(loja);
create index if not exists idx_mkt_contatos_aniv   on mkt_contatos(aniversario);

alter table mkt_contatos enable row level security;
drop policy if exists "all_mkt_contatos" on mkt_contatos;
create policy "all_mkt_contatos" on mkt_contatos for all using (true) with check (true);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_mkt_contatos_updated on mkt_contatos;
create trigger trg_mkt_contatos_updated before update on mkt_contatos
  for each row execute function set_updated_at();

-- ✅ Pronto! A tela "Contatos & Consent." já vai funcionar.

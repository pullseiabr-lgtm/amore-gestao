-- Inteligência de Compras — Fase B: cotações vigentes e decisões do comprador
create table if not exists ic_cotacoes (
  id uuid primary key default gen_random_uuid(),
  requisicao_id uuid, requisicao_item_id uuid, loja text,
  produto_nome text not null, un_base text, fornecedor text not null,
  preco numeric not null check (preco > 0),   -- por unidade-base (kg, L, un)
  validade date, observacao text, registrado_por text,
  created_at timestamptz not null default now()
);
create index if not exists ic_cotacoes_item on ic_cotacoes(requisicao_item_id);
create table if not exists ic_compras_plano (
  id uuid primary key default gen_random_uuid(),
  requisicao_id uuid not null, requisicao_item_id uuid not null unique,
  loja text, produto_nome text, un_base text,
  fornecedor text not null, preco_negociado numeric not null check (preco_negociado > 0), qtd_base numeric,
  origem_preco text default 'negociado',      -- 'historico' | 'cotacao' | 'negociado'
  status text not null default 'decidido',    -- decidido | finalizado
  analise_ref jsonb,                          -- referência usada (último preço, menor, média) p/ auditoria
  decidido_por text, finalizado_por text, finalizado_em timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table ic_cotacoes enable row level security;
alter table ic_compras_plano enable row level security;
drop policy if exists ic_cotacoes_auth on ic_cotacoes; create policy ic_cotacoes_auth on ic_cotacoes for all to authenticated using (true) with check (true);
drop policy if exists ic_plano_auth on ic_compras_plano; create policy ic_plano_auth on ic_compras_plano for all to authenticated using (true) with check (true);

-- Plantão de Gestão — Fase 1
create table if not exists plt_escala (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  dupla text[] not null default '{}',
  lojas text[] not null default '{}',
  horario text,
  status text not null default 'agendado',
  confirmados text[] not null default '{}',
  motivo text,
  created_by text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists plt_checklist_versoes (
  id uuid primary key default gen_random_uuid(),
  versao int not null,
  ativa boolean not null default false,
  estrutura jsonb not null,
  created_by text, created_at timestamptz default now()
);
create table if not exists plt_plantoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  escala_id uuid references plt_escala(id) on delete set null,
  loja text not null,
  data date not null default current_date,
  integrantes text[] not null default '{}',
  versao_id uuid references plt_checklist_versoes(id),
  versao int,
  estrutura jsonb not null,
  status text not null default 'em_andamento',
  chegada_em timestamptz not null default now(),
  saida_em timestamptz,
  parecer text,
  conformidade numeric,
  relatorio_enviado_em timestamptz,
  created_by text, created_at timestamptz default now()
);
create index if not exists plt_plantoes_loja on plt_plantoes(loja, data);
create table if not exists plt_respostas (
  id uuid primary key default gen_random_uuid(),
  plantao_id uuid not null references plt_plantoes(id) on delete cascade,
  setor_id text not null,
  item_id text not null,
  resposta text not null,
  obs text,
  evidencias text[] not null default '{}',
  sem_evidencia text,
  updated_by text, updated_at timestamptz default now(),
  unique (plantao_id, item_id)
);
create table if not exists plt_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  plantao_id uuid references plt_plantoes(id) on delete set null,
  loja text not null,
  setor_id text, setor_nome text, item_id text, item_texto text,
  tipo text,
  descricao text not null,
  prioridade text not null default 'media',
  evidencias text[] not null default '{}',
  sem_evidencia text,
  identificado_por text, identificado_em timestamptz default now(),
  status text not null default 'identificado',
  reincidente boolean not null default false,
  rnc_id uuid, rnc_numero text,
  resp_setor text, resp_nome text, acao text, prazo timestamptz,
  exige_aprovacao boolean not null default false,
  obs_gestao text, evid_inicial text[] not null default '{}',
  encaminhado_em timestamptz, concluido_em timestamptz, concluido_por text, obs_conclusao text,
  evid_conclusao text[] not null default '{}',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists plt_oc_loja on plt_ocorrencias(loja, status);
create table if not exists plt_auditoria (
  id uuid primary key default gen_random_uuid(),
  entidade text not null, entidade_id text not null, acao text not null,
  antes jsonb, depois jsonb, usuario text, quando timestamptz default now()
);
create index if not exists plt_aud_ent on plt_auditoria(entidade, entidade_id);
alter table rnc add column if not exists plantao_id uuid;
alter table rnc add column if not exists plt_ocorrencia_id uuid;

alter table plt_escala disable row level security;
alter table plt_checklist_versoes disable row level security;
alter table plt_plantoes disable row level security;
alter table plt_respostas disable row level security;
alter table plt_ocorrencias disable row level security;
alter table plt_auditoria disable row level security;
grant all on plt_escala, plt_checklist_versoes, plt_plantoes, plt_respostas, plt_ocorrencias, plt_auditoria to anon, authenticated, service_role;

create or replace function plantao_relatorio(p_id uuid) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'plantao', to_jsonb(p),
    'respostas', coalesce((select jsonb_agg(to_jsonb(r)) from plt_respostas r where r.plantao_id = p.id), '[]'::jsonb),
    'ocorrencias', coalesce((select jsonb_agg(to_jsonb(o) order by o.numero) from plt_ocorrencias o where o.plantao_id = p.id), '[]'::jsonb)
  ) from plt_plantoes p where p.id = p_id;
$$;
grant execute on function plantao_relatorio(uuid) to anon, authenticated;

insert into plt_checklist_versoes (versao, ativa, estrutura, created_by)
select 1, true, '[
{"id":"s01","nome":"Chegada e identificação","itens":[
 {"id":"s01i1","texto":"Gestor identificado ao responsável da loja","ev":false},
 {"id":"s01i2","texto":"Gerente / responsável presente na loja","ev":false},
 {"id":"s01i3","texto":"Loja aberta no horário previsto","ev":false}]},
{"id":"s02","nome":"Frente de loja e apresentação comercial","itens":[
 {"id":"s02i1","texto":"Fachada, placas e iluminação em ordem","ev":true,"pront":"frente"},
 {"id":"s02i2","texto":"Vitrine / balcão apresentável e abastecido","ev":true,"pront":"frente"},
 {"id":"s02i3","texto":"Cardápio e comunicação visual atualizados","ev":false,"pront":"frente"}]},
{"id":"s03","nome":"Equipe e atendimento","itens":[
 {"id":"s03i1","texto":"Equipe completa conforme escala","ev":false,"pront":"equipe"},
 {"id":"s03i2","texto":"Uniforme e higiene pessoal adequados","ev":true},
 {"id":"s03i3","texto":"Atendimento cordial e ágil","ev":false}]},
{"id":"s04","nome":"Cozinha, produção e mise en place","itens":[
 {"id":"s04i1","texto":"Mise en place completa para o movimento","ev":true,"pront":"mise"},
 {"id":"s04i2","texto":"Alimentos identificados e dentro da validade","ev":true},
 {"id":"s04i3","texto":"Equipamentos funcionando","ev":false}]},
{"id":"s05","nome":"Estoque e disponibilidade × cardápio","itens":[
 {"id":"s05i1","texto":"Insumos suficientes para os pratos ativos no cardápio","ev":true,"pront":"estoque"},
 {"id":"s05i2","texto":"Itens críticos/em ruptura identificados","ev":true,"pront":"estoque"},
 {"id":"s05i3","texto":"Reposição necessária solicitada","ev":false,"pront":"estoque"}]},
{"id":"s06","nome":"Estoque de bebidas","itens":[
 {"id":"s06i1","texto":"Bebidas suficientes para o final de semana","ev":true,"pront":"bebidas"},
 {"id":"s06i2","texto":"Bebidas geladas na temperatura correta","ev":false,"pront":"bebidas"}]},
{"id":"s07","nome":"Tempo de produção e liberação dos pratos","itens":[
 {"id":"s07i1","texto":"Tempo de preparo dentro do padrão","ev":false},
 {"id":"s07i2","texto":"Pratos liberados sem acúmulo na passagem","ev":false}]},
{"id":"s08","nome":"Limpeza, organização e estrutura","itens":[
 {"id":"s08i1","texto":"Salão e banheiros limpos","ev":true,"pront":"estrutura"},
 {"id":"s08i2","texto":"Cozinha e câmaras organizadas e limpas","ev":true,"pront":"estrutura"},
 {"id":"s08i3","texto":"Estrutura física sem avarias (iluminação, ar, mobiliário)","ev":true,"pront":"estrutura"}]}
]'::jsonb, 'sistema'
where not exists (select 1 from plt_checklist_versoes);

-- Ajustes (v2): link_aberto_em, responsavel_loja, checklist v2
alter table plt_escala add column if not exists link_aberto_em timestamptz;
alter table plt_plantoes add column if not exists responsavel_loja text;

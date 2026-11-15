-- Controle de Alimentação – Ticket Amore — Fase 1
create sequence if not exists ali_ticket_seq start 1;
create sequence if not exists ali_sol_seq start 1;

create table if not exists ali_pratos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ficha_id uuid,
  custo numeric,                       -- custo padrão do prato (null = calcular pelos insumos)
  ingredientes jsonb not null default '[]',  -- [{nome, qtd, unidade}] — qtd na unidade do estoque
  adicionais jsonb not null default '[]',    -- [{nome, custo}]
  ativo boolean not null default true,
  created_by text, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists ali_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null default nextval('ali_sol_seq'),
  loja text not null,
  data_hora timestamptz not null default now(),
  nome text not null,
  tipo_solicitante text not null,
  empresa text,
  responsavel text,
  motivo text,
  prato_solicitado text,
  obs text,
  status text not null default 'aguardando',   -- aguardando | aprovada | recusada | cancelada | concluida
  solicitado_por text,
  decidido_por text, decidido_em timestamptz, motivo_recusa text,
  cancelado_por text, cancelado_em timestamptz, justificativa_cancel text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists ali_sol_loja on ali_solicitacoes(loja, data_hora desc);
create index if not exists ali_sol_status on ali_solicitacoes(status);

create table if not exists ali_tickets (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null,
  codigo text not null unique,
  solicitacao_id uuid not null references ali_solicitacoes(id) on delete cascade,
  loja text not null,
  prato_id uuid, prato_nome text not null,
  qtd numeric not null default 1,
  adicionais jsonb not null default '[]',
  ingredientes jsonb not null default '[]',    -- snapshot da ficha no momento da aprovação
  custo_unit numeric not null default 0,
  custo_total numeric not null default 0,
  obs_cozinha text,
  autorizado_por text not null,
  emitido_em timestamptz not null default now(),
  status text not null default 'emitido',      -- emitido | entregue | cancelado
  impresso_em timestamptz, impressoes int not null default 0, impresso_por text,
  entregue_em timestamptz, entregue_por text,
  cancelado_em timestamptz, cancelado_por text, justificativa_cancel text
);
create index if not exists ali_tk_loja on ali_tickets(loja, status);

create table if not exists ali_consumos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references ali_tickets(id) on delete cascade,
  solicitacao_id uuid,
  loja text not null,
  prato_id uuid, prato_nome text, qtd numeric,
  custo_total numeric not null default 0,
  categoria text not null default 'alimentação autorizada',
  itens jsonb not null default '[]',           -- insumos baixados [{nome, qtd, unidade, baixado, saldo_antes, saldo_depois}]
  registrado_por text, created_at timestamptz default now()
);

create table if not exists ali_auditoria (
  id uuid primary key default gen_random_uuid(),
  ref_tipo text not null, ref_id uuid not null,
  acao text not null,
  antes jsonb, depois jsonb, detalhe text,
  por text, em timestamptz default now()
);
create index if not exists ali_aud_ref on ali_auditoria(ref_id, em);

alter table ali_pratos disable row level security;
alter table ali_solicitacoes disable row level security;
alter table ali_tickets disable row level security;
alter table ali_consumos disable row level security;
alter table ali_auditoria disable row level security;
grant all on ali_pratos, ali_solicitacoes, ali_tickets, ali_consumos, ali_auditoria to anon, authenticated, service_role;
grant usage, select on sequence ali_ticket_seq, ali_sol_seq to anon, authenticated, service_role;

create or replace function ali_aud(p_tipo text, p_ref uuid, p_acao text, p_por text, p_det text default null, p_antes jsonb default null, p_depois jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into ali_auditoria(ref_tipo, ref_id, acao, por, detalhe, antes, depois) values (p_tipo, p_ref, p_acao, p_por, p_det, p_antes, p_depois);
$$;

-- Aprovar: gera o ticket (número único + código de validação). Nada é baixado do estoque aqui.
create or replace function ali_aprovar(p_sol uuid, p_por text, p_prato_id uuid, p_prato_nome text, p_qtd numeric, p_adicionais jsonb, p_ingredientes jsonb, p_custo_unit numeric, p_obs_cozinha text, p_prato_alterado boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s ali_solicitacoes; n bigint; t ali_tickets; cod text;
begin
  select * into s from ali_solicitacoes where id = p_sol for update;
  if s.id is null then raise exception 'Solicitação não encontrada'; end if;
  if s.status <> 'aguardando' then raise exception 'Solicitação já foi decidida (%).', s.status; end if;
  if coalesce(p_qtd,0) <= 0 then raise exception 'Quantidade inválida'; end if;
  n := nextval('ali_ticket_seq');
  cod := 'AMR-' || lpad(n::text, 6, '0');
  insert into ali_tickets(numero, codigo, solicitacao_id, loja, prato_id, prato_nome, qtd, adicionais, ingredientes, custo_unit, custo_total, obs_cozinha, autorizado_por)
  values (n, cod, s.id, s.loja, p_prato_id, upper(p_prato_nome), p_qtd, coalesce(p_adicionais,'[]'), coalesce(p_ingredientes,'[]'), coalesce(p_custo_unit,0), coalesce(p_custo_unit,0)*p_qtd, p_obs_cozinha, p_por)
  returning * into t;
  update ali_solicitacoes set status='aprovada', decidido_por=p_por, decidido_em=now(), updated_at=now() where id = s.id;
  perform ali_aud('solicitacao', s.id, 'aprovada', p_por, 'Ticket ' || cod || ' — ' || p_qtd || 'x ' || upper(p_prato_nome) || case when p_prato_alterado then ' (prato diferente do solicitado — nova autorização)' else '' end);
  perform ali_aud('ticket', t.id, 'emitido', p_por, cod);
  return to_jsonb(t);
end $$;

create or replace function ali_recusar(p_sol uuid, p_por text, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo da recusa'; end if;
  update ali_solicitacoes set status='recusada', decidido_por=p_por, decidido_em=now(), motivo_recusa=p_motivo, updated_at=now() where id=p_sol and status='aguardando';
  if not found then raise exception 'Solicitação não está aguardando aprovação'; end if;
  perform ali_aud('solicitacao', p_sol, 'recusada', p_por, p_motivo);
end $$;

create or replace function ali_cancelar(p_sol uuid, p_por text, p_just text) returns void
language plpgsql security definer set search_path = public as $$
declare s ali_solicitacoes;
begin
  if coalesce(trim(p_just),'') = '' then raise exception 'Informe a justificativa do cancelamento'; end if;
  select * into s from ali_solicitacoes where id=p_sol for update;
  if s.id is null then raise exception 'Solicitação não encontrada'; end if;
  if s.status in ('concluida','cancelada','recusada') then raise exception 'Solicitação já está % — não pode ser cancelada.', s.status; end if;
  update ali_tickets set status='cancelado', cancelado_em=now(), cancelado_por=p_por, justificativa_cancel=p_just where solicitacao_id=p_sol and status='emitido';
  update ali_solicitacoes set status='cancelada', cancelado_por=p_por, cancelado_em=now(), justificativa_cancel=p_just, updated_at=now() where id=p_sol;
  perform ali_aud('solicitacao', p_sol, 'cancelada', p_por, p_just);
end $$;

-- Impressão: contabiliza (reimpressão fica auditada). Ticket cancelado/entregue não imprime.
create or replace function ali_marcar_impresso(p_id uuid, p_por text) returns void
language plpgsql security definer set search_path = public as $$
declare t ali_tickets;
begin
  select * into t from ali_tickets where id=p_id for update;
  if t.id is null then raise exception 'Ticket não encontrado'; end if;
  if t.status <> 'emitido' then raise exception 'Ticket % — não pode ser impresso.', t.status; end if;
  update ali_tickets set impressoes=impressoes+1, impresso_em=coalesce(impresso_em, now()), impresso_por=coalesce(impresso_por, p_por) where id=p_id;
  perform ali_aud('ticket', p_id, case when t.impressoes > 0 then 'reimpresso' else 'impresso' end, p_por, t.codigo);
end $$;

-- Confirmação de entrega pela cozinha: ÚNICO ponto que baixa estoque e registra o consumo/CMV. Não reutilizável.
create or replace function ali_confirmar_entrega(p_ticket uuid, p_por text, p_codigo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t ali_tickets; it jsonb; ep estoque_produtos; q numeric; itens jsonb := '[]'::jsonb; antes numeric; depois numeric; baixado boolean;
begin
  select * into t from ali_tickets where id=p_ticket for update;
  if t.id is null then raise exception 'Ticket não encontrado'; end if;
  if t.status = 'entregue' then raise exception 'Ticket % JÁ FOI UTILIZADO em %.', t.codigo, to_char(t.entregue_em at time zone 'America/Sao_Paulo','DD/MM HH24:MI'); end if;
  if t.status = 'cancelado' then raise exception 'Ticket % está CANCELADO.', t.codigo; end if;
  if p_codigo is not null and regexp_replace(upper(p_codigo),'[^A-Z0-9]','','g') not in (regexp_replace(t.codigo,'[^A-Z0-9]','','g'), lpad(t.numero::text,6,'0'), t.numero::text) then
    raise exception 'Código de validação não confere com o ticket %.', t.codigo;
  end if;
  for it in select * from jsonb_array_elements(t.ingredientes) loop
    q := coalesce((it->>'qtd')::numeric,0) * t.qtd;
    baixado := false; antes := null; depois := null;
    if q > 0 then
      select * into ep from estoque_produtos where lower(loja)=lower(t.loja) and ativo is not false and lower(nome)=lower(it->>'nome') limit 1 for update;
      if ep.id is not null then
        antes := coalesce(ep.nivel_atual,0); depois := greatest(0, antes - q);
        update estoque_produtos set nivel_atual = depois, updated_at = now() where id = ep.id;
        insert into estoque_movimentacoes(loja, produto_id, produto_nome, tipo, quantidade, unidade, saldo_antes, saldo_depois, motivo, setor, centro_custo, observacao, created_by)
        values (t.loja, ep.id, ep.nome, 'saida', q, coalesce(it->>'unidade','un'), antes, depois, 'Alimentação autorizada ' || t.codigo, 'Cozinha', 'alimentação autorizada', t.prato_nome, p_por);
        baixado := true;
      end if;
    end if;
    itens := itens || jsonb_build_array(jsonb_build_object('nome', it->>'nome', 'qtd', q, 'unidade', it->>'unidade', 'baixado', baixado, 'saldo_antes', antes, 'saldo_depois', depois));
  end loop;
  update ali_tickets set status='entregue', entregue_em=now(), entregue_por=p_por where id=t.id;
  insert into ali_consumos(ticket_id, solicitacao_id, loja, prato_id, prato_nome, qtd, custo_total, itens, registrado_por)
  values (t.id, t.solicitacao_id, t.loja, t.prato_id, t.prato_nome, t.qtd, t.custo_total, itens, p_por);
  update ali_solicitacoes set status='concluida', updated_at=now() where id=t.solicitacao_id;
  perform ali_aud('ticket', t.id, 'entregue', p_por, t.codigo || ' — ' || t.qtd || 'x ' || t.prato_nome);
  perform ali_aud('solicitacao', t.solicitacao_id, 'concluida', p_por, 'Entrega confirmada pela cozinha');
  return jsonb_build_object('ok', true, 'codigo', t.codigo, 'itens', itens);
end $$;

-- Páginas públicas
create or replace function ali_ticket_publico(p_id uuid) returns jsonb
language sql security definer set search_path = public as $$
  select to_jsonb(t) || jsonb_build_object('nome', s.nome, 'tipo_solicitante', s.tipo_solicitante, 'empresa', s.empresa, 'responsavel', s.responsavel)
  from ali_tickets t join ali_solicitacoes s on s.id = t.solicitacao_id where t.id = p_id;
$$;
create or replace function ali_cozinha_lista(p_loja text) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.emitido_em), '[]'::jsonb) from (
    select t.id, t.numero, t.codigo, t.loja, t.prato_nome, t.qtd, t.adicionais, t.obs_cozinha, t.autorizado_por, t.emitido_em, t.status, t.entregue_em, t.entregue_por,
           s.nome, s.tipo_solicitante, s.empresa
    from ali_tickets t join ali_solicitacoes s on s.id=t.solicitacao_id
    where lower(t.loja)=lower(p_loja) and (t.status='emitido' or (t.status='entregue' and t.entregue_em > now() - interval '12 hours'))
  ) x;
$$;
grant execute on function ali_aud(text,uuid,text,text,text,jsonb,jsonb), ali_aprovar(uuid,text,uuid,text,numeric,jsonb,jsonb,numeric,text,boolean), ali_recusar(uuid,text,text), ali_cancelar(uuid,text,text), ali_marcar_impresso(uuid,text), ali_confirmar_entrega(uuid,text,text), ali_ticket_publico(uuid), ali_cozinha_lista(text) to anon, authenticated;
notify pgrst, 'reload schema';

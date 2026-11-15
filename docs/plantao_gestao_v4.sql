-- Plantão de Gestão — v4: avaliação de pratos, evidência obrigatória só onde importa, RNC exige evidência
create table if not exists plt_pratos (
  id uuid primary key default gen_random_uuid(),
  plantao_id uuid not null references plt_plantoes(id) on delete cascade,
  prato text not null,
  tempo_entrega_min numeric,
  nota_apresentacao int, nota_sabor int, nota_prazo int,
  nota_geral numeric,
  obs_apresentacao text, obs_sabor text, obs_prazo text,
  ev_apresentacao text[] not null default '{}', ev_sabor text[] not null default '{}', ev_prazo text[] not null default '{}',
  criado_por text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists plt_pratos_pl on plt_pratos(plantao_id);
alter table plt_pratos disable row level security;
grant all on plt_pratos to anon, authenticated, service_role;

create or replace function plantao_relatorio(p_id uuid) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'plantao', to_jsonb(p),
    'respostas', coalesce((select jsonb_agg(to_jsonb(r)) from plt_respostas r where r.plantao_id = p.id), '[]'::jsonb),
    'ocorrencias', coalesce((select jsonb_agg(to_jsonb(o) order by o.numero) from plt_ocorrencias o where o.plantao_id = p.id), '[]'::jsonb),
    'pratos', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from plt_pratos x where x.plantao_id = p.id), '[]'::jsonb)
  ) from plt_plantoes p where p.id = p_id;
$$;

-- RNC exige evidência (foto/vídeo)
create or replace function plantao_abrir_rnc(p_oc uuid, p_usuario text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o plt_ocorrencias; r record; u text; cat text;
begin
  select * into o from plt_ocorrencias where id = p_oc;
  if not found then return jsonb_build_object('erro','Ocorrência não encontrada'); end if;
  if o.rnc_id is not null then return jsonb_build_object('rnc_id',o.rnc_id,'numero',o.rnc_numero,'ja',true); end if;
  if coalesce(array_length(o.evidencias,1),0) + coalesce(array_length(o.evid_inicial,1),0) = 0 then
    return jsonb_build_object('erro','A RNC exige evidência: anexe foto ou vídeo na ocorrência antes de abrir.');
  end if;
  cat := case
    when coalesce(o.setor_nome,'') ~* 'estoque|bebida' then 'Estoque, recebimento e compras'
    when coalesce(o.setor_nome,'') ~* 'cozinha|produ|mise' then 'Cozinha e produção'
    when coalesce(o.setor_nome,'') ~* 'limpeza' then 'Limpeza e segurança alimentar'
    when coalesce(o.setor_nome,'') ~* 'estrutura|manuten' then 'Estrutura e manutenção'
    when coalesce(o.setor_nome,'') ~* 'equipe|atendimento|frente' then 'Salão e atendimento'
    when coalesce(o.setor_nome,'') ~* 'chegada' then 'Abertura e fechamento da loja'
    else 'Gestão e comportamento operacional' end;
  insert into rnc (origem, loja, setor, categoria, tipos, gravidade, status, titulo, desvio_txt, acao_corretiva, responsavel, responsavel_area, prazo, aberto_por, acompanhantes, plantao_id, plt_ocorrencia_id)
  values ('operacao', o.loja, coalesce(o.resp_setor, o.setor_nome, 'Operação'), cat,
    array['Operação','Plantão de Gestão'] || case when o.reincidente then array['Reincidência'] else array[]::text[] end,
    o.prioridade, case when o.reincidente then 'reincidente' else 'aberta' end,
    left('[Plantão] ' || coalesce(o.item_texto, o.setor_nome, 'Ocorrência') || ' — ' || o.loja, 140),
    o.descricao, o.acao, coalesce(o.resp_nome, p_usuario), coalesce(o.resp_setor, o.setor_nome),
    coalesce(o.prazo::date, current_date + 2), p_usuario, '[]'::jsonb, o.plantao_id, o.id)
  returning id, numero into r;
  insert into rnc_historico (rnc_id, acao, detalhe, usuario)
    values (r.id, 'RNC aberta a partir do Plantão de Gestão', 'Ocorrência #' || o.numero || ' · ' || o.loja || ' · identificada por ' || coalesce(o.identificado_por,'—'), p_usuario);
  for u in select unnest(o.evidencias || o.evid_inicial) loop
    insert into rnc_evidencias (rnc_id, tipo, arquivo_url, descricao, usuario)
      values (r.id, case when u ~* '\.(mp4|mov|webm|3gp|m4v)(\?|$)' then 'Vídeo' else 'Foto do problema' end, u, 'Importada do Plantão de Gestão', p_usuario);
  end loop;
  update plt_ocorrencias set rnc_id = r.id, rnc_numero = r.numero, updated_at = now() where id = o.id;
  insert into plt_auditoria (entidade, entidade_id, acao, depois, usuario) values ('ocorrencia', o.id::text, 'RNC aberta', jsonb_build_object('rnc', r.numero), p_usuario);
  return jsonb_build_object('rnc_id', r.id, 'numero', r.numero);
end $$;
grant execute on function plantao_abrir_rnc(uuid, text) to anon, authenticated;

-- Checklist v3: foto/vídeo OBRIGATÓRIA só em desvios (Não conforme) e na Frente de loja (evObrig); nos demais é opcional
update plt_checklist_versoes set ativa=false where ativa;
insert into plt_checklist_versoes (versao, ativa, estrutura, created_by)
select 3, true, (
  select jsonb_agg(case when s->>'id'='s02' then s || '{"evObrig":true}'::jsonb else s end order by ord)
  from plt_checklist_versoes v, jsonb_array_elements(v.estrutura) with ordinality as t(s,ord) where v.versao=2
), 'sistema'
where not exists (select 1 from plt_checklist_versoes where versao=3);

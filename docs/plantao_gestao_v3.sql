-- Plantão de Gestão — v3: ocorrência avulsa/demanda/observação, devolutiva, RNC e responsáveis pelo link
alter table plt_ocorrencias add column if not exists origem text not null default 'checklist';
alter table plt_ocorrencias add column if not exists categoria text not null default 'ocorrencia';
alter table plt_ocorrencias add column if not exists devolutiva text;
alter table plt_ocorrencias add column if not exists devolutiva_por text;
alter table plt_ocorrencias add column if not exists devolutiva_em timestamptz;
alter table plt_ocorrencias add column if not exists devolutiva_evid text[] not null default '{}';
alter table plt_ocorrencias add column if not exists whatsapp_enviado_em timestamptz;

-- Nomes dos usuários do painel (sem telefone) para escolher o responsável pela tratativa
create or replace function plantao_responsaveis() returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(n order by n), '[]'::jsonb) from (
    select distinct btrim(name) as n from profiles where btrim(coalesce(name,'')) <> ''
  ) x;
$$;
grant execute on function plantao_responsaveis() to anon, authenticated;

-- Abre a RNC (Central de Tarefas) a partir de uma ocorrência do plantão
create or replace function plantao_abrir_rnc(p_oc uuid, p_usuario text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o plt_ocorrencias; r record; u text; cat text; st text;
begin
  select * into o from plt_ocorrencias where id = p_oc;
  if not found then return jsonb_build_object('erro','Ocorrência não encontrada'); end if;
  if o.rnc_id is not null then return jsonb_build_object('rnc_id',o.rnc_id,'numero',o.rnc_numero,'ja',true); end if;
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

-- Dados completos de uma ocorrência para a página pública de tratativa
create or replace function plantao_tratativa(p_id uuid) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'ocorrencia', to_jsonb(o),
    'plantao', (select to_jsonb(p) - 'estrutura' from plt_plantoes p where p.id = o.plantao_id),
    'historico', coalesce((select jsonb_agg(to_jsonb(a) order by a.quando desc) from plt_auditoria a where a.entidade_id = o.id::text), '[]'::jsonb),
    'outras', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'numero',x.numero,'categoria',x.categoria,'descricao',x.descricao,'status',x.status,'resp_nome',x.resp_nome,'prazo',x.prazo,'prioridade',x.prioridade) order by x.numero) from plt_ocorrencias x where x.plantao_id = o.plantao_id and x.id <> o.id), '[]'::jsonb)
  ) from plt_ocorrencias o where o.id = p_id;
$$;
grant execute on function plantao_tratativa(uuid) to anon, authenticated;

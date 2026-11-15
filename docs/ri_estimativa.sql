
alter table ri_conf add column if not exists estimativa_por text, add column if not exists estimativa_em timestamptz, add column if not exists estimativa_total numeric;

create or replace function ri_preco_ref(p_nomes text[]) returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('nome',n,'preco',coalesce(a.preco,b.preco,c.preco),
    'fonte',case when a.preco is not null then 'último pedido' when b.preco is not null then 'última compra (caixa)' when c.preco is not null then 'cadastro do estoque' end,
    'data',coalesce(a.d,b.d,c.d))),'[]'::jsonb)
  from unnest(p_nomes) n
  left join lateral (select i.preco, p.created_at::date d from pedido_compra_itens i join pedidos_compra p on p.id=i.pedido_id
     where ri_norm(i.produto_nome)=ri_norm(n) and coalesce(i.preco,0)>0 and coalesce(p.status,'')<>'cancelada' order by p.created_at desc limit 1) a on true
  left join lateral (select case when coalesce(ci.preco_unit,0)>0 then ci.preco_unit when coalesce(ci.quantidade,0)>0 then round(ci.valor/ci.quantidade,2) end preco, coalesce(ci.data,ci.created_at::date) d
     from caixa_itens ci where ri_norm(ci.descricao)=ri_norm(n) and (coalesce(ci.preco_unit,0)>0 or coalesce(ci.quantidade,0)>0) order by coalesce(ci.data,ci.created_at::date) desc limit 1) b on true
  left join lateral (select e.preco_unitario preco, e.updated_at::date d from estoque_produtos e where ri_norm(e.nome)=ri_norm(n) and coalesce(e.preco_unitario,0)>0 order by e.updated_at desc limit 1) c on true
$$;

create or replace function ri_estimar_auto(p_req uuid) returns numeric
language plpgsql security definer set search_path=public as $$
declare refs jsonb; tot numeric;
begin
  select ri_preco_ref(array_agg(produto_nome)) into refs from requisicao_itens where requisicao_id=p_req;
  update requisicao_itens it set preco_referencia=(r->>'preco')::numeric
    from jsonb_array_elements(coalesce(refs,'[]')) r
   where it.requisicao_id=p_req and r->>'nome'=it.produto_nome and r->>'preco' is not null and coalesce(it.preco_referencia,0)=0;
  select coalesce(sum(coalesce(preco_referencia,0)*quantidade),0) into tot from requisicao_itens where requisicao_id=p_req and status<>'cancelado';
  update requisicoes set total_estimado=tot, updated_at=now() where id=p_req;
  return tot;
end $$;

create or replace function ri_finalizar(p_token text, p_itens jsonb, p_por text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v ri_conf; base jsonb; snap jsonb := '[]'; x jsonb; b jsonb; n_pedir int := 0; n_conf int := 0;
  prot text; rq requisicoes; qtd numeric; fis numeric; por text; modo text; st_ini text; tot numeric := 0;
begin
  select * into v from ri_conf where token=p_token for update;
  if not found then raise exception 'Link inválido.'; end if;
  if v.status='enviada' then raise exception 'Esta requisição já foi enviada (protocolo %).', v.protocolo; end if;
  if v.status='cancelada' then raise exception 'Este link foi cancelado.'; end if;
  if v.validade is not null and v.validade<now() then raise exception 'Link expirado.'; end if;
  por := coalesce(nullif(trim(p_por),''), v.solicitante);
  base := ri_base(v.loja, v.dias);
  for x in select * from jsonb_array_elements(coalesce(p_itens,'[]')) loop
    if coalesce((x->>'conf')::boolean,false) is false and coalesce((x->>'qtd')::numeric,0)<=0 and nullif(x->>'fisico','') is null then continue; end if;
    qtd := coalesce(nullif(x->>'qtd','')::numeric,0);
    if qtd<0 then raise exception 'Quantidade inválida em "%".', x->>'nome'; end if;
    fis := nullif(x->>'fisico','')::numeric;
    select e into b from jsonb_array_elements(base) e where e->>'k'=x->>'k' limit 1;
    snap := snap || jsonb_build_object(
      'k',x->>'k','nome',x->>'nome','cat',coalesce(x->>'cat','Sem categoria'),'un',coalesce(x->>'un','Unidade'),
      'qtd',qtd,'fisico',fis,'obs',nullif(x->>'obs',''),'extra',coalesce((x->>'extra')::boolean,false),
      'saldo',b->'saldo','consumo_mensal',b->'consumo_mensal','habitual',coalesce((b->>'habitual')::boolean,false),
      'ult_compra',b->'ult_compra','ult_mov',b->'ult_mov','tendencia',b->'tendencia',
      'diferenca', case when fis is not null and b is not null then fis-(b->>'saldo')::numeric end);
    n_conf := n_conf+1;
    if qtd>0 then n_pedir := n_pedir+1; end if;
  end loop;
  if n_pedir=0 then raise exception 'Informe a quantidade de pelo menos um produto a repor antes de enviar.'; end if;
  modo := coalesce((select valor #>> '{}' from app_config where chave='ri_estimativa_modo'),'manual');
  st_ini := case when modo='automatica' then 'enviada' else 'em_estimativa' end;
  prot := 'RI-'||to_char(now(),'YYYY')||'-'||lpad(nextval('ri_seq')::text,6,'0');
  insert into requisicoes(loja,titulo,status,prioridade,responsavel_nome,created_by,observacoes,total_estimado,total_final)
  values (v.loja,'Requisição Inteligente '||prot||' — '||v.solicitante,st_ini,'media',v.solicitante,
          case when v.origem='link' then 'Link: '||v.solicitante else por end,
          'Gerada pela Requisição Inteligente ('||prot||'), origem '||v.origem||'. '||n_conf||' produto(s) conferido(s), '||n_pedir||' a repor.',0,0)
  returning * into rq;
  insert into requisicao_itens(requisicao_id,produto_nome,categoria,quantidade,unidade,status,observacoes)
  select rq.id, s->>'nome', s->>'cat', (s->>'qtd')::numeric, coalesce(s->>'un','Unidade'), 'pendente',
         nullif(concat_ws(' · ', case when (s->>'extra')::boolean then 'Produto incluído manualmente' end,
           case when s->>'fisico' is not null then 'Estoque físico informado: '||(s->>'fisico') end, s->>'obs'),'')
  from jsonb_array_elements(snap) s where (s->>'qtd')::numeric>0;
  if modo='automatica' then tot := ri_estimar_auto(rq.id); end if;
  insert into req_timeline(requisicao_id,tipo,descricao,usuario) values
    (rq.id,'criacao','Requisição criada automaticamente pela Requisição Inteligente ('||prot||') — solicitante '||v.solicitante,por),
    (rq.id,'envio',case when modo='automatica' then 'Estimativa de preço AUTOMÁTICA concluída (R$ '||to_char(tot,'FM999G990D00')||') — enviada para aprovação via ' else 'Enviada ao COMPRADOR (Setor de Compras) para estimativa de preço via ' end||case when v.origem='link' then 'link individual' else 'painel' end||' ('||n_pedir||' item(ns) a repor, '||n_conf||' conferidos)',por);
  insert into req_auditoria(requisicao_id,entidade,entidade_id,campo,valor_novo,acao,usuario)
  values (rq.id,'requisicao',rq.id,'(requisição)','Criada pela Requisição Inteligente '||prot||' com '||n_pedir||' item(ns)','criacao',por);
  update ri_conf set status='enviada', itens=coalesce(p_itens,'[]'), itens_final=snap, protocolo=prot, requisicao_id=rq.id,
    requisicao_numero=rq.numero, enviado_em=now(), enviado_por=por, updated_at=now() where id=v.id;
  perform ri_aud(v.id,'enviou',por,format('%s · req #%s · %s conferidos · %s a repor',prot,rq.numero,n_conf,n_pedir));
  return jsonb_build_object('protocolo',prot,'numero',rq.numero,'requisicao_id',rq.id,'conferidos',n_conf,'a_repor',n_pedir,'proximo',case when modo='automatica' then 'aprovacao' else 'comprador' end,'total_estimado',tot);
end $$;

create or replace function ri_concluir_estimativa(p_req uuid, p_itens jsonb, p_por text, p_obs text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare rq requisicoes; x jsonb; tot numeric; n_sem int;
begin
  select * into rq from requisicoes where id=p_req for update;
  if not found then raise exception 'Requisição não encontrada.'; end if;
  if rq.status<>'em_estimativa' then raise exception 'Esta requisição não está aguardando estimativa (status atual: %).', rq.status; end if;
  for x in select * from jsonb_array_elements(coalesce(p_itens,'[]')) loop
    update requisicao_itens set preco_referencia=nullif(x->>'preco','')::numeric where id=(x->>'id')::uuid and requisicao_id=p_req;
  end loop;
  select coalesce(sum(coalesce(preco_referencia,0)*quantidade),0), count(*) filter (where coalesce(preco_referencia,0)=0) into tot, n_sem
    from requisicao_itens where requisicao_id=p_req and status<>'cancelado';
  update requisicoes set status='enviada', total_estimado=tot, updated_at=now() where id=p_req;
  insert into req_timeline(requisicao_id,tipo,descricao,usuario) values
    (p_req,'ajuste','Estimativa de preço revisada pelo Setor de Compras ('||p_por||'): R$ '||to_char(tot,'FM999G990D00')||case when n_sem>0 then ' — '||n_sem||' item(ns) sem preço' else '' end||coalesce(' · '||nullif(p_obs,''),''),p_por),
    (p_req,'envio','Enviada para APROVAÇÃO com a estimativa de preço revisada pelo Setor de Compras',p_por);
  insert into req_auditoria(requisicao_id,entidade,entidade_id,campo,valor_novo,acao,usuario)
  values (p_req,'requisicao',p_req,'total_estimado','R$ '||to_char(tot,'FM999G990D00'),'alteracao',p_por);
  update ri_conf set estimativa_por=p_por, estimativa_em=now(), estimativa_total=tot where requisicao_id=p_req;
  perform ri_aud((select id from ri_conf where requisicao_id=p_req limit 1),'estimativa concluída',p_por,'R$ '||tot);
  return jsonb_build_object('total',tot,'sem_preco',n_sem,'numero',rq.numero,'loja',rq.loja,'solicitante',rq.responsavel_nome,'titulo',rq.titulo);
end $$;

grant execute on function ri_preco_ref(text[]), ri_estimar_auto(uuid), ri_concluir_estimativa(uuid,jsonb,text,text) to authenticated;
revoke execute on function ri_preco_ref(text[]), ri_estimar_auto(uuid) from anon, public;
notify pgrst, 'reload schema';

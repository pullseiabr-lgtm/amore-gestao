-- Toda requisição nova/reenviada passa pela ESTIMATIVA DE PREÇO (Setor de Compras) antes da aprovação
create or replace function trg_req_estimativa() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('ri.bypass', true),'0')='1' then return new; end if;
  if new.status='enviada'
     and (tg_op='INSERT' or old.status in ('rascunho','reprovada'))
     and coalesce(new.observacoes,'') not like '[IMPORT_CAIXA]%' then
    new.status := 'em_estimativa';
  end if;
  return new;
end $$;
drop trigger if exists trg_req_estimativa on requisicoes;
create trigger trg_req_estimativa before insert or update of status on requisicoes for each row execute function trg_req_estimativa();

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
  perform set_config('ri.bypass', case when modo='automatica' then '1' else '0' end, true);
  insert into requisicoes(loja,titulo,status,prioridade,responsavel_nome,created_by,observacoes,total_estimado,total_final)
  values (v.loja,'Requisição Inteligente '||prot||' — '||v.solicitante,st_ini,'media',v.solicitante,
          case when v.origem='link' then 'Link: '||v.solicitante else por end,
          'Gerada pela Requisição Inteligente ('||prot||'), origem '||v.origem||'. '||n_conf||' produto(s) conferido(s), '||n_pedir||' a repor.',0,0)
  returning * into rq;
  perform set_config('ri.bypass','0',true);
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
notify pgrst, 'reload schema';

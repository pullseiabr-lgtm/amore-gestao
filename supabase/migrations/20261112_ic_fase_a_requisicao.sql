-- Inteligência de Compras — Fase A: análise de preços por requisição + snapshot
create table if not exists ic_req_analises (
  id uuid primary key default gen_random_uuid(),
  requisicao_id uuid not null,
  momento text not null,            -- 'envio' | 'aprovacao'
  snapshot jsonb not null,
  custo_total numeric,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists ic_req_analises_req on ic_req_analises(requisicao_id, momento);
alter table ic_req_analises enable row level security;  -- acesso só via RPC security definer

create or replace function ic_unid_base(u text) returns text language sql immutable as $$
  select case when lower(coalesce(u,'')) in ('kg','g') then 'kg' when lower(coalesce(u,'')) in ('l','lt','ml') then 'L' else 'un' end $$;
create or replace function ic_unid_fator(u text) returns numeric language sql immutable as $$
  select case when lower(coalesce(u,'')) in ('g','ml') then 0.001 else 1 end $$;

create or replace function ic_analise_requisicao(p_req uuid, p_momento text default null, p_usuario text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it record; res jsonb := '[]'::jsonb; j jsonb;
  cfg jsonb; v_crit numeric; v_alerta numeric; v_susp numeric; alias jsonb;
  k text; ub text; qb numeric; ult record; ant numeric; med numeric; n int; pct numeric; forn_j jsonb;
  tot numeric := 0; ok int := 0; sem int := 0; v_loja text; out jsonb; exist jsonb;
begin
  select valor::jsonb into cfg from app_config where chave='ic_config';
  v_crit := coalesce((cfg->>'critico')::numeric,10); v_alerta := coalesce((cfg->>'alerta')::numeric,5); v_susp := coalesce((cfg->>'suspeito')::numeric,5);
  alias := coalesce(cfg->'aliases','{}'::jsonb);
  select loja into v_loja from requisicoes where id=p_req;
  create temp table if not exists _ic_all (data date, preco_base numeric, fornecedor_key text, loja text, valor numeric, qtd_base numeric, caixa_id uuid, produto_key text, un_base text) on commit drop;
  truncate _ic_all;
  insert into _ic_all select c.data, c.preco_base, c.fornecedor_key, c.loja, c.valor, c.qtd_base, c.caixa_id, coalesce(alias->>c.produto_key, c.produto_key), c.un_base from v_ic_compras c where c.preco_ok and c.data_ok and c.eh_produto;
  for it in select * from requisicao_itens where requisicao_id=p_req order by created_at loop
    k := ic_norm(it.produto_nome); ub := ic_unid_base(it.unidade);
    qb := coalesce(it.quantidade_aprovada, it.quantidade, 0) * ic_unid_fator(it.unidade);
    create temp table if not exists _ic_m (data date, preco numeric, forn text, loja text, valor numeric, qtd numeric, caixa uuid) on commit drop;
    truncate _ic_m;
    insert into _ic_m
      select c.data, c.preco_base, c.fornecedor_key, c.loja, c.valor, c.qtd_base, c.caixa_id
      from _ic_all c
      where c.un_base=ub
        and (c.produto_key = coalesce(alias->>k,k) or c.produto_key like coalesce(alias->>k,k)||' %' or coalesce(alias->>k,k) like c.produto_key||' %');
    select count(distinct m.data) into n from _ic_m m;
    if n = 0 then
      sem := sem + 1;
      j := jsonb_build_object('item_id',it.id,'produto',it.produto_nome,'qtd',coalesce(it.quantidade_aprovada,it.quantidade),'unidade',it.unidade,'status','sem_referencia','preco_referencia_cadastro',it.preco_referencia);
    else
      -- preço por dia (ponderado)
      create temp table if not exists _ic_d (data date, preco numeric, forn text, loja text) on commit drop;
      truncate _ic_d;
      insert into _ic_d select m.data, sum(m.valor)/nullif(sum(m.qtd),0),
        (array_agg(m.forn order by m.valor desc))[1], (array_agg(m.loja order by m.valor desc))[1] from _ic_m m group by m.data;
      select * into ult from _ic_d order by data desc limit 1;
      select preco into ant from _ic_d where data < ult.data order by data desc limit 1;
      select avg(preco) into med from (select preco from _ic_d order by data desc limit 5) x;
      pct := case when ant is not null and ant>0 then (ult.preco-ant)/ant*100 end;
      select jsonb_agg(jsonb_build_object('nome',f.fk,'ultimo_preco',f.ultimo,'data',f.dt,'menor',f.mn) order by f.ultimo) into forn_j
        from (select m.forn fk, (array_agg(m.preco order by m.data desc))[1] ultimo, max(m.data) dt, min(m.preco) mn from _ic_m m group by m.forn) f;
      j := jsonb_build_object('item_id',it.id,'produto',it.produto_nome,'qtd',coalesce(it.quantidade_aprovada,it.quantidade),'unidade',it.unidade,'un_base',ub,'qtd_base',qb,
        'status','ok','n_compras',n,
        'ultimo', jsonb_build_object('preco',round(ult.preco,4),'data',ult.data,'fornecedor',ult.forn,'loja',ult.loja),
        'anterior_preco', round(ant,4), 'variacao_pct', round(pct,2), 'media', round(med,4),
        'menor_hist', (select jsonb_build_object('preco',round(m.preco,4),'fornecedor',m.forn,'data',m.data) from _ic_m m order by m.preco asc limit 1),
        'fornecedores', forn_j,
        'custo_estimado', round(ult.preco*qb,2),
        'custo_media', round(med*qb,2),
        'alerta', case when pct is null then null when greatest(ult.preco,ant)/least(ult.preco,ant) > v_susp then 'suspeito'
                       when pct > v_crit then 'aumento_critico' when pct > v_alerta then 'aumento_alerta' when pct > 1 then 'aumento' when pct < -1 then 'reducao' else null end,
        'origem', (select jsonb_agg(distinct m.caixa) from _ic_m m));
      tot := tot + round(ult.preco*qb,2); ok := ok + 1;
    end if;
    res := res || jsonb_build_array(j);
  end loop;
  out := jsonb_build_object('requisicao_id',p_req,'loja',v_loja,'gerado_em',now(),'regra','custo estimado = último preço pago (média histórica apenas complementar)',
     'itens',res,'custo_total',tot,'itens_com_referencia',ok,'itens_sem_referencia',sem);
  if p_momento in ('envio','aprovacao') then
    select snapshot into exist from ic_req_analises where requisicao_id=p_req and momento=p_momento order by created_at limit 1;
    if exist is null or p_momento='aprovacao' then
      if p_momento='aprovacao' then delete from ic_req_analises where requisicao_id=p_req and momento='aprovacao'; end if;
      insert into ic_req_analises(requisicao_id,momento,snapshot,custo_total,created_by) values (p_req,p_momento,out,tot,p_usuario);
    end if;
  end if;
  return out;
end $$;

create or replace function ic_snapshots_requisicao(p_req uuid) returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('momento',momento,'custo_total',custo_total,'created_at',created_at,'created_by',created_by,'snapshot',snapshot) order by created_at),'[]'::jsonb) from ic_req_analises where requisicao_id=p_req $$;

grant execute on function ic_analise_requisicao(uuid,text,text), ic_snapshots_requisicao(uuid) to anon, authenticated;

-- Requisição Inteligente + Checklist de Consumo — Fase 1
create sequence if not exists ri_seq start 1;

-- Conferência/requisição inteligente (interna ou por link). Token = acesso público do solicitante.
create table if not exists ri_conf (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text,'-',''),
  origem text not null default 'link',            -- link | interna
  loja text not null,
  solicitante text not null,
  dias int not null default 90,
  validade timestamptz,
  status text not null default 'aguardando',      -- aguardando | em_preenchimento | enviada | cancelada
  itens jsonb not null default '[]',              -- rascunho: [{k,nome,cat,un,conf,fisico,qtd,obs,extra}]
  itens_final jsonb,                              -- snapshot de TODOS os conferidos (com saldo do sistema)
  protocolo text, requisicao_id uuid, requisicao_numero int,
  aberto_em timestamptz, enviado_em timestamptz, enviado_por text,
  notificado_em timestamptz, notificado_por text,
  cancelado_por text, cancelado_em timestamptz, motivo_cancel text,
  criado_por text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists ri_conf_loja on ri_conf(loja, created_at desc);

create table if not exists ri_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  conf_id uuid not null references ri_conf(id) on delete cascade,
  loja text not null, produto text not null, unidade text,
  saldo_sistema numeric, qtd_fisica numeric, diferenca numeric,
  obs text, status text not null default 'aberta',   -- aberta | autorizada | resolvida | descartada
  criado_por text, created_at timestamptz default now(),
  decidido_por text, decidido_em timestamptz, decisao_obs text
);
create unique index if not exists ri_oc_uni on ri_ocorrencias(conf_id, produto);

create table if not exists ri_aud (
  id uuid primary key default gen_random_uuid(),
  conf_id uuid, acao text not null, por text, detalhe text, em timestamptz default now()
);
create index if not exists ri_aud_conf on ri_aud(conf_id, em desc);

alter table ri_conf disable row level security;
alter table ri_ocorrencias disable row level security;
alter table ri_aud disable row level security;
-- Tokens não podem ser lidos por anônimos direto na tabela: público só via RPC.
revoke all on ri_conf, ri_ocorrencias, ri_aud from anon;
grant select, insert, update, delete on ri_conf, ri_ocorrencias, ri_aud to authenticated, service_role;

create or replace function ri_norm(t text) returns text language sql immutable as $$
  select trim(regexp_replace(translate(lower(coalesce(t,'')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]+',' ','g'))
$$;
create or replace function ri_loja(t text) returns text language sql immutable as $$
  select case when t ilike '%paiva%' then 'Amore Paiva' when t ilike '%flow%' then 'Flow CD' else 'Amore CD' end
$$;

create or replace function ri_aud(p_conf uuid, p_acao text, p_por text, p_det text default null) returns void
language sql security definer set search_path=public as $$ insert into ri_aud(conf_id,acao,por,detalhe) values (p_conf,p_acao,p_por,p_det) $$;

-- Base de produtos da loja: tudo que foi comprado/consumido/movimentado na janela + todo o cadastro ativo.
-- NUNCA devolve preço nem fornecedor.
create or replace function ri_base(p_loja text, p_dias int default 90) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare d int := greatest(coalesce(p_dias,90),1); v_ini timestamptz; r jsonb;
begin
  v_ini := now() - make_interval(days => d);
  with est as (
    select ri_norm(nome) k, (array_agg(nome order by length(nome)))[1] nome, (array_agg(categoria order by (categoria='Geral'), nivel_atual desc))[1] cat,
           sum(coalesce(nivel_atual,0)) saldo, max(nivel_minimo) mn, max(nivel_ideal) ide
    from estoque_produtos where coalesce(ativo,true) and loja=p_loja group by 1
  ), mv as (
    select ri_norm(produto_nome) k, (array_agg(produto_nome order by created_at desc))[1] nome,
      (array_agg(unidade order by created_at desc) filter (where unidade is not null))[1] un,
      max(created_at) ult_mov,
      count(*) filter (where created_at>=v_ini) n_mov,
      coalesce(sum(quantidade) filter (where tipo='entrada' and created_at>=v_ini),0) - coalesce(sum(quantidade) filter (where tipo='estorno_entrada' and created_at>=v_ini),0) entradas,
      coalesce(sum(quantidade) filter (where tipo='saida' and created_at>=v_ini),0) - coalesce(sum(quantidade) filter (where tipo='estorno_saida' and created_at>=v_ini),0) saidas,
      coalesce(sum(quantidade) filter (where tipo='saida' and created_at>=now()-interval '30 days'),0) s30,
      coalesce(sum(quantidade) filter (where tipo='saida' and created_at<now()-interval '30 days' and created_at>=now()-interval '60 days'),0) s60,
      count(*) filter (where tipo='saida' and created_at>=v_ini) n_saidas,
      max(created_at) filter (where tipo='entrada') ult_entrada
    from estoque_movimentacoes where ri_loja(loja)=p_loja group by 1
  ), pd as (
    select ri_norm(i.produto_nome) k, (array_agg(i.produto_nome order by p.created_at desc))[1] nome,
      (array_agg(i.unidade order by p.created_at desc) filter (where i.unidade is not null))[1] un,
      max(p.created_at) ult_ped,
      count(distinct p.id) filter (where p.created_at>=v_ini) n_ped,
      coalesce(sum(i.qtd_pedida) filter (where p.created_at>=v_ini),0) qtd_ped
    from pedido_compra_itens i join pedidos_compra p on p.id=i.pedido_id
    where coalesce(p.status,'')<>'cancelada' and ri_loja(p.loja)=p_loja group by 1
  ), cx as (
    select ri_norm(ci.descricao) k, (array_agg(ci.descricao order by coalesce(ci.data,ci.created_at::date) desc))[1] nome,
      (array_agg(ci.unidade order by coalesce(ci.data,ci.created_at::date) desc) filter (where ci.unidade is not null))[1] un,
      max(coalesce(ci.data,ci.created_at::date)) ult_cx,
      count(*) filter (where coalesce(ci.data,ci.created_at::date)>=v_ini::date) n_cx,
      coalesce(sum(ci.quantidade) filter (where coalesce(ci.data,ci.created_at::date)>=v_ini::date),0) qtd_cx
    from caixa_itens ci join caixas c on c.id=ci.caixa_id
    where ri_loja(c.loja)=p_loja and ri_norm(ci.descricao)<>'' group by 1
  ), chaves as (
    select k from est
    union select k from mv where n_mov>0
    union select k from pd where n_ped>0
    union select k from cx where n_cx>0
  ), linhas as (
    select c.k,
      coalesce(est.nome, pd.nome, mv.nome, cx.nome) nome,
      coalesce(est.cat,'Sem categoria') cat,
      coalesce(mv.un, pd.un, cx.un, 'Unidade') un,
      coalesce(est.saldo,0) saldo, est.mn, est.ide, (est.k is not null) no_cadastro,
      coalesce(mv.entradas,0) entradas, coalesce(mv.saidas,0) saidas, coalesce(mv.s30,0) s30, coalesce(mv.s60,0) s60,
      coalesce(mv.n_mov,0) n_mov, coalesce(mv.n_saidas,0) n_saidas, mv.ult_mov,
      coalesce(pd.n_ped,0)+coalesce(cx.n_cx,0) compras_n,
      coalesce(pd.qtd_ped,0)+coalesce(cx.qtd_cx,0) compras_qtd,
      greatest(pd.ult_ped, cx.ult_cx::timestamptz, mv.ult_entrada) ult_compra
    from chaves c left join est on est.k=c.k left join mv on mv.k=c.k left join pd on pd.k=c.k left join cx on cx.k=c.k
    where c.k<>''
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'k',k,'nome',nome,'cat',cat,'un',un,'saldo',saldo,'min',mn,'ideal',ide,'no_cadastro',no_cadastro,
    'compras_n',compras_n,'compras_qtd',compras_qtd,'entradas',entradas,'saidas',saidas,
    'consumo_mensal',round(saidas*30.0/d,2),'consumo_semanal',round(saidas*7.0/d,2),
    'freq_dias', case when compras_n>0 then round(d::numeric/compras_n,1) end,
    'ult_compra',ult_compra,'ult_mov',ult_mov,
    'habitual', (compras_n>=2 or n_saidas>=3),
    'sem_mov', (n_mov=0 and compras_n=0),
    'tendencia', case when s30=0 and s60=0 then null when s30>s60*1.25 then 'crescente' when s30<s60*0.75 then 'decrescente' else 'estavel' end,
    's30',s30,'s60',s60
  ) order by cat, nome),'[]'::jsonb) into r from linhas;
  return r;
end $$;

create or replace function ri_criar(p_loja text, p_solic text, p_dias int, p_valid_dias int, p_origem text, p_por text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v ri_conf;
begin
  if coalesce(trim(p_solic),'')='' then raise exception 'Informe o responsável pela requisição.'; end if;
  if p_loja not in ('Amore CD','Amore Paiva','Flow CD') then raise exception 'Loja inválida.'; end if;
  insert into ri_conf(origem,loja,solicitante,dias,validade,criado_por)
  values (coalesce(p_origem,'link'), p_loja, trim(p_solic), greatest(coalesce(p_dias,90),7),
          case when coalesce(p_origem,'link')='link' then now()+make_interval(days=>greatest(coalesce(p_valid_dias,7),1)) end, p_por)
  returning * into v;
  perform ri_aud(v.id,'criou',p_por,format('%s · %s · %s dias',v.origem,v.loja,v.dias));
  return jsonb_build_object('id',v.id,'token',v.token);
end $$;

create or replace function ri_abrir(p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v ri_conf; rq record; tl jsonb; base jsonb := '[]';
begin
  select * into v from ri_conf where token=p_token;
  if not found then return jsonb_build_object('erro','invalido'); end if;
  if v.status='cancelada' then return jsonb_build_object('erro','cancelado','loja',v.loja,'solicitante',v.solicitante); end if;
  if v.status in ('aguardando','em_preenchimento') and v.validade is not null and v.validade<now() then
    return jsonb_build_object('erro','expirado','loja',v.loja,'solicitante',v.solicitante,'validade',v.validade);
  end if;
  if v.status='aguardando' then
    update ri_conf set status='em_preenchimento', aberto_em=now(), updated_at=now() where id=v.id;
    perform ri_aud(v.id,'abriu',v.solicitante,null);
    v.status:='em_preenchimento';
  end if;
  if v.status='enviada' then
    select r.numero, r.status, r.pedido_status, r.titulo into rq from requisicoes r where r.id=v.requisicao_id;
    select coalesce(jsonb_agg(jsonb_build_object('tipo',t.tipo,'descricao',t.descricao,'em',t.created_at) order by t.created_at),'[]') into tl
      from req_timeline t where t.requisicao_id=v.requisicao_id;
    return jsonb_build_object('id',v.id,'status','enviada','loja',v.loja,'solicitante',v.solicitante,'protocolo',v.protocolo,
      'enviado_em',v.enviado_em,'requisicao_numero',v.requisicao_numero,'req_status',rq.status,'pedido_status',rq.pedido_status,
      'timeline',tl,'itens',coalesce((select jsonb_agg(x - 'saldo' - 'consumo_mensal' - 'ult_mov') from jsonb_array_elements(v.itens_final) x),'[]'::jsonb));
  end if;
  base := ri_base(v.loja, v.dias);
  return jsonb_build_object('id',v.id,'status',v.status,'loja',v.loja,'solicitante',v.solicitante,'dias',v.dias,
    'validade',v.validade,'itens',v.itens,'base',(select coalesce(jsonb_agg(x - 'saldo' - 'min' - 'ideal'),'[]'::jsonb) from jsonb_array_elements(base) x),'updated_at',v.updated_at);
end $$;

create or replace function ri_catalogo(p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v ri_conf; r jsonb;
begin
  select * into v from ri_conf where token=p_token and status in ('aguardando','em_preenchimento');
  if not found then return '[]'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('k',k,'nome',nome,'cat',cat,'un',un) order by nome),'[]') into r from (
    select ri_norm(e.nome) k, (array_agg(e.nome order by length(e.nome)))[1] nome, coalesce(max(e.categoria),'Sem categoria') cat,
      coalesce((select m.unidade from estoque_movimentacoes m where ri_norm(m.produto_nome)=ri_norm(e.nome) and m.unidade is not null order by m.created_at desc limit 1),'Unidade') un
    from estoque_produtos e where coalesce(e.ativo,true) and ri_norm(e.nome)<>''
      and ri_norm(e.nome) not in (select x->>'k' from jsonb_array_elements(ri_base(v.loja,v.dias)) x)
    group by ri_norm(e.nome), e.nome
  ) q;
  return r;
end $$;

create or replace function ri_salvar(p_token text, p_itens jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v ri_conf;
begin
  select * into v from ri_conf where token=p_token for update;
  if not found then raise exception 'Link inválido.'; end if;
  if v.status not in ('aguardando','em_preenchimento') then raise exception 'Esta requisição já foi encerrada.'; end if;
  if v.validade is not null and v.validade<now() then raise exception 'Link expirado.'; end if;
  update ri_conf set itens=coalesce(p_itens,'[]'), status='em_preenchimento', updated_at=now() where id=v.id;
end $$;

create or replace function ri_finalizar(p_token text, p_itens jsonb, p_por text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v ri_conf; base jsonb; snap jsonb := '[]'; x jsonb; b jsonb; n_pedir int := 0; n_conf int := 0;
  prot text; rq requisicoes; qtd numeric; fis numeric; por text;
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
  prot := 'RI-'||to_char(now(),'YYYY')||'-'||lpad(nextval('ri_seq')::text,6,'0');
  insert into requisicoes(loja,titulo,status,prioridade,responsavel_nome,created_by,observacoes,total_estimado,total_final)
  values (v.loja,'Requisição Inteligente '||prot||' — '||v.solicitante,'enviada','media',v.solicitante,
          case when v.origem='link' then 'Link: '||v.solicitante else por end,
          'Gerada pela Requisição Inteligente ('||prot||'), origem '||v.origem||'. '||n_conf||' produto(s) conferido(s), '||n_pedir||' a repor.',0,0)
  returning * into rq;
  insert into requisicao_itens(requisicao_id,produto_nome,categoria,quantidade,unidade,status,observacoes)
  select rq.id, s->>'nome', s->>'cat', (s->>'qtd')::numeric, coalesce(s->>'un','Unidade'), 'pendente',
         nullif(concat_ws(' · ', case when (s->>'extra')::boolean then 'Produto incluído manualmente' end,
           case when s->>'fisico' is not null then 'Estoque físico informado: '||(s->>'fisico') end, s->>'obs'),'')
  from jsonb_array_elements(snap) s where (s->>'qtd')::numeric>0;
  insert into req_timeline(requisicao_id,tipo,descricao,usuario) values
    (rq.id,'criacao','Requisição criada automaticamente pela Requisição Inteligente ('||prot||') — solicitante '||v.solicitante,por),
    (rq.id,'envio','Enviada para análise e aprovação via '||case when v.origem='link' then 'link individual' else 'painel' end||' ('||n_pedir||' item(ns) a repor, '||n_conf||' conferidos)',por);
  insert into req_auditoria(requisicao_id,entidade,entidade_id,campo,valor_novo,acao,usuario)
  values (rq.id,'requisicao',rq.id,'(requisição)','Criada pela Requisição Inteligente '||prot||' com '||n_pedir||' item(ns)','criacao',por);
  update ri_conf set status='enviada', itens=coalesce(p_itens,'[]'), itens_final=snap, protocolo=prot, requisicao_id=rq.id,
    requisicao_numero=rq.numero, enviado_em=now(), enviado_por=por, updated_at=now() where id=v.id;
  perform ri_aud(v.id,'enviou',por,format('%s · req #%s · %s conferidos · %s a repor',prot,rq.numero,n_conf,n_pedir));
  return jsonb_build_object('protocolo',prot,'numero',rq.numero,'requisicao_id',rq.id,'conferidos',n_conf,'a_repor',n_pedir);
end $$;

create or replace function ri_cancelar(p_id uuid, p_por text, p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
declare v ri_conf;
begin
  select * into v from ri_conf where id=p_id for update;
  if not found then raise exception 'Registro não encontrado.'; end if;
  if v.status='enviada' then raise exception 'Já enviada — cancele a requisição oficial pelo módulo de Requisições.'; end if;
  update ri_conf set status='cancelada', cancelado_por=p_por, cancelado_em=now(), motivo_cancel=p_motivo, updated_at=now() where id=p_id;
  perform ri_aud(p_id,'cancelou',p_por,p_motivo);
end $$;

create or replace function ri_renovar(p_id uuid, p_dias int, p_por text) returns void
language plpgsql security definer set search_path=public as $$
begin
  update ri_conf set validade=now()+make_interval(days=>greatest(coalesce(p_dias,7),1)), updated_at=now()
   where id=p_id and status in ('aguardando','em_preenchimento');
  perform ri_aud(p_id,'renovou validade',p_por,p_dias||' dia(s)');
end $$;

create or replace function ri_ocorrencia(p_conf uuid, p_k text, p_por text, p_obs text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v ri_conf; l jsonb; id uuid;
begin
  select * into v from ri_conf where id=p_conf;
  if not found then raise exception 'Registro não encontrado.'; end if;
  select e into l from jsonb_array_elements(coalesce(v.itens_final,'[]')) e where e->>'k'=p_k limit 1;
  if l is null then raise exception 'Produto não encontrado na conferência.'; end if;
  insert into ri_ocorrencias(conf_id,loja,produto,unidade,saldo_sistema,qtd_fisica,diferenca,obs,criado_por)
  values (p_conf,v.loja,l->>'nome',l->>'un',(l->>'saldo')::numeric,nullif(l->>'fisico','')::numeric,nullif(l->>'diferenca','')::numeric,p_obs,p_por)
  on conflict (conf_id,produto) do update set obs=excluded.obs returning ri_ocorrencias.id into id;
  perform ri_aud(p_conf,'ocorrência de divergência',p_por,(l->>'nome')||' · dif. '||coalesce(l->>'diferenca','?'));
  return id;
end $$;

grant execute on function ri_norm(text), ri_loja(text), ri_abrir(text), ri_catalogo(text), ri_salvar(text,jsonb), ri_finalizar(text,jsonb,text) to anon, authenticated;
grant execute on function ri_base(text,int), ri_criar(text,text,int,int,text,text), ri_cancelar(uuid,text,text), ri_renovar(uuid,int,text), ri_ocorrencia(uuid,text,text,text), ri_aud(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
create or replace function ri_notificado(p_token text) returns void language plpgsql security definer set search_path=public as $$
declare v ri_conf;
begin
  select * into v from ri_conf where token=p_token and status='enviada' and notificado_em is null;
  if not found then return; end if;
  update ri_conf set notificado_em=now(), notificado_por='automático (ao finalizar)' where id=v.id;
  perform ri_aud(v.id,'aprovadores avisados automaticamente',v.solicitante,'Wagner + Aline');
end $$;
grant execute on function ri_notificado(text) to anon, authenticated;
notify pgrst, 'reload schema';

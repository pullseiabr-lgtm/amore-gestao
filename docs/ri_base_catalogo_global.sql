create or replace function ri_base(p_loja text, p_dias int default 90) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare d int := greatest(coalesce(p_dias,90),1); v_ini timestamptz; r jsonb;
begin
  v_ini := now() - make_interval(days => d);
  with est as (
    select ri_norm(nome) k, (array_agg(nome order by length(nome)))[1] nome, (array_agg(categoria order by (categoria='Geral'), nivel_atual desc))[1] cat,
           sum(coalesce(nivel_atual,0)) saldo, max(nivel_minimo) mn, max(nivel_ideal) ide
    from estoque_produtos where coalesce(ativo,true) and loja=p_loja group by 1
  ), cat as (
    select ri_norm(nome) k, (array_agg(nome order by length(nome)))[1] nome, (array_agg(categoria order by (categoria='Geral'), nivel_atual desc))[1] cat
    from estoque_produtos where coalesce(ativo,true) and loja in ('Amore CD','Amore Paiva','Flow CD') and ri_norm(nome)<>'' group by 1
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
    union select k from cat
    union select k from mv where n_mov>0
    union select k from pd where n_ped>0
    union select k from cx where n_cx>0
  ), linhas as (
    select c.k,
      coalesce(est.nome, cat.nome, pd.nome, mv.nome, cx.nome) nome,
      coalesce(est.cat, cat.cat, 'Sem categoria') cat,
      coalesce(mv.un, pd.un, cx.un, 'Unidade') un,
      coalesce(est.saldo,0) saldo, est.mn, est.ide, (est.k is not null) no_cadastro,
      coalesce(mv.entradas,0) entradas, coalesce(mv.saidas,0) saidas, coalesce(mv.s30,0) s30, coalesce(mv.s60,0) s60,
      coalesce(mv.n_mov,0) n_mov, coalesce(mv.n_saidas,0) n_saidas, mv.ult_mov,
      coalesce(pd.n_ped,0)+coalesce(cx.n_cx,0) compras_n,
      coalesce(pd.qtd_ped,0)+coalesce(cx.qtd_cx,0) compras_qtd,
      greatest(pd.ult_ped, cx.ult_cx::timestamptz, mv.ult_entrada) ult_compra
    from chaves c left join est on est.k=c.k left join cat on cat.k=c.k left join mv on mv.k=c.k left join pd on pd.k=c.k left join cx on cx.k=c.k
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
notify pgrst, 'reload schema';

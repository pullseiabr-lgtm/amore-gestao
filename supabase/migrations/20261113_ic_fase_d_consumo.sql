-- Inteligência de Compras — Fase D: consumo REAL (baixas, perdas, transferências enviadas) e saldo atual
create or replace function ic_loja(l text) returns text language sql immutable as $$
  select case when upper(coalesce(l,'')) in ('AMORE COSTA DOURADA') then 'Amore CD'
              when upper(coalesce(l,'')) = 'FLOW PAIVA' then 'Amore Paiva'
              when upper(coalesce(l,'')) = 'FLOW COSTA DOURADA' then 'Flow CD' else l end $$;

drop view if exists v_ic_consumo_real;
create view v_ic_consumo_real with (security_invoker = on) as
select 'saida'::text as origem, m.id as origem_id, ic_loja(m.loja) as loja, m.created_at::date as data, ic_norm(m.produto_nome) as produto_key,
       ic_unid_base(m.unidade) as un_base, abs(m.quantidade) * ic_unid_fator(m.unidade) as qtd_base
from estoque_movimentacoes m where m.tipo = 'saida' and m.quantidade <> 0
union all
select 'perda', p.id, ic_loja(p.loja), p.created_at::date, ic_norm(p.produto_nome), ic_unid_base(p.unidade), abs(p.quantidade) * ic_unid_fator(p.unidade)
from estoque_perdas p where p.quantidade <> 0
union all
select 'transferencia', i.id, ic_loja(t.unidade_origem), coalesce(t.enviado_em, t.created_at)::date, ic_norm(i.produto_nome), ic_unid_base(i.unidade), i.qtd_enviada * ic_unid_fator(i.unidade)
from transferencia_itens i join transferencias t on t.id = i.transferencia_id
where coalesce(i.qtd_enviada,0) > 0 and t.status in ('enviada','em_transito','recebida','concluida','recebida_parcial');

drop view if exists v_ic_estoque_atual;
create view v_ic_estoque_atual with (security_invoker = on) as
select ic_loja(loja) as loja, ic_norm(nome) as produto_key, nivel_atual, nivel_minimo, nome
from estoque_produtos where coalesce(ativo, true);
grant select on v_ic_consumo_real, v_ic_estoque_atual to authenticated;

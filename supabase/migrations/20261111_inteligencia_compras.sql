-- Inteligência de Compras: view normalizada sobre caixa_itens (Prestação de Contas)
create or replace function ic_norm(t text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(
    upper(translate(coalesce(t,''),'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    '[^A-Z0-9 .,]',' ','g'),
    '\m(KG|UN|UND|UNID|UNIDADE|PCT|CX|TIPO|TP|NAC|TRAD|REF|1A|2A|FD|PET|CASEIRO|CASEIRA)\M',' ','g'),
    '\s+',' ','g'))
$$;

create or replace function ic_forn_norm(t text) returns text language sql immutable as $$
  select case
    when t is null or trim(t)='' then 'NÃO INFORMADO'
    when upper(t) ~ '(WMS|ATACAD)' then 'ATACADÃO'
    when upper(t) ~ 'PRASO' then 'PRASO'
    when upper(t) ~ '(COCA-?COLA|COCA COLA)' then 'COCA-COLA'
    when upper(t) ~ 'NORSA' then 'NORSA'
    else trim(regexp_replace(regexp_replace(upper(translate(split_part(t,'(',1),'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),'\m(LTDA|LTDAL|S\.?A\.?|ME|EPP|EIRELI)\M|[^A-Z0-9 &]',' ','g'),'\s+',' ','g'))
  end
$$;

drop view if exists v_ic_compras;
create view v_ic_compras with (security_invoker = on) as
with base as (
  select i.id, i.caixa_id, c.loja, c.titulo as caixa_titulo, c.status as caixa_status, c.created_by,
         i.data, i.fornecedor, i.descricao, i.categoria, i.quantidade, i.unidade, i.conteudo, i.valor, i.documento, i.created_at,
         ic_norm(i.descricao) as produto_key,
         ic_forn_norm(i.fornecedor) as fornecedor_key,
         lower(coalesce(i.unidade,'')) as u,
         case when coalesce(i.conteudo,0) > 0 then i.conteudo else 1 end as cont
  from caixa_itens i join caixas c on c.id = i.caixa_id
),
calc as (
  select b.*,
    case when u='kg' or u='g' then 'kg'
         when u in ('l','lt') or (u='ml' and cont>1) then 'L'
         else 'un' end as un_base,
    case when u='kg' then quantidade
         when u='g' then quantidade*cont/1000.0
         when u in ('l','lt') then quantidade
         when u='ml' and cont>1 then quantidade*cont/1000.0
         when u in ('cx','dz','pct') then quantidade*cont
         else quantidade end as qtd_base,
    case when u<>'' then u||'x'||trim(trailing '.' from trim(trailing '0' from cont::text)) else null end as embalagem,
    row_number() over (partition by loja, data, produto_key, round(valor,2), fornecedor_key, coalesce(quantidade,0) order by created_at, id) as rn
  from base b
)
select k.id, k.caixa_id, k.loja, k.data, k.fornecedor, k.fornecedor_key, k.descricao, k.produto_key,
  case when k.categoria ilike 'combust%' then 'Combustível' when k.categoria ilike 'pedagio' then 'Pedágio' else coalesce(nullif(k.categoria,''),'Outros') end as categoria,
  k.quantidade, k.unidade, k.conteudo, k.un_base, k.qtd_base, k.embalagem, k.valor, k.documento,
  case when k.qtd_base>0 and k.valor>0 then round(k.valor/k.qtd_base,4) end as preco_base,
  (k.qtd_base>0 and k.valor>0) as preco_ok,
  (k.data is not null and k.data between date '2025-01-01' and current_date) as data_ok,
  (coalesce(k.categoria,'') !~* '(combust|pedagio|transporte|manuten|servic)' and k.produto_key !~ '(PEDAGIO|GASOLINA|COMPRA NOTA|DIMENAS)' and k.fornecedor_key !~ '^(LOJA FLOW|AMORE|FLOW|LOJA AMORE)') as eh_produto,
  p.prestacao_id, p.responsavel_nome as responsavel, k.caixa_titulo, k.caixa_status
from calc k
left join lateral (
  select l.prestacao_id, pr.responsavel_nome
  from fin_lancamentos l join fin_prestacoes pr on pr.id = l.prestacao_id
  where pr.loja = k.loja and l.valor = k.valor and l.data_compra = k.data
  order by pr.data_prestacao desc nulls last limit 1
) p on true
where k.rn = 1;

grant select on v_ic_compras to authenticated, anon;

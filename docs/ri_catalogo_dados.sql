-- Ajuste do catálogo (Amore CD e Amore Paiva): Carnes, Congelados/Polpas, batata palito, duplicidades
do $$
declare l text; r record; k text; nm text; i int;
  v_polpas text[][] := array[['abacaxi','POLPA DE ABACAXI'],['acerola','POLPA DE ACEROLA'],['caju','POLPA DE CAJU'],['caja','POLPA DE CAJA'],['graviola','POLPA DE GRAVIOLA'],['maracuja','POLPA DE MARACUJA'],['morango','POLPA DE MORANGO'],['tangerina','POLPA DE TANGERINA']];
  v_carnes text[][] := array[['file de linguado%','FILÉ DE LINGUADO CX 20KG'],['file mignon kg','FILÉ MIGNON KG'],['alcatra','ALCATRA'],['file de peito de frango','FILÉ DE PEITO DE FRANGO'],['frango em cubos','FRANGO EM CUBOS'],['camarao 21 22%','CAMARÃO 21/22'],['salmao fresco%','SALMÃO FRESCO'],['picanha importada leve','PICANHA IMPORTADA LEVE']];
begin
  foreach l in array array['Amore CD','Amore Paiva'] loop
    -- Peixe branco -> substituído por filé de linguado
    for r in select * from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome) like 'peixe branco%' loop
      update estoque_produtos set ativo=false, updated_at=now() where id=r.id;
      insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
      values ('exclusao',l,r.id,r.nome,'ativo','{"ativo":true}','{"ativo":false}','Ajuste catálogo (substituído por Filé de Linguado)');
    end loop;
    -- Carnes
    for i in 1..array_length(v_carnes,1) loop
      k:=v_carnes[i][1]; nm:=v_carnes[i][2];
      if k='file de peito de frango' then
        select * into r from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome) in ('peito de frango','file de peito de frango') order by nivel_atual desc limit 1;
      else
        select * into r from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome) like k order by nivel_atual desc limit 1;
      end if;
      if found then
        if r.categoria is distinct from 'Carnes' then
          update estoque_produtos set categoria='Carnes', updated_at=now() where id=r.id;
          insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
          values ('edicao',l,r.id,r.nome,'categoria',jsonb_build_object('categoria',r.categoria),'{"categoria":"Carnes"}','Ajuste catálogo');
        end if;
      else
        insert into estoque_produtos(loja,nome,categoria,gramatura) values (l,nm,'Carnes','Quilograma(s)') returning * into r;
        insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
        values ('criacao',l,r.id,nm,'(produto)',null,'{"categoria":"Carnes"}','Ajuste catálogo');
      end if;
    end loop;
    -- Congelados: polpas
    for i in 1..array_length(v_polpas,1) loop
      k:='^polpa (de )?'||v_polpas[i][1]||'$'; nm:=v_polpas[i][2];
      select * into r from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome) ~ k order by nivel_atual desc limit 1;
      if found then
        if r.categoria is distinct from 'Congelados' then
          update estoque_produtos set categoria='Congelados', updated_at=now() where id=r.id;
          insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
          values ('edicao',l,r.id,r.nome,'categoria',jsonb_build_object('categoria',r.categoria),'{"categoria":"Congelados"}','Ajuste catálogo');
        end if;
      else
        insert into estoque_produtos(loja,nome,categoria,gramatura) values (l,nm,'Congelados','Unidade(s)') returning * into r;
        insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
        values ('criacao',l,r.id,nm,'(produto)',null,'{"categoria":"Congelados"}','Ajuste catálogo');
      end if;
    end loop;
    -- Batata palito 7 mm
    select * into r from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome) in ('batata 7mm','batata palito 7mm') limit 1;
    if found then
      update estoque_produtos set nome='BATATA PALITO 7MM', categoria='Congelados', updated_at=now() where id=r.id;
      update estoque_movimentacoes set produto_nome='BATATA PALITO 7MM' where produto_id=r.id;
      insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
      values ('edicao',l,r.id,'BATATA PALITO 7MM','nome/categoria',jsonb_build_object('nome',r.nome,'categoria',r.categoria),'{"nome":"BATATA PALITO 7MM","categoria":"Congelados"}','Ajuste catálogo');
    else
      insert into estoque_produtos(loja,nome,categoria,gramatura) values (l,'BATATA PALITO 7MM','Congelados','Unidade(s)');
    end if;
  end loop;
  update estoque_produtos set categoria='Carnes', updated_at=now() where loja='Amore Paiva' and categoria='Acougue' and coalesce(ativo,true);
  update estoque_produtos set categoria='Mercearia' where categoria='MERCEARIA' and loja in ('Amore CD','Amore Paiva','Flow CD');
  update estoque_produtos set categoria='Hortifruti' where categoria='HORTIFRUTI' and loja in ('Amore CD','Amore Paiva','Flow CD');
  update estoque_produtos set categoria='Descartáveis' where categoria='Descartaveis' and loja in ('Amore CD','Amore Paiva','Flow CD');
end $$;

-- Duplicados reais na mesma loja: mantém 1 linha (a com movimentação / categoria específica) e inativa as demais
with d as (
  select e.id, e.loja, e.nome, e.categoria,
    row_number() over (partition by e.loja, ri_norm(e.nome) order by (select count(*) from estoque_movimentacoes m where m.produto_id=e.id) desc, (e.categoria='Geral'), e.nivel_atual desc, e.created_at) rn,
    count(*) over (partition by e.loja, ri_norm(e.nome)) n,
    first_value(e.categoria) over (partition by e.loja, ri_norm(e.nome) order by (e.categoria='Geral'), e.created_at) melhor_cat
  from estoque_produtos e where coalesce(e.ativo,true) and e.loja in ('Amore CD','Amore Paiva','Flow CD')
), dup as (select * from d where n>1),
ins as (insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
  select 'exclusao',loja,id,nome,'ativo','{"ativo":true}','{"ativo":false}','Ajuste catálogo (duplicidade)' from dup where rn>1 returning 1),
off as (update estoque_produtos e set ativo=false, updated_at=now() from dup where dup.id=e.id and dup.rn>1 returning e.id)
update estoque_produtos e set categoria=dup.melhor_cat, updated_at=now() from dup where dup.id=e.id and dup.rn=1 and e.categoria is distinct from dup.melhor_cat;

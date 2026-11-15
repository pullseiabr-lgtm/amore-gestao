-- Açaí (Congelados) e nome correto do filé de peito de frango — Amore CD e Amore Paiva
do $$
declare l text; r record; keep uuid; nm text; i int;
begin
  foreach l in array array['Amore CD','Amore Paiva'] loop
    -- 1) Filé de peito de frango: renomeia o "PEITO DE FRANGO" (mantém saldo e histórico)
    for r in select * from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome)='peito de frango' loop
      update estoque_produtos set nome='FILÉ DE PEITO DE FRANGO', categoria='Carnes', updated_at=now() where id=r.id;
      update estoque_movimentacoes set produto_nome='FILÉ DE PEITO DE FRANGO' where produto_id=r.id;
      insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
      values ('edicao',l,r.id,'FILÉ DE PEITO DE FRANGO','nome',jsonb_build_object('nome',r.nome),'{"nome":"FILÉ DE PEITO DE FRANGO"}','Ajuste catálogo');
    end loop;
    -- 2) Polpa de açaí 400g e Açaí premium 5 litros -> Congelados, um registro cada
    for i in 1..2 loop
      nm := case i when 1 then 'POLPA DE AÇAI 400G' else 'AÇAI PREMIUM 5 LITROS' end;
      select id into keep from estoque_produtos where loja=l and coalesce(ativo,true)
        and ((i=1 and ri_norm(nome) in ('acai polpa 400g','polpa de acai 400g')) or (i=2 and ri_norm(nome) in ('acai premium cx 5 litros','acai premium 5l','acai premium 5 litros','acai premium 5 l')))
      order by (select count(*) from estoque_movimentacoes m where m.produto_id=estoque_produtos.id) desc, nivel_atual desc limit 1;
      if keep is null then
        insert into estoque_produtos(loja,nome,categoria,gramatura) values (l,nm,'Congelados','Unidade(s)') returning id into keep;
        insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario) values ('criacao',l,keep,nm,'(produto)',null,'{"categoria":"Congelados"}','Ajuste catálogo');
      else
        select * into r from estoque_produtos where id=keep;
        update estoque_produtos set nome=nm, categoria='Congelados', updated_at=now() where id=keep;
        update estoque_movimentacoes set produto_nome=nm where produto_id=keep;
        insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
        values ('edicao',l,keep,nm,'nome/categoria',jsonb_build_object('nome',r.nome,'categoria',r.categoria),jsonb_build_object('nome',nm,'categoria','Congelados'),'Ajuste catálogo');
        -- demais linhas equivalentes (duplicidade) -> inativa
        for r in select * from estoque_produtos where loja=l and coalesce(ativo,true) and id<>keep
          and ((i=1 and ri_norm(nome) in ('acai polpa 400g','polpa de acai 400g')) or (i=2 and ri_norm(nome) in ('acai premium cx 5 litros','acai premium 5l','acai premium 5 litros','acai premium 5 l'))) loop
          update estoque_produtos set ativo=false, updated_at=now() where id=r.id;
          insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
          values ('exclusao',l,r.id,r.nome,'ativo','{"ativo":true}','{"ativo":false}','Ajuste catálogo (duplicidade)');
        end loop;
      end if;
    end loop;
  end loop;
end $$;

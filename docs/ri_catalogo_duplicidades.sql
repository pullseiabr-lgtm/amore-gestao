-- Limpeza de duplicidades por nome parecido (mesmo produto, grafia diferente) — mantém categorias
-- Regra: mantém 1 linha (a com saldo/movimentação), repassa o histórico (movimentações) e inativa as de saldo 0.
-- Linhas duplicadas COM saldo diferente de zero não são mexidas (conferência manual).
do $$
declare l text; g text[]; r record; keeper estoque_produtos; cat_boa text; ids uuid[];
  grupos text[] := array[
    'fanta uva 350ml lata un fd6un|fanta uva 350ml lata fd6un',
    'coca cola lata normal 350ml|coca normal lata 350ml',
    'coca cola lata zero 350ml|coca lata 350ml zero',
    'queijo mussarela fatiado 1kg|queijo mussarela fatiado kg',
    'detergente 5l|detergente 5lt',
    'maionese vigor bisnaga 1 5|maionese 1 5 bisnaga',
    'leite de coco so coco|leite de coco sococo 1l|leite coco sococo',
    'balde de gordura|balde de gordura 14 5',
    'amaciante de carne|amaciante de carnes 1kg|amaciante de carne 1kg',
    'feijao preto 1kg|feijao preto|feijao preto pct1kg',
    'molho tare sache un cx250un|molho tare sache cx250un',
    'vinho san martin|vinho san martin 1l',
    'arroz parboilizado 1kg|arroz parbolizado 1kg',
    'vinagre de arroz 5l|vinagrede arroz 5l',
    'wasabi em po 1kg|wasabi em po powder 1kg',
    'laranja pera|laranja pera 1kg',
    'farinha panko 1kg|farinha panko kg',
    'abobrinha|abobrinha 1kg',
    'cebolinho|cebolinho moi',
    'cenoura|cenoura 1a',
    'fanta laranja lata 350ml|fanta lata 350ml',
    'molho tomate manjericao|molho de tomate manjericao 300g',
    'cafe capsula expresso supremo|cafe capsula supremo',
    'pastilhas azul forno|pastilhas azul',
    'sprite lemo fresh|sprit lemon fresh'
  ];
  i int;
begin
  foreach l in array array['Amore CD','Amore Paiva','Flow CD'] loop
    for i in 1..array_length(grupos,1) loop
      g := string_to_array(grupos[i],'|');
      select array_agg(id) into ids from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome)=any(g);
      if ids is null or array_length(ids,1)<2 then continue; end if;
      select * into keeper from estoque_produtos where id=any(ids)
        order by nivel_atual desc, (select count(*) from estoque_movimentacoes m where m.produto_id=estoque_produtos.id) desc, (categoria in ('Geral','Outros','Entrada manual','Transferência')), created_at limit 1;
      select categoria into cat_boa from estoque_produtos where id=any(ids) and categoria not in ('Geral','Outros','Entrada manual','Transferência') order by (id=keeper.id) desc limit 1;
      for r in select * from estoque_produtos where id=any(ids) and id<>keeper.id loop
        if coalesce(r.nivel_atual,0)=0 then
          update estoque_movimentacoes set produto_id=keeper.id, produto_nome=keeper.nome where produto_id=r.id;
          update estoque_produtos set ativo=false, updated_at=now() where id=r.id;
          insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
          values ('exclusao',l,r.id,r.nome,'ativo',jsonb_build_object('ativo',true,'mantido',keeper.nome),'{"ativo":false}','Ajuste catálogo (duplicidade similar)');
        else
          insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
          values ('edicao',l,r.id,r.nome,'duplicidade pendente',jsonb_build_object('par',keeper.nome),null,'Ajuste catálogo (duplicidade com saldo — conferir)');
        end if;
      end loop;
      if cat_boa is not null and keeper.categoria is distinct from cat_boa then
        update estoque_produtos set categoria=cat_boa, updated_at=now() where id=keeper.id;
      end if;
    end loop;
  end loop;
end $$;

-- Coca-Cola padronizada (350 lata), Cubos de frango em Aves, polpa de tangerina fora de Bebidas
create or replace function ri_unir_produtos(p_keep uuid, p_drop uuid, p_motivo text) returns void
language plpgsql as $$
declare k estoque_produtos; d estoque_produtos;
begin
  select * into k from estoque_produtos where id=p_keep; select * into d from estoque_produtos where id=p_drop;
  if k.id is null or d.id is null or k.id=d.id then return; end if;
  update estoque_movimentacoes set produto_id=k.id, produto_nome=k.nome where produto_id=d.id;
  update estoque_produtos set nivel_atual=coalesce(nivel_atual,0)+coalesce(d.nivel_atual,0), updated_at=now() where id=k.id;
  update estoque_produtos set ativo=false, nivel_atual=0, updated_at=now() where id=d.id;
  insert into estoque_produto_logs(acao,loja,produto_id,produto_nome,campo_alterado,antes,depois,usuario)
  values ('exclusao',d.loja,d.id,d.nome,'unido a '||k.nome,jsonb_build_object('ativo',true,'saldo',d.nivel_atual),'{"ativo":false}',p_motivo);
end $$;

do $$
declare l text; r record; kn uuid; kz uuid; x uuid;
begin
  foreach l in array array['Amore CD','Amore Paiva','Flow CD'] loop
    -- Normal 350 lata
    select id into kn from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome) in ('coca normal lata 350ml','coca cola normal 350 lata','refrigerante coca cola pack 12x350ml','coca cola lt 350ml')
      order by nivel_atual desc, (select count(*) from estoque_movimentacoes m where m.produto_id=estoque_produtos.id) desc limit 1;
    if kn is null then
      insert into estoque_produtos(loja,nome,categoria,gramatura) values (l,'COCA COLA NORMAL 350 LATA','Bebidas','Unidade(s)') returning id into kn;
    else
      update estoque_produtos set nome='COCA COLA NORMAL 350 LATA', categoria='Bebidas', updated_at=now() where id=kn;
    end if;
    for x in select id from estoque_produtos where loja=l and coalesce(ativo,true) and id<>kn and (ri_norm(nome) in ('coca normal lata 350ml','coca cola lt 350ml','refrigerante coca cola pack 12x350ml','coca cola 350ml lata un fd12un','coca cola lata normal 350ml') or (l='Flow CD' and ri_norm(nome)='coca cola')) loop
      perform ri_unir_produtos(kn, x, 'Ajuste catálogo (Coca-Cola padronizada)');
    end loop;
    -- Zero 350 lata
    select id into kz from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome) in ('coca cola lata zero 350ml','coca lata 350ml zero','coca cola zero 350 lata','refrigerante coca cola zero pack 12x350ml')
      order by nivel_atual desc, (select count(*) from estoque_movimentacoes m where m.produto_id=estoque_produtos.id) desc limit 1;
    if kz is null then
      insert into estoque_produtos(loja,nome,categoria,gramatura) values (l,'COCA COLA ZERO 350 LATA','Bebidas','Unidade(s)') returning id into kz;
    else
      update estoque_produtos set nome='COCA COLA ZERO 350 LATA', categoria='Bebidas', updated_at=now() where id=kz;
    end if;
    for x in select id from estoque_produtos where loja=l and coalesce(ativo,true) and id<>kz and ri_norm(nome) in ('coca cola lata zero 350ml','coca lata 350ml zero','refrigerante coca cola zero pack 12x350ml') loop
      perform ri_unir_produtos(kz, x, 'Ajuste catálogo (Coca-Cola padronizada)');
    end loop;
    -- Zero cafeína
    if not exists (select 1 from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome)='coca zero cafeina lata 350') then
      insert into estoque_produtos(loja,nome,categoria,gramatura) values (l,'COCA ZERO CAFEINA LATA 350','Bebidas','Unidade(s)');
    end if;
    -- KS ficam como estão (só garante a categoria Bebidas)
    update estoque_produtos set categoria='Bebidas', updated_at=now() where loja=l and coalesce(ativo,true) and (ri_norm(nome) like 'coca cola%290ml%ks%' or ri_norm(nome) like 'coca ks%' or ri_norm(nome)='coca cola 500ml');
  end loop;

  -- Polpa de tangerina não é bebida: une "POUPA DE TANGERINA" (Bebidas) à POLPA TANGERINA (Congelados)
  for r in select e.id drop_id, (select id from estoque_produtos k where k.loja=e.loja and coalesce(k.ativo,true) and ri_norm(k.nome)='polpa tangerina' limit 1) keep_id
           from estoque_produtos e where coalesce(e.ativo,true) and ri_norm(e.nome)='poupa de tangerina' loop
    if r.keep_id is not null then perform ri_unir_produtos(r.keep_id, r.drop_id, 'Ajuste catálogo (polpa de tangerina fora de Bebidas)'); end if;
  end loop;

  -- Cubos de frango em Aves (kg)
  update estoque_produtos set nome='CUBOS DE FRANGO', categoria='Aves', gramatura='Quilograma(s)', updated_at=now()
   where coalesce(ativo,true) and loja in ('Amore CD','Amore Paiva') and ri_norm(nome)='frango em cubos';
  foreach l in array array['Flow CD'] loop
    if not exists (select 1 from estoque_produtos where loja=l and coalesce(ativo,true) and ri_norm(nome)='cubos de frango') then
      insert into estoque_produtos(loja,nome,categoria,gramatura) values (l,'CUBOS DE FRANGO','Aves','Quilograma(s)');
    end if;
  end loop;
end $$;

-- Estimativa de gasto salva por requisição (qualquer status ativo), sem mudar o status. Só o painel (autenticado) chama.
create or replace function ri_salvar_estimativa(p_req uuid, p_itens jsonb, p_por text, p_obs text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare rq requisicoes; x jsonb; tot numeric; n_sem int;
begin
  select * into rq from requisicoes where id=p_req for update;
  if not found then raise exception 'Requisição não encontrada.'; end if;
  if rq.status in ('cancelada','concluida') then raise exception 'Requisição encerrada (status: %).', rq.status; end if;
  for x in select * from jsonb_array_elements(coalesce(p_itens,'[]')) loop
    update requisicao_itens set preco_referencia=nullif(x->>'preco','')::numeric where id=(x->>'id')::uuid and requisicao_id=p_req;
  end loop;
  select coalesce(sum(coalesce(preco_referencia,0)*quantidade),0), count(*) filter (where coalesce(preco_referencia,0)=0) into tot, n_sem
    from requisicao_itens where requisicao_id=p_req and status<>'cancelado';
  update requisicoes set total_estimado=tot, updated_at=now() where id=p_req;
  insert into req_timeline(requisicao_id,tipo,descricao,usuario)
  values (p_req,'ajuste','Estimativa de gasto atualizada pelo Setor de Compras ('||p_por||'): R$ '||to_char(tot,'FM999G990D00')||case when n_sem>0 then ' — '||n_sem||' item(ns) sem preço' else '' end||coalesce(' · '||nullif(p_obs,''),''),p_por);
  insert into req_auditoria(requisicao_id,entidade,entidade_id,campo,valor_novo,acao,usuario)
  values (p_req,'requisicao',p_req,'total_estimado','R$ '||to_char(tot,'FM999G990D00'),'alteracao',p_por);
  return jsonb_build_object('total',tot,'sem_preco',n_sem);
end $$;
grant execute on function ri_salvar_estimativa(uuid,jsonb,text,text) to authenticated;
revoke execute on function ri_salvar_estimativa(uuid,jsonb,text,text) from anon, public;
notify pgrst, 'reload schema';

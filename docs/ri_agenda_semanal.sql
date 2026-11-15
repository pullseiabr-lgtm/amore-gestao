-- Agenda semanal: gera o link da Requisição Inteligente para quem estiver em app_config 'ri_agenda_semanal'
-- Formato: [{"nome":"Silvan Mariano","fone":"5581997239704","loja":"Amore Paiva","ativo":true,"dias":90,"validade_dias":7}]
create or replace function ri_agenda_gerar() returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg jsonb; x jsonb; v ri_conf; out jsonb := '[]'; c jsonb;
begin
  select valor into cfg from app_config where chave='ri_agenda_semanal';
  for x in select * from jsonb_array_elements(coalesce(cfg,'[]')) loop
    if coalesce((x->>'ativo')::boolean,true) is false then continue; end if;
    -- idempotente no dia: se já gerou hoje para esse responsável/loja, reaproveita
    select * into v from ri_conf where origem='link' and criado_por='agenda semanal' and loja=x->>'loja'
      and lower(solicitante)=lower(x->>'nome') and created_at>=now()-interval '12 hours' and status in ('aguardando','em_preenchimento') order by created_at desc limit 1;
    if not found then
      c := ri_criar(x->>'loja', x->>'nome', coalesce((x->>'dias')::int,90), coalesce((x->>'validade_dias')::int,7), 'link', 'agenda semanal');
      select * into v from ri_conf where id=(c->>'id')::uuid;
    end if;
    out := out || jsonb_build_object('nome',x->>'nome','fone',x->>'fone','loja',x->>'loja','token',v.token,'validade',v.validade,'ja_gerado',false);
  end loop;
  return out;
end $$;
grant execute on function ri_agenda_gerar() to anon, authenticated;

insert into app_config(chave,valor) values ('ri_agenda_semanal',
  '[{"nome":"Silvan Mariano","fone":"5581997239704","loja":"Amore Paiva","ativo":true,"dias":90,"validade_dias":7}]'::jsonb)
on conflict (chave) do update set valor=excluded.valor;
notify pgrst, 'reload schema';

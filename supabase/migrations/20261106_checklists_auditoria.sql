-- Operação Padrão: histórico/auditoria
-- 1) execução guarda cópia dos itens (o histórico não muda quando o modelo é editado)
alter table checklist_execucoes add column if not exists itens_snapshot jsonb;
-- 2) excluir um modelo NÃO apaga mais o histórico de execuções
alter table checklist_execucoes drop constraint if exists checklist_execucoes_modelo_id_fkey;
alter table checklist_execucoes add constraint checklist_execucoes_modelo_id_fkey
  foreign key (modelo_id) references checklist_modelos(id) on delete set null;
-- 3) checklist concluído não pode ser excluído
create or replace function checklist_exec_no_delete() returns trigger as $$
begin
  if old.status = 'concluido' then raise exception 'Checklist concluído é arquivo de auditoria e não pode ser excluído'; end if;
  return old;
end; $$ language plpgsql;
drop trigger if exists trg_checklist_exec_no_delete on checklist_execucoes;
create trigger trg_checklist_exec_no_delete before delete on checklist_execucoes for each row execute function checklist_exec_no_delete();
-- 4) log de alterações dos modelos (quem criou/editou/excluiu itens e quando)
create table if not exists checklist_auditoria (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid,
  modelo_titulo text,
  acao text not null,
  usuario text,
  resumo text,
  itens_antes jsonb,
  itens_depois jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_checklist_aud_modelo on checklist_auditoria (modelo_id, created_at desc);
alter table checklist_auditoria enable row level security;
drop policy if exists "chk_aud_all" on checklist_auditoria;
create policy "chk_aud_all" on checklist_auditoria for all using (true) with check (true);

-- RNC de Operação (Central de Tarefas): mesmo cadastro da RNC de Recebimento, com origem/título/reincidência/validador
alter table rnc
  add column if not exists origem text,
  add column if not exists titulo text,
  add column if not exists reincidente_de uuid,
  add column if not exists validador text;
create index if not exists idx_rnc_origem on rnc(origem);
-- as RNCs abertas pelo checklist já nasceram da operação
update rnc set origem='checklist' where categoria='Checklist' and origem is null;

-- Operação Padrão: alerta WhatsApp no horário, justificativa de atraso, disparo/arquivo (Gestão à Vista)
alter table checklist_modelos
  add column if not exists hora_alerta text,
  add column if not exists alertar boolean not null default false,
  add column if not exists destinatarios jsonb not null default '[]'::jsonb;
alter table checklist_execucoes
  add column if not exists justificativa_atraso text,
  add column if not exists justificada_por text,
  add column if not exists justificada_em timestamptz,
  add column if not exists alerta_enviado_em timestamptz,
  add column if not exists atraso_alertado_em timestamptz,
  add column if not exists disparado_em timestamptz,
  add column if not exists arquivado_em timestamptz;

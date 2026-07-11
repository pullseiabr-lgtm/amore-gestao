import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const db = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const ATA_ID = 'd0928d1a-406f-4871-974a-f4b4d4090a4e'
const LOJA = 'Amore Paiva'
const today = new Date().toISOString().slice(0, 10)

const { data: acoes, error } = await db.from('atas_acoes').select('*').eq('ata_id', ATA_ID)
if (error) { console.error('ERRO ler ações:', error); process.exit(1) }

let criadas = 0
for (const ac of acoes) {
  if (ac.tarefa_id) { console.log('já tem tarefa:', ac.descricao); continue }
  const tarefa = {
    loja: LOJA,
    titulo: ac.descricao,
    descricao: 'Gerada da ata: Ata 001/2026 — Comitê Gestor · Unidade Paiva (30/06/2026)',
    setor: 'Geral', status: 'pendente', prioridade: 'media',
    responsavel_nome: ac.responsavel, solicitante_nome: 'Comitê Gestor',
    prazo: ac.prazo || null, observacoes: null, objetivo: null, envolvidos: null,
    competencia: null, data_inicio: null, entregaveis: null, anexos: null, tags: null,
    custo_previsto: null, custo_executado: null, resultado_esperado: null, resultado_final: null,
    dificuldades: null, iniciado_em: null, concluido_em: null,
    prazo_extensao_data: null, prazo_extensao_motivo: null, prazo_extensao_status: null,
    data_solicitacao: today, resultado_status: null, validado_por: null, validado_em: null,
    observacao_final: null, precisa_aprovacao: false, aprovado_por: null, aprovado_at: null,
    obs_aprovacao: null, reaberta: false, created_by: 'Importação (ATA 01)',
  }
  const { data: nova, error: e1 } = await db.from('tarefas').insert(tarefa).select('id').single()
  if (e1) { console.error('ERRO criar tarefa:', ac.descricao, e1.message); continue }
  await db.from('atas_acoes').update({ tarefa_id: nova.id }).eq('id', ac.id)
  criadas++
  console.log('tarefa criada:', ac.descricao, '->', ac.responsavel, ac.prazo || '(sem prazo)')
}
console.log('TOTAL tarefas criadas:', criadas)

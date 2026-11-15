import { supabase } from '../../lib/supabase'
import { fetchAppConfig, saveAppConfig } from '../../lib/db'

// Tabelas plt_* ainda não estão em types/database.ts → cliente destipado (como em Transferências/Créditos)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb = supabase as any

export type Item = { id: string; texto: string; ev: boolean; pront?: string; semEv?: boolean; tipo?: 'nome' }
export type Setor = { id: string; nome: string; itens: Item[] }
export type Resposta = { id?: string; plantao_id: string; setor_id: string; item_id: string; resposta: 'conforme' | 'nao_conforme' | 'na'; obs: string | null; evidencias: string[]; sem_evidencia: string | null; updated_by?: string }
export type Plantao = {
  id: string; numero: number; escala_id: string | null; loja: string; data: string; integrantes: string[]; versao: number; estrutura: Setor[]
  status: 'em_andamento' | 'encerrado'; chegada_em: string; saida_em: string | null; parecer: string | null; conformidade: number | null; relatorio_enviado_em: string | null; created_by: string | null
}
export type Escala = { id: string; data: string; dupla: string[]; lojas: string[]; horario: string | null; status: string; confirmados: string[]; motivo: string | null }
export type Ocorrencia = {
  id: string; numero: number; plantao_id: string | null; loja: string; setor_id: string | null; setor_nome: string | null; item_id: string | null; item_texto: string | null
  tipo: string | null; descricao: string; prioridade: string; evidencias: string[]; sem_evidencia: string | null; identificado_por: string | null; identificado_em: string
  status: string; reincidente: boolean; rnc_id: string | null; rnc_numero: string | null
  resp_setor: string | null; resp_nome: string | null; acao: string | null; prazo: string | null; exige_aprovacao: boolean; obs_gestao: string | null; evid_inicial: string[]
  encaminhado_em: string | null; concluido_em: string | null; concluido_por: string | null; obs_conclusao: string | null; evid_conclusao: string[]
}

export type PltConfig = {
  equipe: string[]
  duplas: string[][]
  tipos: string[]
  prazos: Record<string, number>          // dias por prioridade
  responsaveis: Record<string, string>    // setor/competência → nome do responsável padrão
}
export const CONFIG_PADRAO: PltConfig = {
  equipe: ['Aline', 'Aristela', 'Esdras', 'Wagner'],
  duplas: [['Aline', 'Esdras'], ['Aristela', 'Wagner'], ['Aline', 'Wagner'], ['Aristela', 'Esdras']],
  tipos: ['Estoque / ruptura', 'Limpeza e organização', 'Equipe e atendimento', 'Produção / mise en place', 'Estrutura e manutenção', 'Frente de loja', 'Bebidas', 'Tempo de produção', 'Segurança alimentar', 'Outros'],
  prazos: { baixa: 7, media: 2, alta: 1, critica: 0 },
  responsaveis: {},
}
export async function carregarConfig(): Promise<PltConfig> {
  const c = await fetchAppConfig<Partial<PltConfig>>('plt_config')
  return { ...CONFIG_PADRAO, ...(c || {}), prazos: { ...CONFIG_PADRAO.prazos, ...(c?.prazos || {}) } }
}
export const salvarConfig = (c: PltConfig) => saveAppConfig('plt_config', c)

export const PRIORIDADES = [
  { id: 'baixa', label: 'Baixa', emoji: '🟢', cor: '#16a34a' },
  { id: 'media', label: 'Média', emoji: '🟡', cor: '#ca8a04' },
  { id: 'alta', label: 'Alta', emoji: '🟠', cor: '#ea580c' },
  { id: 'critica', label: 'Crítica', emoji: '🔴', cor: '#dc2626' },
]
export const prio = (id: string) => PRIORIDADES.find(p => p.id === id) || PRIORIDADES[1]
export const STATUS_OC: { id: string; label: string; cor: string }[] = [
  { id: 'identificado', label: 'Identificado', cor: '#dc2626' },
  { id: 'encaminhado', label: 'Encaminhado', cor: '#7c3aed' },
  { id: 'em_execucao', label: 'Em execução', cor: '#2563eb' },
  { id: 'aguardando_validacao', label: 'Aguardando validação', cor: '#ca8a04' },
  { id: 'concluido', label: 'Concluído', cor: '#16a34a' },
]
export const stOc = (id: string) => STATUS_OC.find(s => s.id === id) || STATUS_OC[0]

// ── Datas / formatação ───────────────────────────────────────
export const fmtDH = (d: string | null | undefined) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
export const fmtD = (d: string | null | undefined) => d ? d.slice(0, 10).split('-').reverse().join('/') : '—'
export const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
export const addDias = (dias: number) => { const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString() }
export const atrasada = (o: Ocorrencia) => !!o.prazo && o.status !== 'concluido' && o.resp_nome != null && new Date(o.prazo).getTime() < Date.now()
export const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : null

export function conformidadeDe(estrutura: Setor[], resp: Resposta[]) {
  const itens = new Set(estrutura.flatMap(s => s.itens.map(i => i.id)))
  const rs = resp.filter(r => itens.has(r.item_id))
  const c = rs.filter(r => r.resposta === 'conforme').length
  const n = rs.filter(r => r.resposta === 'nao_conforme').length
  return { conformes: c, nao: n, na: rs.filter(r => r.resposta === 'na').length, pct: pct(c, c + n), respondidos: rs.length, total: itens.size }
}

// UUID determinístico (SHA-1) — a mesma ocorrência de um item de um plantão nunca duplica, mesmo reenviando da fila offline
export async function detUuid(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(txt))
  const h = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32).split('')
  h[12] = '5'; h[16] = '8'
  const s = h.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`
}
export const novoId = () => crypto.randomUUID()

// ── Fila local (conexão instável): grava no aparelho e sincroniza com upsert idempotente ──
type Op = { k: string; table: string; row: Record<string, unknown>; onConflict: string }
const QKEY = 'plt_fila_v1'
const lerFila = (): Op[] => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]') } catch { return [] } }
const gravarFila = (f: Op[]) => { try { localStorage.setItem(QKEY, JSON.stringify(f)) } catch { /* sem storage */ } }
const ouvintes = new Set<(n: number) => void>()
const avisar = () => { const n = lerFila().length; ouvintes.forEach(f => f(n)) }
export const filaTamanho = () => lerFila().length
export const filaPendentes = (table: string) => lerFila().filter(o => o.table === table).map(o => o.row)
export const onFila = (f: (n: number) => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
let sincronizando = false

export async function sincronizarFila(): Promise<void> {
  while (sincronizando) await new Promise(r => setTimeout(r, 80))
  sincronizando = true
  try {
    let f = lerFila()
    while (f.length) {
      const op = f[0]
      const { error } = await sb.from(op.table).upsert(op.row, { onConflict: op.onConflict })
      if (error) {
        // erro de rede → mantém na fila; erro de dados (constraint) → descarta para não travar a fila
        const rede = /fetch|network|failed|timeout/i.test(error.message || '')
        if (rede) break
        console.error('plantão: operação descartada', op, error)
      }
      const js = JSON.stringify(op.row); f = lerFila().filter(x => !(x.k === op.k && JSON.stringify(x.row) === js))
      gravarFila(f)
      avisar()
    }
  } catch { /* offline */ } finally { sincronizando = false; avisar() }
}
/** Enfileira (substitui operação pendente da mesma chave) e tenta sincronizar na hora. */
export function salvarFila(k: string, table: string, row: Record<string, unknown>, onConflict = 'id') {
  const f = lerFila().filter(x => x.k !== k)
  f.push({ k, table, row, onConflict })
  gravarFila(f); avisar()
  void sincronizarFila()
}

export function auditar(entidade: string, entidadeId: string, acao: string, antes: unknown, depois: unknown, usuario: string) {
  const id = novoId()
  salvarFila('aud:' + id, 'plt_auditoria', { id, entidade, entidade_id: entidadeId, acao, antes: antes ?? null, depois: depois ?? null, usuario, quando: new Date().toISOString() })
}

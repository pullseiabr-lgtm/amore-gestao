import { useState, useEffect, useCallback } from 'react'
import {
  Plus, X, CheckSquare, Square, MessageSquare, Clock,
  AlertTriangle, ChevronDown, Search,
  User, Building2, Flag, RotateCcw,
  CheckCircle2, Loader2, Trash2, History, Pencil, Store, Timer, Printer,
} from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchTarefas, insertTarefa, updateTarefa, deleteTarefa,
  insertTarefaChecklist, updateTarefaChecklist, deleteTarefaChecklist,
  insertTarefaComentario, insertTarefaHistorico, fetchProfiles,
  fetchAppConfig, saveAppConfig, TAREFA_V2_KEYS,
} from '../../lib/db'
import { enviarWhatsApp, normalizarFoneBR } from '../../lib/notify'
import { siteOrigin } from '../../lib/site'
import type { Tarefa, TarefaStatus, TarefaPrioridade, TarefaResultado, TarefaChecklist, TarefaComentario, TarefaHistorico, CobrancaConfig, CobrancaNivel } from '../../types/database'
import { AnexoUploader, AnexoLinks } from '../../components/ui/AnexoUploader'

// ── Constants ────────────────────────────────────────────────

const SETORES = ['Operação','Cozinha','Delivery','Financeiro','Compras','Administrativo','TI','Manutenção','Eventos','Estoque','Marketing','Salão','Bar','RH','Limpeza','Produção','Diretoria','Geral']

const COLUNAS: { id: TarefaStatus; label: string; cor: string; bg: string }[] = [
  { id: 'pendente',              label: 'Solicitada',            cor: '#6b7280', bg: '#f3f4f6' },
  { id: 'recebida',              label: 'Recebida',              cor: '#0891b2', bg: '#ecfeff' },
  { id: 'em_andamento',          label: 'Em execução',           cor: '#2563eb', bg: '#eff6ff' },
  { id: 'aguardando_retorno',    label: 'Aguardando info',       cor: '#d97706', bg: '#fffbeb' },
  { id: 'aguardando_fornecedor', label: 'Aguardando material',   cor: '#9333ea', bg: '#faf5ff' },
  { id: 'concluido',             label: 'Concluída',             cor: '#16a34a', bg: '#f0fdf4' },
  { id: 'aguardando_validacao',  label: 'Aguardando validação',  cor: '#ca8a04', bg: '#fefce8' },
  { id: 'encerrada',             label: 'Encerrada',             cor: '#0f766e', bg: '#f0fdfa' },
  { id: 'cancelado',             label: 'Cancelado',             cor: '#dc2626', bg: '#fef2f2' },
]
// Conjuntos de status para métricas
const STATUS_FINAL: TarefaStatus[] = ['concluido', 'encerrada']
const isFinal = (s: TarefaStatus) => STATUS_FINAL.includes(s)
const isAtiva = (s: TarefaStatus) => !['concluido', 'encerrada', 'cancelado'].includes(s)

const PRIORIDADES: { id: TarefaPrioridade; label: string; cor: string }[] = [
  { id: 'baixa',   label: 'Baixa',   cor: '#6b7280' },
  { id: 'media',   label: 'Média',   cor: '#2563eb' },
  { id: 'alta',    label: 'Alta',    cor: '#d97706' },
  { id: 'urgente', label: 'Urgente', cor: '#dc2626' },
]

const RESULTADOS: { id: TarefaResultado; label: string; cor: string }[] = [
  { id: 'resolvido',         label: 'Resolvido',          cor: '#16a34a' },
  { id: 'resolvido_parcial', label: 'Resolvido parcial',  cor: '#d97706' },
  { id: 'pendente_ajuste',   label: 'Pendente de ajuste', cor: '#9333ea' },
  { id: 'nao_concluido',     label: 'Não concluído',      cor: '#dc2626' },
]

// Tipo da atualização registrada na aba Comentários (diário operacional da tarefa)
const TIPOS_ATUALIZACAO: { id: string; label: string; emoji: string }[] = [
  { id: 'atualizacao',   label: 'Atualização',               emoji: '🟢' },
  { id: 'observacao',    label: 'Observação',                emoji: '💬' },
  { id: 'impedimento',   label: 'Impedimento',                emoji: '🚧' },
  { id: 'info',          label: 'Solicitação de informação', emoji: '❓' },
  { id: 'fornecedor',    label: 'Contato com fornecedor',    emoji: '📞' },
  { id: 'cliente',       label: 'Contato com cliente',       emoji: '📞' },
  { id: 'execucao',      label: 'Execução',                   emoji: '🛠️' },
  { id: 'custo',         label: 'Custo',                      emoji: '💰' },
  { id: 'anexo',         label: 'Anexo',                      emoji: '📎' },
  { id: 'feedback',      label: 'Feedback',                   emoji: '⭐' },
  { id: 'conclusao',     label: 'Conclusão',                  emoji: '✅' },
]
const tipoAtualizacaoInfo = (id?: string | null) => TIPOS_ATUALIZACAO.find(t => t.id === id) || TIPOS_ATUALIZACAO[0]

// Motivos estruturados de impedimento (ao entrar em Aguardando material/fornecedor) e de cancelamento
const MOTIVOS_IMPEDIMENTO = ['Aguardando material', 'Aguardando fornecedor', 'Aguardando cliente', 'Aguardando aprovação', 'Aguardando orçamento', 'Aguardando informação', 'Problema operacional', 'Problema financeiro', 'Outro']
const MOTIVOS_CANCELAMENTO = ['Solicitação duplicada', 'Solicitação não autorizada', 'Problema de orçamento', 'Problema operacional', 'Cliente desistiu', 'Não será mais necessário', 'Criada incorretamente', 'Outro']
const STATUS_IMPEDIMENTO: TarefaStatus[] = ['aguardando_retorno', 'aguardando_fornecedor']

const COBRANCA_PADRAO: CobrancaConfig = {
  ativo: false,
  lembretes_antes_min: [30, 10],
  lembretes_apos_min: [10, 30, 60],
  max_lembretes: 5,
  tolerancia_min: 10,
  escalonamento: [
    { rotulo: 'Responsável', apos_min: 0, whatsapp: null },
    { rotulo: 'Líder do setor', apos_min: 30, whatsapp: null },
    { rotulo: 'Gerente da unidade', apos_min: 60, whatsapp: null },
    { rotulo: 'Diretoria', apos_min: 120, whatsapp: null },
  ],
  quiet_inicio: '22:00',
  quiet_fim: '07:00',
  dias_semana: [1, 2, 3, 4, 5, 6],
  critico_acelera: true,
}
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const numListStr = (a: number[]) => a.join(', ')
const parseNumList = (s: string) => s.split(/[,\s]+/).map(x => parseInt(x, 10)).filter(n => Number.isFinite(n) && n >= 0)

function prioLabel(p: TarefaPrioridade) {
  return PRIORIDADES.find(x => x.id === p)?.label ?? p
}
function prioCor(p: TarefaPrioridade) {
  return PRIORIDADES.find(x => x.id === p)?.cor ?? '#6b7280'
}
function fmtData(s: string | null) {
  if (!s) return ''
  // Formata SEMPRE como dia/mês/ano, sem depender de fuso (evita ordem trocada e "um dia atrás")
  const iso = String(s).slice(0, 10)               // pega YYYY-MM-DD
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`           // dia/mês/ano
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}
function fmtMoeda(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function contaAnexos(v: string | null | undefined): number {
  if (!v) return 0
  return v.split(/\n+/).map(s => s.trim()).filter(Boolean).length
}
function parseTags(s: string | null): string[] {
  if (!s) return []
  return s.split(/[,\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean)
}
function fmtDataHora(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
// Período entre início e fim (ou até agora) em formato legível
function periodoExecucao(ini: string | null, fim: string | null): string {
  if (!ini) return '—'
  const a = new Date(ini).getTime()
  const b = fim ? new Date(fim).getTime() : Date.now()
  const ms = Math.max(0, b - a)
  const dias = Math.floor(ms / 86400000)
  const horas = Math.floor((ms % 86400000) / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  if (dias > 0) return `${dias}d ${horas}h`
  if (horas > 0) return `${horas}h ${mins}min`
  return `${mins}min`
}
function vencido(prazo: string | null) {
  if (!prazo) return false
  return new Date(prazo) < new Date(new Date().toDateString())
}
// Semáforo de prazo: 🔴 vencido · 🟡 vence em ≤2 dias · 🟢 dentro do prazo
function prazoSemaforo(prazo: string | null, status?: TarefaStatus): { cor: string; emoji: string; label: string } | null {
  if (!prazo) return null
  if (status === 'concluido' || status === 'cancelado') return null
  const hoje = new Date(new Date().toDateString()).getTime()
  const dias = Math.round((new Date(String(prazo).slice(0, 10) + 'T00:00:00').getTime() - hoje) / 86400000)
  if (dias < 0) return { cor: '#dc2626', emoji: '🔴', label: 'Vencido' }
  if (dias <= 2) return { cor: '#d97706', emoji: '🟡', label: dias === 0 ? 'Vence hoje' : `Vence em ${dias}d` }
  return { cor: '#16a34a', emoji: '🟢', label: 'No prazo' }
}
// Indicador de saúde da tarefa: 🟢 Normal · 🟡 Atenção (prazo próximo) · 🔴 Crítica (atrasada) · ⚫ Bloqueada (impedimento)
function saudeTarefa(t: Tarefa): { emoji: string; label: string; cor: string } | null {
  if (t.status === 'concluido' || t.status === 'encerrada' || t.status === 'cancelado') return null
  if (t.status === 'aguardando_retorno' || t.status === 'aguardando_fornecedor') return { emoji: '⚫', label: 'Bloqueada', cor: '#374151' }
  if (vencido(t.prazo)) return { emoji: '🔴', label: 'Crítica', cor: '#dc2626' }
  const sem = prazoSemaforo(t.prazo, t.status)
  if (sem && sem.emoji === '🟡') return { emoji: '🟡', label: 'Atenção', cor: '#d97706' }
  return { emoji: '🟢', label: 'Normal', cor: '#16a34a' }
}
const durH = (h: number) => h < 48 ? `${h.toFixed(0)}h` : `${(h / 24).toFixed(0)}d`
// SLA: a contagem do prazo começa quando a tarefa é RECEBIDA (dada a ciência).
function slaInfo(t: Tarefa): { txt: string; cor: string } | null {
  if (!t.recebido_em) return null
  if (t.status === 'concluido' || t.status === 'encerrada' || t.status === 'cancelado') return null
  const hDesde = (Date.now() - new Date(t.recebido_em).getTime()) / 3600000
  if (!t.prazo) return { txt: `recebida há ${durH(Math.max(0, hDesde))}`, cor: '#0891b2' }
  const hl = parseHoras(t.competencia).hl
  const deadline = new Date(String(t.prazo).slice(0, 10) + 'T' + (hl || '23:59') + ':00').getTime()
  const restante = deadline - Date.now()
  if (restante < 0) return { txt: `atrasada ${durH(Math.abs(restante) / 3600000)}`, cor: '#dc2626' }
  const rh = restante / 3600000
  return { txt: `faltam ${durH(rh)}`, cor: rh <= 24 ? '#d97706' : '#16a34a' }
}
function ultimaAtualizacao(t: Tarefa): string {
  const c = t.comentarios
  if (c && c.length) return [...c].sort((a, b) => b.created_at.localeCompare(a.created_at))[0].texto
  return ''
}
const statusLabel = (s: TarefaStatus) => COLUNAS.find(c => c.id === s)?.label || s
// Há quanto tempo (h) a tarefa está no status ATUAL — usa a última transição para esse status, senão a criação.
function tempoNoStatusAtual(t: Tarefa): number {
  const trans = t.transicoes || []
  const last = [...trans].reverse().find(tr => tr.para === t.status)
  const desde = last ? last.em : t.created_at
  return Math.max(0, (Date.now() - new Date(desde).getTime()) / 3600000)
}
// Decompõe o tempo total da tarefa em horas por status (usa a linha do tempo de transições).
// Tarefas sem transições registradas caem inteiras no status atual (aproximação razoável).
function tempoPorStatusDetalhe(t: Tarefa): { status: string; label: string; horas: number }[] {
  const trans = [...(t.transicoes || [])].sort((a, b) => a.em.localeCompare(b.em))
  const buckets: Record<string, number> = {}
  let curStatus: string = 'pendente'
  let curStart = t.created_at
  for (const tr of trans) {
    const dur = (new Date(tr.em).getTime() - new Date(curStart).getTime()) / 3600000
    if (dur > 0) buckets[curStatus] = (buckets[curStatus] || 0) + dur
    curStatus = tr.para
    curStart = tr.em
  }
  const fim = (t.status === 'concluido' || t.status === 'encerrada' || t.status === 'cancelado')
    ? (t.concluido_em || t.updated_at || new Date().toISOString())
    : new Date().toISOString()
  const durFinal = (new Date(fim).getTime() - new Date(curStart).getTime()) / 3600000
  if (durFinal > 0) buckets[curStatus] = (buckets[curStatus] || 0) + durFinal
  return Object.entries(buckets)
    .map(([status, horas]) => ({ status, label: statusLabel(status as TarefaStatus), horas }))
    .sort((a, b) => b.horas - a.horas)
}

// Timeline única da tarefa: intercala transições de status, atualizações (comentários) e demais eventos
// de auditoria (tarefas_historico), em ordem cronológica — "diário operacional" da tarefa.
// Descarta entradas de tarefas_historico com campo==='status': já cobertas (com mais detalhe) por transicoes.
type TimelineEvento =
  | { em: string; kind: 'transicao'; tr: NonNullable<Tarefa['transicoes']>[number] }
  | { em: string; kind: 'comentario'; c: TarefaComentario }
  | { em: string; kind: 'historico'; h: TarefaHistorico }
function montaTimeline(t: Tarefa): TimelineEvento[] {
  const evs: TimelineEvento[] = []
  for (const tr of (t.transicoes || [])) evs.push({ em: tr.em, kind: 'transicao', tr })
  for (const c of (t.comentarios || [])) evs.push({ em: c.created_at, kind: 'comentario', c })
  for (const h of (t.historico || [])) { if (h.campo === 'status') continue; evs.push({ em: h.created_at, kind: 'historico', h }) }
  return evs.sort((a, b) => b.em.localeCompare(a.em))
}

// ── Empty form ───────────────────────────────────────────────
const hojeISO = () => new Date().toISOString().slice(0, 10)
// Horários da tarefa (módulo 13 — sem migração: guardados no campo livre `competencia` como JSON)
function buildHorasComp(hi: string, hl: string): string | null {
  if (!hi && !hl) return null
  return JSON.stringify({ hi: hi || null, hl: hl || null })
}
function parseHoras(competencia: string | null): { hi: string; hl: string } {
  if (!competencia) return { hi: '', hl: '' }
  try { const o = JSON.parse(competencia); if (o && typeof o === 'object') return { hi: o.hi || '', hl: o.hl || '' } } catch { /* texto antigo */ }
  return { hi: '', hl: '' }
}

const emptyForm = () => ({
  titulo: '', descricao: '', setor: 'Operação', prioridade: 'media' as TarefaPrioridade,
  loja: '',
  responsavel_nome: '', solicitante_nome: '',
  data_solicitacao: hojeISO(), prazo: '', horaInicio: '', horaLimite: '', observacoes: '',
  precisa_aprovacao: false,
  enviarWhats: true,
  checklist: [] as string[],
  // setores que apoiam a execução
  envolvidos: '',
  // campos avançados (opcionais)
  objetivo: '', entregaveis: '', anexos: '', tags: '',
  custo_previsto: '', resultado_esperado: '',
})

// ── Main Component ───────────────────────────────────────────
export default function TarefasPage() {
  const { loja, lojas } = useLoja()
  const { user } = useAuth()

  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroSetor, setFiltroSetor] = useState('')
  const [filtroPrio, setFiltroPrio] = useState('')
  const [filtroLoja, setFiltroLoja] = useState('')
  const [view, setView] = useState<'kanban' | 'lista' | 'gerencial'>('kanban')
  // Período do Painel Gerencial (afeta só a aba Painel — Kanban/Lista continuam mostrando tudo)
  const [periodoPainel, setPeriodoPainel] = useState<'todos' | '7d' | '30d' | 'custom'>('todos')
  const [periodoDe, setPeriodoDe] = useState('')
  const [periodoAte, setPeriodoAte] = useState('')
  const [pendenciaAberta, setPendenciaAberta] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<TarefaStatus | null>(null)

  // Modal nova tarefa
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [novoCheckItem, setNovoCheckItem] = useState('')
  const [profiles, setProfiles] = useState<any[]>([])
  const [respModo, setRespModo] = useState<'lista' | 'outro'>('lista')
  useEffect(() => { fetchProfiles().then(setProfiles).catch(() => {}) }, [])

  // Responsáveis pré-cadastrados = perfis com WhatsApp cadastrado (garante roteamento da notificação)
  const responsaveis = profiles
    .filter(p => (p.name || '').trim() && (((p.permissions_override as any)?.__perfil__?.whatsapp) || '').trim())
    .map(p => (p.name || '').trim())
    .sort((a, b) => a.localeCompare(b))

  // Config de cobranças automáticas (módulo 13) — salva em app_config.cobranca_cfg
  const [showCobranca, setShowCobranca] = useState(false)
  const [cobrancaCfg, setCobrancaCfg] = useState<CobrancaConfig | null>(null)
  useEffect(() => { fetchAppConfig<CobrancaConfig>('cobranca_cfg').then(c => setCobrancaCfg(c || COBRANCA_PADRAO)).catch(() => setCobrancaCfg(COBRANCA_PADRAO)) }, [])

  // Busca o WhatsApp de um usuário pelo nome (guardado em permissions_override.__perfil__)
  const whatsappDoResponsavel = (nome: string): string => {
    if (!nome) return ''
    const u = profiles.find(p => (p.name || '').trim().toLowerCase() === nome.trim().toLowerCase())
    const perfil = (u?.permissions_override as any)?.__perfil__
    return (perfil?.whatsapp || '').replace(/\D/g, '')
  }

  // Envia notificação de tarefa via Evolution (server-side) e registra na Central.
  // Manda TODAS as informações de execução (não só um aviso): loja, prioridade,
  // prazo, solicitante, descrição e os links dos anexos.
  const notificarTarefaWhats = async (t: Tarefa) => {
    const responsavel = t.responsavel_nome || ''
    const phone = whatsappDoResponsavel(responsavel)
    if (!phone) return false  // sem número cadastrado para o responsável
    const prioEmoji: Record<string, string> = { urgente: '🔴', alta: '🟠', media: '🔵', baixa: '⚪' }
    const prazoBR = t.prazo ? new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-BR') : 'sem prazo definido'
    const horaLimite = parseHoras(t.competencia).hl
    const anexos = (t.anexos || '').split(/\n+/).map(s => s.trim()).filter(l => /^https?:\/\//.test(l))
    const linhas = [
      `🔔 *NOVA TAREFA*${t.numero != null ? ` #${String(t.numero).padStart(4, '0')}` : ''}`,
      '',
      `🏪 Loja: ${t.loja}`,
      `📋 *${t.titulo}*`,
      `${prioEmoji[t.prioridade] || '🔵'} Prioridade: ${prioLabel(t.prioridade)}`,
      `👤 Responsável: ${responsavel}`,
      t.solicitante_nome ? `🙋 Solicitante: ${t.solicitante_nome}` : '',
      `⏰ Prazo: ${prazoBR}${horaLimite ? ` às ${horaLimite}` : ''}`,
      `🏷 Setor: ${t.setor}`,
      t.descricao ? `\n📝 ${t.descricao}` : '',
      anexos.length ? `\n📎 Anexos (${anexos.length}):\n${anexos.join('\n')}` : '',
      '',
      `Abra para confirmar o recebimento e executar:\n${linkTarefa(t, 'resp')}`,
      '_Amore Gestão_',
    ].filter(l => l !== '')
    return enviarWhatsApp(phone, linhas.join('\n'), undefined, {
      tipo: 'tarefa', modulo: 'tarefas', titulo: t.titulo, setor: t.setor || null,
      loja, destinatario_nome: responsavel, referencia_id: t.id, created_by: user?.name || null,
    })
  }

  // Persistência dos campos V2 em app_config (tv2_<id>) — sem migração de schema.
  const pickV2 = (t: any) => { const o: any = {}; for (const k of TAREFA_V2_KEYS) if (t?.[k] !== undefined && t?.[k] !== null) o[k] = t[k]; return o }
  const saveTV2 = async (t: Tarefa, patch: Record<string, any>) => { await saveAppConfig('tv2_' + t.id, { ...pickV2(t), ...patch }) }

  // Link público da tarefa (ações via WhatsApp, sem login). papel: resp | solic | aprov
  const linkTarefa = (t: Tarefa, papel?: 'resp' | 'solic' | 'aprov') =>
    `${siteOrigin()}/tarefa.html?id=${t.id}${t.token ? `&t=${t.token}` : ''}${papel ? `&papel=${papel}` : ''}`

  // WhatsApp direto para um número específico (usado nas aprovações e validações).
  const zapPara = async (nome: string, phone: string, msg: string, meta: { titulo: string; refId: string; tipo?: any }) => {
    const fone = normalizarFoneBR(phone)
    if (!fone) return false
    return enviarWhatsApp(fone, msg, undefined, {
      tipo: meta.tipo || 'tarefa', modulo: 'tarefas', titulo: meta.titulo,
      loja, destinatario_nome: nome, referencia_id: meta.refId, created_by: user?.name || null,
    })
  }

  // Dispara aprovação de orçamento para Wagner e Aline.
  const notificarOrcamentoAprovadores = async (t: Tarefa) => {
    const alvos = profiles.filter(p => /wagner|aline/i.test((p.name || '')))
    const link = linkTarefa(t, 'aprov')
    const valor = t.orcamento_valor != null ? fmtMoeda(t.orcamento_valor) : '(sem valor informado)'
    for (const p of alvos) {
      const phone = ((p.permissions_override as any)?.__perfil__?.whatsapp) || ''
      const msg = [
        `💰 *ORÇAMENTO PARA APROVAÇÃO*${t.numero != null ? ` #${String(t.numero).padStart(4, '0')}` : ''}`,
        '',
        `🏪 Loja: ${t.loja}`,
        `📋 ${t.titulo}`,
        `🔧 ${t.orcamento_descricao || t.descricao || '—'}`,
        t.orcamento_fornecedor ? `🏢 Fornecedor: ${t.orcamento_fornecedor}` : '',
        `💵 Valor: *${valor}*`,
        `🙋 Solicitante: ${t.solicitante_nome || '—'}`,
        '',
        `Aprovar ou reprovar:\n${link}`,
        '_Amore Gestão_',
      ].filter(l => l !== '').join('\n')
      await zapPara(p.name, phone, msg, { titulo: `Orçamento: ${t.titulo}`, refId: t.id, tipo: 'aprovacao' })
    }
  }

  // Modal detalhe
  const [detalhe, setDetalhe] = useState<Tarefa | null>(null)
  const [novoComent, setNovoComent] = useState('')
  const [novoComentTipo, setNovoComentTipo] = useState('atualizacao')
  const [novoCheckDetalhe, setNovoCheckDetalhe] = useState('')
  const [detalheSaving, setDetalheSaving] = useState(false)
  const [abaDetalhe, setAbaDetalhe] = useState<'checklist'|'envolvidos'|'aprovacoes'|'execucao'|'historico'>('checklist')
  // Edição de execução/resultado no detalhe
  const [resForm, setResForm] = useState({ resultado_final: '', custo_executado: '', dificuldades: '', resultado_status: '' as '' | TarefaResultado, observacao_final: '' })
  // Solicitação de mais prazo
  const [extForm, setExtForm] = useState({ data: '', motivo: '' })
  // Aprovação de orçamento
  const [orcForm, setOrcForm] = useState({ valor: '', obs: '' })
  // Orçamento informado pelo responsável (quem recebe a tarefa)
  const [orcEntry, setOrcEntry] = useState({ valor: '', descricao: '', fornecedor: '', data: '', obs: '', anexos: '' })
  // Monitoramento da execução: desvio e apoio de outro setor
  const [desvioForm, setDesvioForm] = useState('')
  const [apoioForm, setApoioForm] = useState({ setor: '', motivo: '' })
  // Edição dos campos da tarefa (gera registro no histórico)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<any>(null)
  // Transição de status (modal "Atualizar tarefa" ao mover no Kanban)
  const [transicao, setTransicao] = useState<{ tarefa: Tarefa; novoStatus: TarefaStatus } | null>(null)
  const [transObs, setTransObs] = useState('')
  const [transAnexos, setTransAnexos] = useState('')
  // Impedimento estruturado (aguardando material/fornecedor/etc) e cancelamento com motivo obrigatório
  const [transMotivo, setTransMotivo] = useState('')
  const [transResp, setTransResp] = useState('')
  const [transPrevisao, setTransPrevisao] = useState('')
  // Posicionamento: aceite formal do responsável (aceitar/recusar + concordar/propor novo prazo)
  const [posicionamento, setPosicionamento] = useState<Tarefa | null>(null)
  const [posAceite, setPosAceite] = useState<boolean | null>(null)
  const [posPrazoConcorda, setPosPrazoConcorda] = useState<boolean | null>(null)
  const [posPrazoProposto, setPosPrazoProposto] = useState('')
  const [posPrazoJustificativa, setPosPrazoJustificativa] = useState('')
  const [posMotivoRecusa, setPosMotivoRecusa] = useState('')
  // Transferir tarefa (muda o responsável principal, preserva todo o histórico)
  const [transferencia, setTransferencia] = useState<Tarefa | null>(null)
  const [transfNovoResp, setTransfNovoResp] = useState('')
  const [transfMotivo, setTransfMotivo] = useState('')
  // Colaboradores vinculados à tarefa (apoio pontual sem tirar o responsável principal)
  const [novoColabTipo, setNovoColabTipo] = useState('Setor')
  const [novoColabNome, setNovoColabNome] = useState('')
  const [novoColabMotivo, setNovoColabMotivo] = useState('')

  // ── Load ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchTarefas(loja)
    setTarefas(data)
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  // Atualiza detalhe quando tarefas mudam
  useEffect(() => {
    if (detalhe) {
      const atualizada = tarefas.find(t => t.id === detalhe.id)
      if (atualizada) setDetalhe(atualizada)
    }
  }, [tarefas]) // eslint-disable-line

  // Sincroniza o form de resultado/execução ao trocar de tarefa no detalhe
  useEffect(() => {
    setResForm({
      resultado_final: detalhe?.resultado_final || '',
      custo_executado: detalhe?.custo_executado != null ? String(detalhe.custo_executado) : '',
      dificuldades: detalhe?.dificuldades || '',
      resultado_status: (detalhe?.resultado_status || '') as '' | TarefaResultado,
      observacao_final: detalhe?.observacao_final || '',
    })
    setExtForm({ data: '', motivo: '' })
    setOrcForm({ valor: detalhe?.orcamento_aprovado_valor != null ? String(detalhe.orcamento_aprovado_valor) : (detalhe?.orcamento_valor != null ? String(detalhe.orcamento_valor) : ''), obs: detalhe?.orcamento_obs_aprovacao || '' })
    setOrcEntry({ valor: '', descricao: '', fornecedor: '', data: '', obs: '', anexos: '' })
    setDesvioForm('')
    setApoioForm({ setor: '', motivo: '' })
    setEditMode(false)
  }, [detalhe?.id]) // eslint-disable-line

  // ── Filtro ───────────────────────────────────────────────
  const tarefasFiltradas = tarefas.filter(t => {
    if (busca && !t.titulo.toLowerCase().includes(busca.toLowerCase()) &&
        !(t.responsavel_nome || '').toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroSetor && t.setor !== filtroSetor) return false
    if (filtroPrio && t.prioridade !== filtroPrio) return false
    if (filtroLoja && t.loja !== filtroLoja) return false
    return true
  })

  // ── Criar tarefa ─────────────────────────────────────────
  const criarTarefa = async () => {
    if (!form.titulo.trim()) return
    if (!form.loja) { alert('Selecione a loja/unidade solicitante.'); return }
    setSaving(true)
    try {
      const nova = await insertTarefa({
        loja: form.loja,
        titulo: form.titulo.trim(),
        descricao: form.descricao || null,
        setor: form.setor,
        status: 'pendente',
        prioridade: form.prioridade,
        responsavel_nome: form.responsavel_nome || null,
        solicitante_nome: form.solicitante_nome || user?.name || '',
        prazo: form.prazo || null,
        observacoes: form.observacoes || null,
        objetivo: form.objetivo || null,
        envolvidos: form.envolvidos || null,
        competencia: buildHorasComp(form.horaInicio, form.horaLimite),
        data_inicio: null,
        entregaveis: form.entregaveis || null,
        anexos: form.anexos || null,
        tags: form.tags || null,
        custo_previsto: form.custo_previsto ? Number(form.custo_previsto) : null,
        custo_executado: null,
        resultado_esperado: form.resultado_esperado || null,
        resultado_final: null,
        dificuldades: null,
        iniciado_em: null,
        concluido_em: null,
        prazo_extensao_data: null,
        prazo_extensao_motivo: null,
        prazo_extensao_status: null,
        data_solicitacao: form.data_solicitacao || hojeISO(),
        resultado_status: null,
        validado_por: null,
        validado_em: null,
        observacao_final: null,
        precisa_aprovacao: form.precisa_aprovacao,
        aprovado_por: null, aprovado_at: null, obs_aprovacao: null,
        reaberta: false, created_by: user?.id || null,
        // Campos V2 (recebimento/orçamento/avaliação/token) vão para app_config abaixo.
      })
      // Checklist items
      for (const desc of form.checklist.filter(Boolean)) {
        await insertTarefaChecklist({ tarefa_id: nova.id, descricao: desc, concluido: false, concluido_por: null, concluido_at: null })
      }
      // Histórico
      await insertTarefaHistorico({ tarefa_id: nova.id, acao: 'Tarefa criada', campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Sistema' })
      // Gera o token do link público (campos V2 vivem em app_config — sem migração).
      // Custo/orçamento NÃO é definido aqui: quem informa é o responsável que recebe a tarefa.
      const v2blob: Record<string, any> = {
        token: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(nova.id)),
        gera_custo: false,
      }
      await saveAppConfig('tv2_' + nova.id, v2blob)
      const novaFull = { ...nova, ...v2blob } as Tarefa
      // Notificação WhatsApp ao responsável (se ativado e houver número cadastrado)
      if (form.enviarWhats && form.responsavel_nome) {
        await notificarTarefaWhats(novaFull)
      }
      setShowForm(false)
      setForm(emptyForm())
      await load()
    } catch (e: any) {
      // Antes o erro era engolido pelo try/finally e a tarefa parecia "não salvar".
      alert('Não foi possível salvar a tarefa: ' + (e?.message || 'erro desconhecido'))
    } finally { setSaving(false) }
  }

  // ── Mover status = abre modal "Atualizar tarefa" (transição registrada) ──
  const abrirTransicao = (tarefa: Tarefa, novoStatus: TarefaStatus) => {
    if (!novoStatus || novoStatus === tarefa.status) return
    setTransObs(''); setTransAnexos(''); setTransMotivo(''); setTransResp(''); setTransPrevisao(''); setTransicao({ tarefa, novoStatus })
  }
  // Motivo é obrigatório para Cancelado e para os status de impedimento (aguardando material/fornecedor/etc)
  const transMotivoObrigatorio = !!transicao && (transicao.novoStatus === 'cancelado' || STATUS_IMPEDIMENTO.includes(transicao.novoStatus))
  const confirmarTransicao = async () => {
    if (!transicao) return
    if (transMotivoObrigatorio && !transMotivo) { alert('Selecione o motivo antes de confirmar.'); return }
    const { tarefa, novoStatus } = transicao
    const anterior = tarefa.status
    setDetalheSaving(true)
    try {
      const extra: any = { status: novoStatus }
      if (novoStatus === 'em_andamento' && !tarefa.iniciado_em) extra.iniciado_em = new Date().toISOString()
      if ((novoStatus === 'concluido' || novoStatus === 'encerrada') && !tarefa.concluido_em) extra.concluido_em = new Date().toISOString()
      await updateTarefa(tarefa.id, extra)
      const lblNovo = COLUNAS.find(c => c.id === novoStatus)?.label || novoStatus
      const motivoTxt = transMotivo ? ` · Motivo: ${transMotivo}` : ''
      // Linha do tempo (append-only) em app_config — inclui motivo/responsável/previsão quando aplicável (impedimento/cancelamento)
      const trans = [...(tarefa.transicoes || []), {
        em: new Date().toISOString(), de: anterior, para: novoStatus, por: user?.name || 'Sistema',
        obs: transObs.trim() || null, anexos: transAnexos.trim() || null,
        motivo: transMotivo || null,
        resp_resolucao: transResp.trim() || null,
        previsao: transPrevisao || null,
      }]
      await saveTV2(tarefa, { transicoes: trans })
      // Auditoria imutável
      await insertTarefaHistorico({ tarefa_id: tarefa.id, acao: `Status → ${lblNovo}${motivoTxt}${transObs.trim() ? ' · ' + transObs.trim() : ''}`, campo: 'status', valor_anterior: anterior, valor_novo: novoStatus, usuario_nome: user?.name || 'Sistema' })
      if (transObs.trim() || transAnexos.trim()) {
        await insertTarefaComentario({ tarefa_id: tarefa.id, texto: `[${lblNovo}] ${transObs.trim()}${transAnexos.trim() ? '\n' + transAnexos.trim() : ''}`, autor_nome: user?.name || 'Sistema' })
      }
      // Notifica o solicitante da atualização
      const phone = whatsappDoResponsavel(tarefa.solicitante_nome)
      if (phone) {
        const msg = `🔔 *Atualização da sua tarefa*${tarefa.numero != null ? ` #${String(tarefa.numero).padStart(4, '0')}` : ''}\n\n📋 ${tarefa.titulo}\n📌 Status: *${lblNovo}*${transObs.trim() ? `\n📝 ${transObs.trim()}` : ''}\n👤 ${user?.name || '—'}\n\n${linkTarefa(tarefa, 'solic')}\n_Amore Gestão_`
        await zapPara(tarefa.solicitante_nome, phone, msg, { titulo: `Atualização: ${tarefa.titulo}`, refId: tarefa.id })
      }
      setTransicao(null)
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Aprovar ──────────────────────────────────────────────
  const aprovarTarefa = async (tarefa: Tarefa) => {
    setDetalheSaving(true)
    try {
      await updateTarefa(tarefa.id, { aprovado_por: user?.name, aprovado_at: new Date().toISOString() })
      await insertTarefaHistorico({ tarefa_id: tarefa.id, acao: 'Tarefa aprovada pelo gestor', campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Sistema' })
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Reabrir ──────────────────────────────────────────────
  const reabrirTarefa = async (tarefa: Tarefa) => {
    await updateTarefa(tarefa.id, { status: 'pendente', reaberta: true })
    await insertTarefaHistorico({ tarefa_id: tarefa.id, acao: 'Tarefa reaberta', campo: 'status', valor_anterior: tarefa.status, valor_novo: 'pendente', usuario_nome: user?.name || 'Sistema' })
    await load()
  }

  // ── Toggle checklist ─────────────────────────────────────
  const toggleCheck = async (item: TarefaChecklist) => {
    const novo = !item.concluido
    await updateTarefaChecklist(item.id, {
      concluido: novo,
      concluido_por: novo ? user?.name : null,
      concluido_at: novo ? new Date().toISOString() : null,
    })
    await load()
  }

  // ── Adicionar checklist no detalhe ───────────────────────
  const addCheckDetalhe = async () => {
    if (!detalhe || !novoCheckDetalhe.trim()) return
    await insertTarefaChecklist({ tarefa_id: detalhe.id, descricao: novoCheckDetalhe.trim(), concluido: false, concluido_por: null, concluido_at: null })
    setNovoCheckDetalhe('')
    await load()
  }

  // ── Deletar checklist ────────────────────────────────────
  const delCheck = async (id: string) => {
    await deleteTarefaChecklist(id)
    await load()
  }

  // ── Comentário ───────────────────────────────────────────
  const addComentario = async () => {
    if (!detalhe || !novoComent.trim()) return
    setDetalheSaving(true)
    try {
      const texto = novoComent.trim()
      const tipo = novoComentTipo
      await insertTarefaComentario({ tarefa_id: detalhe.id, texto, autor_nome: user?.name || 'Usuário', tipo })
      // Toda atualização relevante da tratativa avisa o solicitante — não só as trocas de status.
      const phone = whatsappDoResponsavel(detalhe.solicitante_nome)
      if (phone && (user?.name || detalhe.responsavel_nome) !== detalhe.solicitante_nome) {
        const info = tipoAtualizacaoInfo(tipo)
        const msg = `🔔 *Atualização da tarefa*${detalhe.numero != null ? ` #${String(detalhe.numero).padStart(4, '0')}` : ''}\n\n📋 ${detalhe.titulo}\n${info.emoji} ${info.label}: ${texto}\n👤 ${user?.name || detalhe.responsavel_nome || '—'}\n\n${linkTarefa(detalhe, 'solic')}\n_Amore Gestão_`
        await zapPara(detalhe.solicitante_nome, phone, msg, { titulo: `Atualização: ${detalhe.titulo}`, refId: detalhe.id })
      }
      setNovoComent('')
      setNovoComentTipo('atualizacao')
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Salvar execução: dificuldades, custo e resultado ─────
  const salvarResultado = async () => {
    if (!detalhe) return
    setDetalheSaving(true)
    try {
      const custo = resForm.custo_executado ? Number(resForm.custo_executado) : null
      await updateTarefa(detalhe.id, {
        resultado_final: resForm.resultado_final || null,
        custo_executado: custo,
        dificuldades: resForm.dificuldades || null,
        resultado_status: resForm.resultado_status || null,
        observacao_final: resForm.observacao_final || null,
      })
      await insertTarefaHistorico({ tarefa_id: detalhe.id, acao: 'Execução/resultado registrado', campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Sistema' })
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Validação final da conclusão (gestor) ────────────────
  const validarConclusao = async (t: Tarefa) => {
    setDetalheSaving(true)
    try {
      await updateTarefa(t.id, { validado_por: user?.name || 'Gestor', validado_em: new Date().toISOString() })
      await insertTarefaHistorico({ tarefa_id: t.id, acao: 'Conclusão validada', campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Gestor' })
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Iniciar / concluir execução (marca período real) ─────
  const iniciarExecucao = async (t: Tarefa) => {
    setDetalheSaving(true)
    try {
      await updateTarefa(t.id, { iniciado_em: new Date().toISOString(), status: t.status === 'pendente' ? 'em_andamento' : t.status })
      await insertTarefaHistorico({ tarefa_id: t.id, acao: 'Execução iniciada', campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Sistema' })
      await load()
    } finally { setDetalheSaving(false) }
  }
  const concluirExecucao = async (t: Tarefa) => {
    setDetalheSaving(true)
    try {
      await updateTarefa(t.id, { concluido_em: new Date().toISOString(), status: isFinal(t.status) ? t.status : 'concluido' })
      await insertTarefaHistorico({ tarefa_id: t.id, acao: 'Execução concluída', campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Sistema' })
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Posicionamento: aceite formal do responsável (substitui o antigo "dar ciência" simples) ──
  const abrirPosicionamento = (t: Tarefa) => {
    setPosAceite(null); setPosPrazoConcorda(null); setPosPrazoProposto(''); setPosPrazoJustificativa(''); setPosMotivoRecusa('')
    setPosicionamento(t)
  }
  const confirmarPosicionamento = async () => {
    if (!posicionamento) return
    const t = posicionamento
    if (posAceite == null) { alert('Aceite ou recuse a tarefa.'); return }
    if (posAceite && posPrazoConcorda == null) { alert('Informe se concorda com o prazo.'); return }
    if (posAceite && posPrazoConcorda === false && (!posPrazoProposto || !posPrazoJustificativa.trim())) { alert('Informe o novo prazo e a justificativa.'); return }
    if (!posAceite && !posMotivoRecusa.trim()) { alert('Informe o motivo da recusa.'); return }
    const quem = user?.name || t.responsavel_nome || 'Responsável'
    setDetalheSaving(true)
    try {
      if (posAceite) {
        const novoPrazo = posPrazoConcorda === false ? posPrazoProposto : t.prazo
        if (t.status === 'pendente') await updateTarefa(t.id, { status: 'recebida', prazo: novoPrazo })
        else if (novoPrazo !== t.prazo) await updateTarefa(t.id, { prazo: novoPrazo })
        await saveTV2(t, {
          recebido_em: new Date().toISOString(), recebido_por: quem, visualizado_em: t.visualizado_em || new Date().toISOString(),
          aceite_status: 'aceito', aceite_em: new Date().toISOString(), aceite_por: quem,
          aceite_prazo_concorda: posPrazoConcorda, aceite_prazo_proposto: posPrazoConcorda === false ? posPrazoProposto : null,
          aceite_prazo_justificativa: posPrazoConcorda === false ? posPrazoJustificativa.trim() : null,
        })
        const acaoTxt = posPrazoConcorda === false
          ? `${quem} aceitou a tarefa e propôs novo prazo (${fmtData(posPrazoProposto)}): ${posPrazoJustificativa.trim()}`
          : `${quem} aceitou a tarefa e concordou com o prazo`
        await insertTarefaHistorico({ tarefa_id: t.id, acao: acaoTxt, campo: null, valor_anterior: null, valor_novo: null, usuario_nome: quem })
        const phone = whatsappDoResponsavel(t.solicitante_nome)
        if (phone) {
          const msg = `📨 *${quem} aceitou a tarefa*${t.numero != null ? ` #${String(t.numero).padStart(4, '0')}` : ''}\n\n🏪 ${t.loja}\n📋 ${t.titulo}${posPrazoConcorda === false ? `\n📅 Novo prazo proposto: *${fmtData(posPrazoProposto)}*\n📝 ${posPrazoJustificativa.trim()}` : '\n✅ Prazo confirmado.'}\n\n${linkTarefa(t, 'solic')}\n_Amore Gestão_`
          await zapPara(t.solicitante_nome, phone, msg, { titulo: `Aceite: ${t.titulo}`, refId: t.id })
        }
      } else {
        await updateTarefa(t.id, { status: 'pendente', responsavel_nome: null })
        await saveTV2(t, { aceite_status: 'recusado', aceite_em: new Date().toISOString(), aceite_por: quem, aceite_recusa_motivo: posMotivoRecusa.trim() })
        await insertTarefaHistorico({ tarefa_id: t.id, acao: `${quem} recusou/devolveu a tarefa: ${posMotivoRecusa.trim()}`, campo: null, valor_anterior: null, valor_novo: null, usuario_nome: quem })
        const phone = whatsappDoResponsavel(t.solicitante_nome)
        if (phone) {
          const msg = `⚠️ *Tarefa devolvida*${t.numero != null ? ` #${String(t.numero).padStart(4, '0')}` : ''}\n\n📋 ${t.titulo}\n👤 ${quem} não pôde assumir: ${posMotivoRecusa.trim()}\n\nPrecisa de um novo responsável.\n\n${linkTarefa(t, 'solic')}\n_Amore Gestão_`
          await zapPara(t.solicitante_nome, phone, msg, { titulo: `Devolvida: ${t.titulo}`, refId: t.id })
        }
      }
      setPosicionamento(null)
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Transferir tarefa: muda o responsável principal, preserva todo o histórico ──
  const abrirTransferencia = (t: Tarefa) => { setTransfNovoResp(''); setTransfMotivo(''); setTransferencia(t) }
  const confirmarTransferencia = async () => {
    if (!transferencia || !transfNovoResp.trim() || !transfMotivo.trim()) { alert('Selecione o novo responsável e informe o motivo.'); return }
    const t = transferencia
    const antigo = t.responsavel_nome || '—'
    const novo = transfNovoResp.trim()
    const quem = user?.name || 'Sistema'
    setDetalheSaving(true)
    try {
      await updateTarefa(t.id, { responsavel_nome: novo })
      // Novo responsável precisa se posicionar de novo (aceite/prazo) — nada do histórico anterior é apagado.
      await saveTV2(t, {
        aceite_status: null, aceite_em: null, aceite_por: null, aceite_prazo_concorda: null,
        aceite_prazo_proposto: null, aceite_prazo_justificativa: null, aceite_recusa_motivo: null,
        recebido_em: null, recebido_por: null,
      })
      await insertTarefaHistorico({ tarefa_id: t.id, acao: `${quem} transferiu a tarefa de ${antigo} para ${novo}: ${transfMotivo.trim()}`, campo: 'responsavel_nome', valor_anterior: antigo, valor_novo: novo, usuario_nome: quem })
      await notificarTarefaWhats({ ...t, responsavel_nome: novo })
      setTransferencia(null)
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Colaboradores: outros setores/pessoas/fornecedores vinculados, sem tirar o responsável principal ──
  const adicionarColaborador = async (t: Tarefa) => {
    if (!novoColabNome.trim()) return
    setDetalheSaving(true)
    try {
      const quem = user?.name || 'Sistema'
      const novo = { tipo: novoColabTipo, nome: novoColabNome.trim(), motivo: novoColabMotivo.trim() || null, adicionado_por: quem, adicionado_em: new Date().toISOString() }
      const lista = [...(t.colaboradores || []), novo]
      await updateTarefa(t.id, { colaboradores: lista })
      await insertTarefaHistorico({ tarefa_id: t.id, acao: `${quem} vinculou ${novoColabTipo.toLowerCase()} colaborador: ${novoColabNome.trim()}${novoColabMotivo.trim() ? ' — ' + novoColabMotivo.trim() : ''}`, campo: null, valor_anterior: null, valor_novo: null, usuario_nome: quem })
      setNovoColabNome(''); setNovoColabMotivo('')
      await load()
    } finally { setDetalheSaving(false) }
  }
  const removerColaborador = async (t: Tarefa, idx: number) => {
    setDetalheSaving(true)
    try {
      const alvo = (t.colaboradores || [])[idx]
      const lista = (t.colaboradores || []).filter((_, i) => i !== idx)
      await updateTarefa(t.id, { colaboradores: lista })
      if (alvo) await insertTarefaHistorico({ tarefa_id: t.id, acao: `${user?.name || 'Sistema'} removeu colaborador: ${alvo.nome}`, campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Sistema' })
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Enviar para validação do solicitante ─────────────────
  const enviarParaValidacao = async (t: Tarefa) => {
    setDetalheSaving(true)
    try {
      await updateTarefa(t.id, { status: 'aguardando_validacao', concluido_em: t.concluido_em || new Date().toISOString() })
      await insertTarefaHistorico({ tarefa_id: t.id, acao: 'Enviada para validação do solicitante', campo: 'status', valor_anterior: t.status, valor_novo: 'aguardando_validacao', usuario_nome: user?.name || 'Sistema' })
      // Notifica o solicitante com link para validar
      const phone = whatsappDoResponsavel(t.solicitante_nome)
      if (phone) {
        const msg = [
          `✅ *TAREFA CONCLUÍDA — sua validação*${t.numero != null ? ` #${String(t.numero).padStart(4, '0')}` : ''}`,
          '', `🏪 ${t.loja}`, `📋 ${t.titulo}`, `👤 Executada por: ${t.responsavel_nome || '—'}`,
          t.resultado_final ? `\n📄 Retorno: ${t.resultado_final}` : '',
          '', `Confirme se o serviço foi realizado e dê sua avaliação:\n${linkTarefa(t, 'solic')}`,
          '_Amore Gestão_',
        ].filter(l => l !== '').join('\n')
        await zapPara(t.solicitante_nome, phone, msg, { titulo: `Validar: ${t.titulo}`, refId: t.id })
      }
      await load()
    } finally { setDetalheSaving(false) }
  }

  // Validação (nota 1-5 + feedback) é feita SÓ pelo solicitante, via o link público (tarefa.html?papel=solic) —
  // ver enviarParaValidacao acima. O painel interno não tem mais um formulário para "validar por ele".

  // ── Editar campos da tarefa (com registro no histórico) ──
  const abrirEdicao = (t: Tarefa) => {
    setEditForm({
      titulo: t.titulo, loja: t.loja, setor: t.setor, prioridade: t.prioridade,
      responsavel_nome: t.responsavel_nome || '', solicitante_nome: t.solicitante_nome || '',
      prazo: t.prazo ? String(t.prazo).slice(0, 10) : '', descricao: t.descricao || '',
    })
    setEditMode(true)
  }
  const salvarEdicao = async () => {
    if (!detalhe || !editForm) return
    const campos: [string, string][] = [
      ['titulo', 'Título'], ['loja', 'Loja'], ['setor', 'Setor'], ['prioridade', 'Prioridade'],
      ['responsavel_nome', 'Responsável'], ['solicitante_nome', 'Solicitante'], ['prazo', 'Prazo'], ['descricao', 'Descrição'],
    ]
    const upd: any = {}; const logs: { campo: string; de: string; para: string }[] = []
    for (const [k, lbl] of campos) {
      const a = String((detalhe as any)[k] ?? '')
      const n = String(editForm[k] ?? '')
      if (a !== n) { upd[k] = n || null; logs.push({ campo: lbl, de: a || '—', para: n || '—' }) }
    }
    if (logs.length === 0) { setEditMode(false); return }
    if (!editForm.titulo?.trim()) { alert('O título não pode ficar vazio.'); return }
    setDetalheSaving(true)
    try {
      await updateTarefa(detalhe.id, upd)
      for (const l of logs) {
        await insertTarefaHistorico({ tarefa_id: detalhe.id, acao: 'Campo alterado', campo: l.campo, valor_anterior: l.de, valor_novo: l.para, usuario_nome: user?.name || 'Sistema' })
      }
      setEditMode(false)
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Registrar desvio da execução ─────────────────────────
  const registrarDesvio = async (t: Tarefa) => {
    if (!desvioForm.trim()) return
    setDetalheSaving(true)
    try {
      await saveTV2(t, { desvio_motivo: desvioForm.trim(), desvio_em: new Date().toISOString(), desvio_por: user?.name || t.responsavel_nome || null })
      await insertTarefaHistorico({ tarefa_id: t.id, acao: 'Desvio registrado na execução', campo: null, valor_anterior: null, valor_novo: desvioForm.trim(), usuario_nome: user?.name || 'Sistema' })
      setDesvioForm('')
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Solicitar apoio de outro setor (marca impedimento) ───
  const solicitarApoioSetor = async (t: Tarefa) => {
    if (!apoioForm.setor) return
    setDetalheSaving(true)
    try {
      await saveTV2(t, { apoio_setor: apoioForm.setor, apoio_motivo: apoioForm.motivo || null, apoio_em: new Date().toISOString(), apoio_por: user?.name || null })
      if (isAtiva(t.status) && t.status !== 'aguardando_retorno') await updateTarefa(t.id, { status: 'aguardando_retorno' })
      await insertTarefaHistorico({ tarefa_id: t.id, acao: `Apoio solicitado ao setor ${apoioForm.setor}`, campo: null, valor_anterior: null, valor_novo: apoioForm.motivo || null, usuario_nome: user?.name || 'Sistema' })
      setApoioForm({ setor: '', motivo: '' })
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Responsável informa orçamento → dispara aprovação Wagner/Aline ──
  const enviarOrcamento = async (t: Tarefa) => {
    const valor = orcEntry.valor ? Number(orcEntry.valor) : null
    if (valor == null && !orcEntry.anexos.trim()) { alert('Informe o valor ou anexe o orçamento.'); return }
    setDetalheSaving(true)
    try {
      const patch = {
        gera_custo: true,
        orcamento_valor: valor,
        orcamento_descricao: orcEntry.descricao || null,
        orcamento_fornecedor: orcEntry.fornecedor || null,
        orcamento_data: orcEntry.data || null,
        orcamento_obs: orcEntry.obs || null,
        orcamento_anexos: orcEntry.anexos || null,
        orcamento_status: 'aguardando' as const,
      }
      await saveTV2(t, patch)
      if (valor != null && t.custo_previsto == null) await updateTarefa(t.id, { custo_previsto: valor })
      await insertTarefaHistorico({ tarefa_id: t.id, acao: `Orçamento enviado para aprovação${valor != null ? ` (${fmtMoeda(valor)})` : ''}`, campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || t.responsavel_nome || 'Responsável' })
      await notificarOrcamentoAprovadores({ ...t, ...patch } as Tarefa)
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Aprovar / reprovar orçamento (Wagner/Aline) ──────────
  const decidirOrcamento = async (t: Tarefa, aprovar: boolean) => {
    setDetalheSaving(true)
    try {
      const valorAprovado = aprovar ? (orcForm.valor ? Number(orcForm.valor) : (t.orcamento_valor ?? null)) : null
      await saveTV2(t, {
        orcamento_status: aprovar ? 'aprovado' : 'reprovado',
        orcamento_aprovado_valor: valorAprovado,
        orcamento_aprovado_por: user?.name || 'Gestor',
        orcamento_aprovado_em: new Date().toISOString(),
        orcamento_obs_aprovacao: orcForm.obs || null,
      })
      // Estimado (custo_previsto) é coluna real — mantém sincronizado se ainda vazio
      if (aprovar && valorAprovado != null && t.custo_previsto == null) {
        await updateTarefa(t.id, { custo_previsto: valorAprovado })
      }
      await insertTarefaHistorico({ tarefa_id: t.id, acao: aprovar ? `Orçamento APROVADO (${fmtMoeda(valorAprovado)})` : 'Orçamento REPROVADO', campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Gestor' })
      // Avisa o responsável do resultado
      const phone = whatsappDoResponsavel(t.responsavel_nome || '')
      if (phone) {
        const msg = aprovar
          ? `✅ *Orçamento APROVADO* — ${t.titulo}\nValor: ${fmtMoeda(valorAprovado)}\nPode executar. ${linkTarefa(t, 'resp')}`
          : `⛔ *Orçamento REPROVADO* — ${t.titulo}${orcForm.obs ? `\nMotivo: ${orcForm.obs}` : ''}\n${linkTarefa(t, 'resp')}`
        await zapPara(t.responsavel_nome || '', phone, msg, { titulo: `Orçamento ${aprovar ? 'aprovado' : 'reprovado'}: ${t.titulo}`, refId: t.id })
      }
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Solicitar mais prazo (responsável) ───────────────────
  const solicitarExtensao = async () => {
    if (!detalhe || !extForm.data) return
    setDetalheSaving(true)
    try {
      await updateTarefa(detalhe.id, {
        prazo_extensao_data: extForm.data,
        prazo_extensao_motivo: extForm.motivo || null,
        prazo_extensao_status: 'pendente',
      })
      await insertTarefaHistorico({ tarefa_id: detalhe.id, acao: 'Solicitou prazo adicional', campo: 'prazo', valor_anterior: detalhe.prazo, valor_novo: extForm.data, usuario_nome: user?.name || 'Sistema' })
      setExtForm({ data: '', motivo: '' })
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Responder solicitação de prazo (gestor) ──────────────
  const responderExtensao = async (t: Tarefa, aprovar: boolean) => {
    setDetalheSaving(true)
    try {
      if (aprovar) {
        await updateTarefa(t.id, { prazo: t.prazo_extensao_data, prazo_extensao_status: 'aprovado' })
        await insertTarefaHistorico({ tarefa_id: t.id, acao: 'Prazo adicional APROVADO', campo: 'prazo', valor_anterior: t.prazo, valor_novo: t.prazo_extensao_data, usuario_nome: user?.name || 'Gestor' })
      } else {
        await updateTarefa(t.id, { prazo_extensao_status: 'negado' })
        await insertTarefaHistorico({ tarefa_id: t.id, acao: 'Prazo adicional NEGADO', campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Gestor' })
      }
      await load()
    } finally { setDetalheSaving(false) }
  }

  // ── Deletar tarefa ───────────────────────────────────────
  const excluirTarefa = async (t: Tarefa) => {
    if (!confirm(`Excluir "${t.titulo}"?`)) return
    await deleteTarefa(t.id)
    setDetalhe(null)
    await load()
  }

  // ── Relatório individual da tarefa (abre janela de impressão → Salvar como PDF) ──
  const gerarPdfTarefa = (t: Tarefa) => {
    const win = window.open('', '_blank')
    if (!win) { alert('Não foi possível abrir a janela de impressão (pop-up bloqueado).'); return }
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
    const linhaMeta = (l: string, v: string) => `<div class="meta-item"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`
    const numeroTxt = t.numero != null ? `#${String(t.numero).padStart(4, '0')}` : ''
    const tempos = tempoPorStatusDetalhe(t)
    const eventos = [
      ...(t.transicoes || []).map(tr => ({ em: tr.em, tipo: '🔄 Status', txt: `${tr.de ? statusLabel(tr.de as TarefaStatus) + ' → ' : ''}${statusLabel(tr.para as TarefaStatus)}`, por: tr.por, obs: tr.obs })),
      ...(t.comentarios || []).map(c => ({ em: c.created_at, tipo: `${tipoAtualizacaoInfo(c.tipo).emoji} ${tipoAtualizacaoInfo(c.tipo).label}`, txt: c.texto, por: c.autor_nome, obs: null as string | null | undefined })),
    ].sort((a, b) => b.em.localeCompare(a.em))
    const checklist = t.checklist || []
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório — Tarefa ${esc(numeroTxt)} ${esc(t.titulo)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:24px;max-width:860px;margin:0 auto}
  h1{font-size:19px;margin:0 0 2px}
  .sub{color:#6b7280;font-size:12px;margin-bottom:16px}
  .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:16px}
  .meta-item .l{font-size:10px;color:#6b7280;font-weight:700}
  .meta-item .v{font-size:13px;margin-top:2px}
  h2{font-size:13px;border-bottom:2px solid #7c2d12;padding-bottom:4px;margin:18px 0 8px}
  .bar-row{display:flex;align-items:center;gap:8px;font-size:11.5px;margin-bottom:4px}
  .bar-track{flex:1;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden}
  .bar-fill{height:100%;background:#7c2d12}
  .evento{border-left:2px solid #e5e7eb;padding:4px 0 8px 10px;margin-left:2px;font-size:12px}
  .evento .tipo{font-weight:700}
  .evento .meta-ev{color:#6b7280;font-size:10.5px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  td{padding:3px 0}
  @media print{ body{padding:8px} }
</style></head><body>
  <h1>${esc(numeroTxt)} ${esc(t.titulo)}</h1>
  <div class="sub">Relatório gerado pelo Painel Amore em ${esc(fmtDataHora(new Date().toISOString()))}</div>
  <div class="meta">
    ${linhaMeta('Loja', t.loja)}
    ${linhaMeta('Status', statusLabel(t.status))}
    ${linhaMeta('Prioridade', prioLabel(t.prioridade))}
    ${linhaMeta('Setor', t.setor)}
    ${linhaMeta('Solicitante', t.solicitante_nome || '—')}
    ${linhaMeta('Responsável', t.responsavel_nome || '—')}
    ${linhaMeta('Data da solicitação', t.data_solicitacao ? fmtData(t.data_solicitacao) : fmtData(t.created_at))}
    ${linhaMeta('Prazo', t.prazo ? fmtData(t.prazo) : 'Sem prazo')}
    ${linhaMeta('Concluída em', t.concluido_em ? fmtDataHora(t.concluido_em) : '—')}
  </div>
  ${t.descricao ? `<h2>Descrição</h2><div style="font-size:12.5px;white-space:pre-wrap">${esc(t.descricao)}</div>` : ''}
  ${checklist.length ? `<h2>Checklist (${checklist.filter(c => c.concluido).length}/${checklist.length})</h2><table>${checklist.map(c => `<tr><td>${c.concluido ? '☑' : '☐'}</td><td>${esc(c.descricao)}</td></tr>`).join('')}</table>` : ''}
  ${tempos.length ? `<h2>Tempo por etapa</h2>${(() => { const tot = tempos.reduce((s, b) => s + b.horas, 0) || 1; return tempos.map(b => `<div class="bar-row"><div style="width:130px">${esc(b.label)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(b.horas / tot * 100, 4)}%"></div></div><div style="width:60px;text-align:right;color:#6b7280">${fmtDur(b.horas)}</div></div>`).join('') })()}` : ''}
  ${(t.custo_previsto || t.custo_executado) ? `<h2>Custo</h2><table><tr><td>Previsto</td><td style="text-align:right">${esc(fmtMoeda(t.custo_previsto))}</td></tr><tr><td>Executado</td><td style="text-align:right">${esc(fmtMoeda(t.custo_executado))}</td></tr></table>` : ''}
  ${t.aval_nota != null ? `<h2>Feedback do solicitante</h2><div style="font-size:12.5px">${'★'.repeat(t.aval_nota)}${'☆'.repeat(5 - t.aval_nota)} ${t.aval_feedback ? '— ' + esc(t.aval_feedback) : ''}</div>` : ''}
  <h2>Histórico completo</h2>
  ${eventos.length === 0 ? '<div style="font-size:12px;color:#6b7280">Sem eventos registrados.</div>' : eventos.map(e => `<div class="evento"><div class="tipo">${esc(e.tipo)}</div>${e.txt ? `<div>${esc(e.txt)}</div>` : ''}${e.obs ? `<div>${esc(e.obs)}</div>` : ''}<div class="meta-ev">${esc(e.por || '')} · ${esc(fmtDataHora(e.em))}</div></div>`).join('')}
</body></html>`
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  // ── Contadores ───────────────────────────────────────────
  const counts = COLUNAS.reduce((acc, col) => {
    acc[col.id] = tarefasFiltradas.filter(t => t.status === col.id).length
    return acc
  }, {} as Record<TarefaStatus, number>)

  // ── Métricas de gestão ───────────────────────────────────
  const ativas = tarefasFiltradas.filter(t => isAtiva(t.status))
  const metricas = {
    total: tarefasFiltradas.length,
    emAndamento: tarefasFiltradas.filter(t => t.status === 'em_andamento').length,
    atrasadas: ativas.filter(t => vencido(t.prazo)).length,
    concluidas: tarefasFiltradas.filter(t => isFinal(t.status)).length,
    pctConclusao: tarefasFiltradas.length > 0
      ? Math.round((tarefasFiltradas.filter(t => isFinal(t.status)).length / tarefasFiltradas.length) * 100)
      : 0,
  }

  // ── Painel Gerencial (módulo 13 — Gerente Operacional) ────
  const hojeStr = new Date().toISOString().slice(0, 10)
  const noPrazo = (t: Tarefa) => !t.prazo || !t.concluido_em || String(t.concluido_em).slice(0, 10) <= String(t.prazo).slice(0, 10)
  // Recorte de período do Painel (não afeta Kanban/Lista, só as métricas desta aba) — por data de criação.
  const tarefasPainel = tarefasFiltradas.filter(t => {
    if (periodoPainel === 'todos') return true
    const d = String(t.created_at).slice(0, 10)
    if (periodoPainel === '7d') { const lim = new Date(); lim.setDate(lim.getDate() - 7); return d >= lim.toISOString().slice(0, 10) }
    if (periodoPainel === '30d') { const lim = new Date(); lim.setDate(lim.getDate() - 30); return d >= lim.toISOString().slice(0, 10) }
    if (periodoPainel === 'custom') return (!periodoDe || d >= periodoDe) && (!periodoAte || d <= periodoAte)
    return true
  })
  const ativasPainel = tarefasPainel.filter(t => isAtiva(t.status))
  const agrupaTarefas = (keyFn: (t: Tarefa) => string | null) => {
    const m: Record<string, { total: number; concl: number; atras: number; pontuais: number }> = {}
    for (const t of tarefasPainel) {
      const k = keyFn(t) || '—'
      if (!m[k]) m[k] = { total: 0, concl: 0, atras: 0, pontuais: 0 }
      m[k].total++
      if (isFinal(t.status)) { m[k].concl++; if (noPrazo(t)) m[k].pontuais++ }
      if (isAtiva(t.status) && vencido(t.prazo)) m[k].atras++
    }
    return Object.entries(m).map(([chave, v]) => ({
      chave, ...v,
      pctConcl: v.total ? Math.round(v.concl / v.total * 100) : 0,
      pontualidade: v.concl ? Math.round(v.pontuais / v.concl * 100) : 0,
    }))
  }
  const gerPorColab = agrupaTarefas(t => t.responsavel_nome).sort((a, b) => b.pontualidade - a.pontualidade || b.pctConcl - a.pctConcl)
  const gerPorSetor = agrupaTarefas(t => t.setor).sort((a, b) => b.pctConcl - a.pctConcl)
  const gerPorLoja = agrupaTarefas(t => t.loja).sort((a, b) => b.pctConcl - a.pctConcl)
  const concluidas = tarefasPainel.filter(t => isFinal(t.status))
  const temposExec = concluidas.filter(t => t.iniciado_em && t.concluido_em)
    .map(t => (new Date(t.concluido_em!).getTime() - new Date(t.iniciado_em!).getTime()) / 3600000).filter(h => h >= 0)
  const media = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  // Tempo de resposta: solicitação → recebimento
  const refIni = (t: Tarefa) => t.data_solicitacao || t.created_at
  const temposResposta = tarefasPainel.filter(t => t.recebido_em)
    .map(t => (new Date(t.recebido_em!).getTime() - new Date(refIni(t)).getTime()) / 3600000).filter(h => h >= 0)
  // Avaliações do solicitante
  const notas = tarefasPainel.filter(t => t.aval_nota != null).map(t => t.aval_nota as number)
  const sum = (arr: (number | null | undefined)[]) => arr.reduce<number>((a, b) => a + (b || 0), 0)
  const ger = {
    hoje: tarefasPainel.filter(t => String(t.prazo || '').slice(0, 10) === hojeStr).length,
    andamento: tarefasPainel.filter(t => t.status === 'em_andamento').length,
    concluidas: concluidas.length,
    conclAtraso: concluidas.filter(t => !noPrazo(t)).length,
    atrasadas: ativasPainel.filter(t => vencido(t.prazo)).length,
    vencidas: ativasPainel.filter(t => vencido(t.prazo)).length,
    criticas: ativasPainel.filter(t => t.prioridade === 'urgente').length,
    aguardAprov: tarefasPainel.filter(t => t.precisa_aprovacao && isFinal(t.status) && !t.aprovado_por).length,
    aguardValidacao: tarefasPainel.filter(t => t.status === 'aguardando_validacao').length,
    impedimento: tarefasPainel.filter(t => t.status === 'aguardando_retorno' || t.status === 'aguardando_fornecedor').length,
    orcAguard: tarefasPainel.filter(t => t.orcamento_status === 'aguardando').length,
    tempoMedioH: media(temposExec),
    tempoRespostaH: media(temposResposta),
    produtividade: tarefasPainel.length ? Math.round(concluidas.length / tarefasPainel.length * 100) : 0,
    disciplina: concluidas.length ? Math.round(concluidas.filter(noPrazo).length / concluidas.length * 100) : 0,
    avalMedia: notas.length ? (sum(notas) / notas.length) : null,
    avalQtd: notas.length,
    custoEstimado: sum(tarefasPainel.map(t => t.custo_previsto)),
    custoAprovado: sum(tarefasPainel.map(t => t.orcamento_aprovado_valor)),
    custoRealizado: sum(tarefasPainel.map(t => t.custo_executado)),
  }
  const fmtDur = (h: number) => h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`

  // ── Gargalo por etapa: onde as tarefas ATIVAS estão parando agora, e há quanto tempo ──
  const gargalo = (() => {
    const m: Record<string, number[]> = {}
    for (const t of ativasPainel) (m[t.status] ||= []).push(tempoNoStatusAtual(t))
    const total = ativasPainel.length
    return Object.entries(m).map(([status, horas]) => ({
      status, label: statusLabel(status as TarefaStatus),
      qtd: horas.length,
      pct: total ? Math.round(horas.length / total * 100) : 0,
      horasMedia: horas.reduce((a, b) => a + b, 0) / horas.length,
    })).sort((a, b) => b.qtd - a.qtd)
  })()

  // ── Evolução semanal (últimas 8 semanas, seg-a-seg): criadas × concluídas × concluídas com atraso ──
  const evolucaoSemanal = (() => {
    const semanaKey = (iso: string) => {
      const d = new Date(String(iso).slice(0, 10) + 'T00:00:00')
      const day = d.getDay() || 7
      d.setDate(d.getDate() - day + 1)
      return d.toISOString().slice(0, 10)
    }
    const semanas: string[] = []
    for (let i = 7; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i * 7)
      const k = semanaKey(d.toISOString())
      if (!semanas.includes(k)) semanas.push(k)
    }
    return semanas.map(sem => {
      const criadas = tarefasFiltradas.filter(t => semanaKey(t.created_at) === sem).length
      const concl = tarefasFiltradas.filter(t => t.concluido_em && semanaKey(t.concluido_em) === sem)
      return { semana: sem, criadas, concluidas: concl.length, atrasadas: concl.filter(t => !noPrazo(t)).length }
    })
  })()

  // ── Pendências que precisam de atenção AGORA (independe do filtro de período do Painel) ──
  const ativasAgora = tarefasFiltradas.filter(t => isAtiva(t.status))
  const pendencias = [
    { id: 'atrasadas', emoji: '🔴', label: 'atrasada(s)', cor: '#dc2626', itens: ativasAgora.filter(t => vencido(t.prazo)) },
    { id: 'semResp', emoji: '👤', label: 'sem responsável', cor: '#6b7280', itens: ativasAgora.filter(t => !t.responsavel_nome) },
    { id: 'bloqueadas', emoji: '⚫', label: 'bloqueada(s) (impedimento)', cor: '#374151', itens: ativasAgora.filter(t => STATUS_IMPEDIMENTO.includes(t.status)) },
    { id: 'semPosicionamento', emoji: '🟡', label: 'sem posicionamento do responsável', cor: '#d97706', itens: ativasAgora.filter(t => t.responsavel_nome && !t.aceite_status) },
    { id: 'aguardValidacao', emoji: '🟡', label: 'aguardando validação do solicitante', cor: '#ca8a04', itens: ativasAgora.filter(t => t.status === 'aguardando_validacao') },
    { id: 'aguardAprov', emoji: '💰', label: 'aguardando aprovação financeira/orçamento', cor: '#9333ea', itens: ativasAgora.filter(t => t.orcamento_status === 'aguardando') },
    { id: 'semAtualizacao', emoji: '🟠', label: 'sem atualização há mais de 48h', cor: '#ea580c', itens: ativasAgora.filter(t => {
      const ultimo = montaTimeline(t)[0]?.em || t.created_at
      return (Date.now() - new Date(ultimo).getTime()) / 3600000 > 48
    }) },
  ].filter(p => p.itens.length > 0)

  const tabelaRank = (titulo: string, linhas: ReturnType<typeof agrupaTarefas>, comPontualidade: boolean) => (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{titulo}</div>
      {linhas.length === 0 ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sem dados.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ color: 'var(--muted)' }}>
            <th style={{ padding: '4px 6px', textAlign: 'left' }}>#</th>
            <th style={{ textAlign: 'left' }}>Nome</th>
            <th style={{ textAlign: 'center' }}>Concl.</th>
            <th style={{ textAlign: 'center' }}>Atras.</th>
            <th style={{ textAlign: 'right' }}>{comPontualidade ? 'Pontual.' : '% concl.'}</th>
          </tr></thead>
          <tbody>
            {linhas.map((l, i) => {
              const val = comPontualidade ? l.pontualidade : l.pctConcl
              return (
                <tr key={l.chave} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '5px 6px', color: 'var(--muted)' }}>{i + 1}</td>
                  <td>{l.chave}</td>
                  <td style={{ textAlign: 'center' }}>{l.concl}/{l.total}</td>
                  <td style={{ textAlign: 'center', color: l.atras ? '#dc2626' : 'inherit', fontWeight: l.atras ? 700 : 400 }}>{l.atras}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: val >= 80 ? '#16a34a' : val >= 50 ? '#d97706' : '#dc2626' }}>{val}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Central Operacional de Tarefas</h2>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            {tarefas.length} tarefa{tarefas.length !== 1 ? 's' : ''} · loja <strong>{loja}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {([['kanban', '⊞ Kanban'], ['lista', '☰ Lista'], ['gerencial', '📊 Painel']] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '8px 12px', border: 'none', cursor: 'pointer', fontSize: 13, background: view === v ? 'var(--bordo)' : 'var(--card)', color: view === v ? '#fff' : 'var(--text)' }}>
                {lbl}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setForm({ ...emptyForm(), loja: (loja && loja !== 'Todas as Lojas' ? loja : '') }); setRespModo('lista'); setShowForm(true) }}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} /> Nova Tarefa
          </button>
        </div>
      </div>

      {/* ── Métricas de gestão ── */}
      {!loading && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { lbl: 'Total', val: metricas.total, cor: '#6b7280' },
            { lbl: 'Em andamento', val: metricas.emAndamento, cor: '#2563eb' },
            { lbl: 'Atrasadas', val: metricas.atrasadas, cor: '#dc2626' },
            { lbl: 'Finalizadas', val: metricas.concluidas, cor: '#16a34a' },
            { lbl: '% Conclusão', val: `${metricas.pctConclusao}%`, cor: '#9333ea' },
          ].map(m => (
            <div key={m.lbl} style={{ flex: '1 1 110px', minWidth: 110, background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${m.cor}`, borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: m.cor, lineHeight: 1.1 }}>{m.val}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar tarefa ou responsável..."
            style={{ width: '100%', paddingLeft: 30, padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }} />
        </div>
        <select value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}>
          <option value="">🏪 Todas as lojas</option>
          {lojas.filter(l => l && l !== 'Todas as Lojas').map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}>
          <option value="">Todos os setores</option>
          {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtroPrio} onChange={e => setFiltroPrio(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}>
          <option value="">Todas as prioridades</option>
          {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {(busca || filtroSetor || filtroPrio || filtroLoja) && (
          <button onClick={() => { setBusca(''); setFiltroSetor(''); setFiltroPrio(''); setFiltroLoja('') }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <X size={13} /> Limpar
          </button>
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', opacity: 0.4 }} />
        </div>
      )}

      {/* ══════════════════════════════
          PAINEL GERENCIAL (Gerente Operacional)
      ══════════════════════════════ */}
      {!loading && view === 'gerencial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Cobranças automáticas por WhatsApp: <strong style={{ color: cobrancaCfg?.ativo ? '#16a34a' : '#dc2626' }}>{cobrancaCfg?.ativo ? 'ATIVAS' : 'desativadas'}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {([['todos', 'Tudo'], ['7d', '7 dias'], ['30d', '30 dias'], ['custom', 'Período']] as const).map(([v, lbl]) => (
                  <button key={v} onClick={() => setPeriodoPainel(v)}
                    style={{ padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: 12, background: periodoPainel === v ? 'var(--bordo)' : 'var(--card)', color: periodoPainel === v ? '#fff' : 'var(--text)' }}>
                    {lbl}
                  </button>
                ))}
              </div>
              {periodoPainel === 'custom' && (
                <>
                  <input type="date" value={periodoDe} onChange={e => setPeriodoDe(e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>até</span>
                  <input type="date" value={periodoAte} onChange={e => setPeriodoAte(e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                </>
              )}
              <button onClick={() => setShowCobranca(true)}
                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚙️ Regras de cobrança
              </button>
            </div>
          </div>
          {/* Pendências que precisam de atenção agora */}
          {pendencias.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🚨 Pendências que precisam de atenção</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pendencias.map(p => (
                  <div key={p.id}>
                    <button onClick={() => setPendenciaAberta(a => a === p.id ? null : p.id)}
                      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 12.5 }}>
                      <span style={{ color: p.cor, fontWeight: 700 }}>{p.emoji} {p.itens.length} tarefa(s) {p.label}</span>
                      <ChevronDown size={13} style={{ transform: pendenciaAberta === p.id ? 'rotate(180deg)' : 'none', color: 'var(--muted)' }} />
                    </button>
                    {pendenciaAberta === p.id && (
                      <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {p.itens.slice(0, 20).map(t => (
                          <div key={t.id} onClick={() => { setDetalhe(t); setPendenciaAberta(null) }}
                            style={{ fontSize: 12, cursor: 'pointer', color: 'var(--bordo)', display: 'flex', gap: 6 }}>
                            <span style={{ color: 'var(--muted)' }}>{t.numero != null ? `#${String(t.numero).padStart(4, '0')}` : ''}</span>
                            <span>{t.titulo}</span>
                            <span style={{ color: 'var(--muted)' }}>· {t.responsavel_nome || 'sem responsável'}</span>
                          </div>
                        ))}
                        {p.itens.length > 20 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>+ {p.itens.length - 20} outra(s)…</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[
              { lbl: 'Prazo hoje', val: ger.hoje, cor: '#2563eb' },
              { lbl: 'Em andamento', val: ger.andamento, cor: '#2563eb' },
              { lbl: 'Concluídas', val: ger.concluidas, cor: '#16a34a' },
              { lbl: 'Concluídas c/ atraso', val: ger.conclAtraso, cor: '#d97706' },
              { lbl: 'Atrasadas', val: ger.atrasadas, cor: '#dc2626' },
              { lbl: 'Vencidas', val: ger.vencidas, cor: '#dc2626' },
              { lbl: 'Críticas (urgente)', val: ger.criticas, cor: '#dc2626' },
              { lbl: 'Aguardando validação', val: ger.aguardValidacao, cor: '#ca8a04' },
              { lbl: 'Aguardando aprovação', val: ger.aguardAprov, cor: '#9333ea' },
              { lbl: 'Orçamento p/ aprovar', val: ger.orcAguard, cor: '#9333ea' },
              { lbl: 'Com impedimento', val: ger.impedimento, cor: '#d97706' },
              { lbl: 'Tempo médio resposta', val: ger.tempoRespostaH == null ? '—' : fmtDur(ger.tempoRespostaH), cor: '#0891b2' },
              { lbl: 'Tempo médio execução', val: ger.tempoMedioH == null ? '—' : fmtDur(ger.tempoMedioH), cor: '#6b7280' },
              { lbl: 'Avaliação média', val: ger.avalMedia == null ? '—' : `${ger.avalMedia.toFixed(1)}★`, cor: '#f59e0b' },
              { lbl: 'Índice produtividade', val: `${ger.produtividade}%`, cor: '#9333ea' },
              { lbl: 'Índice disciplina', val: `${ger.disciplina}%`, cor: ger.disciplina >= 80 ? '#16a34a' : ger.disciplina >= 50 ? '#d97706' : '#dc2626' },
              { lbl: 'Custo estimado', val: fmtMoeda(ger.custoEstimado), cor: '#6b7280' },
              { lbl: 'Custo aprovado', val: fmtMoeda(ger.custoAprovado), cor: '#2563eb' },
              { lbl: 'Custo realizado', val: fmtMoeda(ger.custoRealizado), cor: '#16a34a' },
            ].map(m => (
              <div key={m.lbl} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${m.cor}`, borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: m.cor, lineHeight: 1.1 }}>{m.val}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.lbl}</div>
              </div>
            ))}
          </div>
          {/* Gargalo por etapa — onde as tarefas ativas estão parando agora */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🚧 Onde as tarefas ativas estão parando</div>
            {gargalo.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhuma tarefa ativa no período.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {gargalo.map(g => {
                  const col = COLUNAS.find(c => c.id === g.status)
                  return (
                    <div key={g.status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 150, fontSize: 12, flexShrink: 0 }}>{g.label}</div>
                      <div style={{ flex: 1, height: 18, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(g.pct, 3)}%`, background: col?.cor || '#6b7280', borderRadius: 6, transition: 'width .3s' }} />
                      </div>
                      <div style={{ width: 130, fontSize: 12, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>
                        {g.qtd} ({g.pct}%) · média {fmtDur(g.horasMedia)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Evolução semanal — últimas 8 semanas */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>📈 Evolução semanal</div>
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
              <span>🔵 criadas</span><span>🟢 concluídas</span><span>🟠 concluídas com atraso</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 120, overflowX: 'auto', paddingBottom: 4 }}>
              {(() => {
                const maxV = Math.max(1, ...evolucaoSemanal.map(s => Math.max(s.criadas, s.concluidas)))
                return evolucaoSemanal.map(s => (
                  <div key={s.semana} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 46 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
                      <div title={`${s.criadas} criadas`} style={{ width: 10, height: `${(s.criadas / maxV) * 90}px`, background: '#2563eb', borderRadius: '3px 3px 0 0' }} />
                      <div title={`${s.concluidas} concluídas`} style={{ width: 10, height: `${(s.concluidas / maxV) * 90}px`, background: '#16a34a', borderRadius: '3px 3px 0 0' }} />
                      <div title={`${s.atrasadas} concluídas com atraso`} style={{ width: 10, height: `${(s.atrasadas / maxV) * 90}px`, background: '#d97706', borderRadius: '3px 3px 0 0' }} />
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtData(s.semana).slice(0, 5)}</div>
                  </div>
                ))
              })()}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {tabelaRank('🏆 Pontualidade por colaborador', gerPorColab, true)}
            {tabelaRank('🏢 Desempenho por setor', gerPorSetor, false)}
            {tabelaRank('🏪 Desempenho por unidade', gerPorLoja, false)}
          </div>
        </div>
      )}

      {showCobranca && cobrancaCfg && (
        <CobrancaModal cfg={cobrancaCfg} onClose={() => setShowCobranca(false)}
          onSaved={c => { setCobrancaCfg(c); setShowCobranca(false) }} />
      )}

      {/* ══════════════════════════════
          KANBAN
      ══════════════════════════════ */}
      {!loading && view === 'kanban' && (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', flex: 1, minHeight: 0, minWidth: 0, paddingBottom: 8 }}>
          {COLUNAS.map(col => {
            const cards = tarefasFiltradas.filter(t => t.status === col.id)
            return (
              <div key={col.id} style={{ minWidth: 260, maxWidth: 300, flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Cabeçalho coluna */}
                <div style={{ padding: '10px 12px', borderRadius: 10, background: col.bg, borderTop: `3px solid ${col.cor}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: col.cor }}>{col.label}</span>
                  <span style={{ background: col.cor, color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{counts[col.id]}</span>
                </div>

                {/* Cards — também aceita soltar um card arrastado de outra coluna */}
                <div
                  onDragOver={e => { e.preventDefault(); if (dragOverCol !== col.id) setDragOverCol(col.id) }}
                  onDragLeave={() => setDragOverCol(c => c === col.id ? null : c)}
                  onDrop={e => {
                    e.preventDefault()
                    setDragOverCol(null)
                    const id = e.dataTransfer.getData('text/plain')
                    const t = tarefas.find(x => x.id === id)
                    if (t && t.status !== col.id) abrirTransicao(t, col.id)
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 320px)', borderRadius: 10, outline: dragOverCol === col.id ? `2px dashed ${col.cor}` : 'none', outlineOffset: 2, transition: 'outline .1s' }}>
                  {cards.map(t => (
                    <KanbanCard
                      key={t.id}
                      tarefa={t}
                      onClick={() => { setDetalhe(t); setAbaDetalhe('checklist') }}
                      onMover={abrirTransicao}
                      colunas={COLUNAS}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 8px', color: 'var(--muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
                      Nenhuma tarefa
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══════════════════════════════
          LISTA
      ══════════════════════════════ */}
      {!loading && view === 'lista' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Tarefa', 'Setor', 'Responsável', 'Prazo', 'Prioridade', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tarefasFiltradas.map(t => {
                const col = COLUNAS.find(c => c.id === t.status)
                const prio = PRIORIDADES.find(p => p.id === t.prioridade)
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => { setDetalhe(t); setAbaDetalhe('checklist') }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                      {t.reaberta && <span style={{ fontSize: 10, background: '#fef9c3', color: '#92400e', borderRadius: 4, padding: '1px 5px', marginRight: 6 }}>Reaberta</span>}
                      {t.titulo}
                      {(t.checklist?.length ?? 0) > 0 && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>
                          ✓ {t.checklist?.filter(c => c.concluido).length}/{t.checklist?.length}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.setor}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{t.responsavel_nome || '—'}</td>
                    <td style={{ padding: '10px 12px', color: vencido(t.prazo) ? '#dc2626' : 'var(--muted)', fontWeight: vencido(t.prazo) ? 600 : 400 }}>
                      {t.prazo ? fmtData(t.prazo) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: prio?.cor + '20', color: prio?.cor, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{prio?.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: col?.bg, color: col?.cor, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{col?.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button onClick={e => { e.stopPropagation(); excluirTarefa(t) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {tarefasFiltradas.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Nenhuma tarefa encontrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════
          MODAL NOVA TAREFA
      ══════════════════════════════ */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Nova Solicitação de Tarefa</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {/* Título */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Título da tarefa *</label>
                <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ex: Manutenção emergencial no forno principal"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
              </div>

              {/* Loja solicitante */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Loja / unidade solicitante *</label>
                <select value={form.loja} onChange={e => setForm(f => ({ ...f, loja: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${form.loja ? 'var(--border)' : '#f59e0b'}`, background: 'var(--bg)', fontSize: 13 }}>
                  <option value="">Selecione a loja…</option>
                  {lojas.filter(l => l && l !== 'Todas as Lojas').map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* Setor + Prioridade */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Setor</label>
                  <select value={form.setor} onChange={e => setForm(f => ({ ...f, setor: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}>
                    {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Prioridade</label>
                  <select value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value as TarefaPrioridade }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}>
                    {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Responsável + Solicitante */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Responsável pela execução</label>
                  {respModo === 'lista' ? (
                    <select
                      value={responsaveis.includes(form.responsavel_nome) ? form.responsavel_nome : ''}
                      onChange={e => {
                        if (e.target.value === '__outro__') { setRespModo('outro'); setForm(f => ({ ...f, responsavel_nome: '' })) }
                        else setForm(f => ({ ...f, responsavel_nome: e.target.value }))
                      }}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}>
                      <option value="">Selecione o responsável…</option>
                      {responsaveis.map(nome => <option key={nome} value={nome}>{nome}</option>)}
                      <option value="__outro__">✏️ Outro (digitar)…</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={form.responsavel_nome} onChange={e => setForm(f => ({ ...f, responsavel_nome: e.target.value }))}
                        placeholder="Nome do responsável"
                        style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                      <button type="button" onClick={() => { setRespModo('lista'); setForm(f => ({ ...f, responsavel_nome: '' })) }}
                        title="Voltar para a lista"
                        style={{ padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>↩</button>
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11.5, cursor: 'pointer', color: 'var(--muted)' }}>
                    <input type="checkbox" checked={form.enviarWhats} onChange={e => setForm(f => ({ ...f, enviarWhats: e.target.checked }))} />
                    📲 Avisar no WhatsApp ao salvar
                    {form.responsavel_nome && (whatsappDoResponsavel(form.responsavel_nome) ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ nº ok</span> : <span style={{ color: 'var(--warning)', fontWeight: 700 }}>⚠ sem nº no cadastro</span>)}
                  </label>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Solicitante da tarefa</label>
                  <input value={form.solicitante_nome} onChange={e => setForm(f => ({ ...f, solicitante_nome: e.target.value }))}
                    placeholder={user?.name || 'Quem está solicitando'}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                </div>
              </div>

              {/* Data da solicitação + Prazo de entrega */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>📅 Data da solicitação</label>
                  <input type="date" value={form.data_solicitacao} onChange={e => setForm(f => ({ ...f, data_solicitacao: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>⏰ Prazo de entrega</label>
                  <input type="date" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                </div>
              </div>

              {/* Horários (disciplina de horário / cobrança) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>🕐 Hora de início</label>
                  <input type="time" value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>🕜 Hora limite</label>
                  <input type="time" value={form.horaLimite} onChange={e => setForm(f => ({ ...f, horaLimite: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                </div>
              </div>

              {/* Setores envolvidos */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>🤝 Setores envolvidos</label>
                <input value={form.envolvidos} onChange={e => setForm(f => ({ ...f, envolvidos: e.target.value }))}
                  placeholder="Áreas que apoiam a execução (ex: Compras, Financeiro, Manutenção)"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
              </div>

              {/* Descrição operacional */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>📝 Descrição da tarefa</label>
                <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  rows={4} placeholder="O que precisa ser feito · problema identificado · impacto na operação"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical' }} />
              </div>

              {/* Checklist */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Checklist</label>
                {form.checklist.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <CheckSquare size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{item}</span>
                    <button onClick={() => setForm(f => ({ ...f, checklist: f.checklist.filter((_, j) => j !== i) }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}><X size={12} /></button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input value={novoCheckItem} onChange={e => setNovoCheckItem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && novoCheckItem.trim()) { setForm(f => ({ ...f, checklist: [...f.checklist, novoCheckItem.trim()] })); setNovoCheckItem('') } }}
                    placeholder="Adicionar item ao checklist..."
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                  <button onClick={() => { if (novoCheckItem.trim()) { setForm(f => ({ ...f, checklist: [...f.checklist, novoCheckItem.trim()] })); setNovoCheckItem('') } }}
                    style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Aprovação */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.precisa_aprovacao} onChange={e => setForm(f => ({ ...f, precisa_aprovacao: e.target.checked }))} />
                Requer validação final do gestor
              </label>

              {/* Observações */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Observações</label>
                <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2} placeholder="Informações adicionais..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical' }} />
              </div>

              {/* Anexos */}
              <AnexoUploader value={form.anexos} onChange={v => setForm(f => ({ ...f, anexos: v || '' }))} pasta="tarefas" />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={criarTarefa} disabled={saving || !form.titulo.trim()}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving ? 'var(--border)' : 'var(--bordo)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                Criar Tarefa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          MODAL DETALHE
      ══════════════════════════════ */}
      {detalhe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 0 }}>
          <div style={{ background: 'var(--card)', width: '100%', maxWidth: 520, height: '100vh', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {detalhe.numero != null && <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--bordo)', color: '#fff', borderRadius: 4, padding: '2px 7px' }}>#{String(detalhe.numero).padStart(4, '0')}</span>}
                    {detalhe.reaberta && <span style={{ fontSize: 11, background: '#fef9c3', color: '#92400e', borderRadius: 4, padding: '2px 6px', display: 'inline-block' }}>↩ Reaberta</span>}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{detalhe.titulo}</h3>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => gerarPdfTarefa(detalhe)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }} title="Gerar relatório em PDF"><Printer size={15} /></button>
                  <button onClick={() => editMode ? setEditMode(false) : abrirEdicao(detalhe)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: editMode ? 'var(--bordo)' : 'var(--muted)', padding: 4 }} title="Editar"><Pencil size={15} /></button>
                  <button onClick={() => excluirTarefa(detalhe)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }} title="Excluir"><Trash2 size={15} /></button>
                  <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
                </div>
              </div>
            </div>

            {/* Painel de edição dos campos (gera registro no histórico) */}
            {editMode && editForm && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bordo)' }}>✏️ EDITAR TAREFA</div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Título</label>
                  <input value={editForm.titulo} onChange={e => setEditForm((f: any) => ({ ...f, titulo: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Loja</label>
                    <select value={editForm.loja} onChange={e => setEditForm((f: any) => ({ ...f, loja: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}>
                      {lojas.filter(l => l && l !== 'Todas as Lojas').map(l => <option key={l} value={l}>{l}</option>)}
                      {editForm.loja && !lojas.includes(editForm.loja) && <option value={editForm.loja}>{editForm.loja}</option>}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Setor</label>
                    <select value={editForm.setor} onChange={e => setEditForm((f: any) => ({ ...f, setor: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}>
                      {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
                      {editForm.setor && !SETORES.includes(editForm.setor) && <option value={editForm.setor}>{editForm.setor}</option>}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Prioridade</label>
                    <select value={editForm.prioridade} onChange={e => setEditForm((f: any) => ({ ...f, prioridade: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}>
                      {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Prazo</label>
                    <input type="date" value={editForm.prazo} onChange={e => setEditForm((f: any) => ({ ...f, prazo: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Responsável</label>
                    <input value={editForm.responsavel_nome} onChange={e => setEditForm((f: any) => ({ ...f, responsavel_nome: e.target.value }))}
                      list="resp-list" style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }} />
                    <datalist id="resp-list">{responsaveis.map(n => <option key={n} value={n} />)}</datalist>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Solicitante</label>
                    <input value={editForm.solicitante_nome} onChange={e => setEditForm((f: any) => ({ ...f, solicitante_nome: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Descrição</label>
                  <textarea value={editForm.descricao} onChange={e => setEditForm((f: any) => ({ ...f, descricao: e.target.value }))} rows={3}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditMode(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
                  <button onClick={salvarEdicao} disabled={detalheSaving} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Salvar alterações</button>
                </div>
              </div>
            )}

            {/* Meta */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Status */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>STATUS</div>
                <select value={detalhe.status}
                  onChange={e => abrirTransicao(detalhe, e.target.value as TarefaStatus)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}>
                  {COLUNAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              {/* Loja */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>LOJA</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <Store size={13} style={{ color: 'var(--muted)' }} />{detalhe.loja || '—'}
                </div>
              </div>
              {/* Prioridade */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>PRIORIDADE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}>
                  <Flag size={13} style={{ color: prioCor(detalhe.prioridade) }} />
                  <span style={{ color: prioCor(detalhe.prioridade), fontWeight: 600 }}>{prioLabel(detalhe.prioridade)}</span>
                </div>
              </div>
              {/* Responsável */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>RESPONSÁVEL</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <User size={13} style={{ color: 'var(--muted)' }} />
                  {detalhe.responsavel_nome || <span style={{ color: 'var(--muted)' }}>Não definido</span>}
                </div>
              </div>
              {/* Prazo */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>PRAZO</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: vencido(detalhe.prazo) ? '#dc2626' : 'var(--text)', fontWeight: vencido(detalhe.prazo) ? 600 : 400 }}>
                  {vencido(detalhe.prazo) && <AlertTriangle size={13} />}
                  <Clock size={13} style={{ color: 'var(--muted)' }} />
                  {detalhe.prazo ? fmtData(detalhe.prazo) : 'Sem prazo'}
                </div>
              </div>
              {/* SLA */}
              {slaInfo(detalhe) && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>SLA</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: slaInfo(detalhe)!.cor, fontWeight: 600 }}>
                    <Timer size={13} />{slaInfo(detalhe)!.txt}
                  </div>
                </div>
              )}
              {/* Setor */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>SETOR</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <Building2 size={13} style={{ color: 'var(--muted)' }} />{detalhe.setor}
                </div>
              </div>
              {/* Solicitante */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>SOLICITANTE</div>
                <div style={{ fontSize: 13 }}>{detalhe.solicitante_nome || '—'}</div>
              </div>
              {/* Data da solicitação */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>DATA DA SOLICITAÇÃO</div>
                <div style={{ fontSize: 13 }}>{detalhe.data_solicitacao ? fmtData(detalhe.data_solicitacao) : fmtData(detalhe.created_at)}</div>
              </div>
              {/* Setores envolvidos */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>SETORES ENVOLVIDOS</div>
                <div style={{ fontSize: 13 }}>{detalhe.envolvidos || '—'}</div>
              </div>
            </div>

            {/* Descrição da tarefa */}
            {detalhe.descricao && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>📝 DESCRIÇÃO DA TAREFA</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{detalhe.descricao}</div>
              </div>
            )}

            {/* Anexos */}
            {detalhe.anexos && (
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>📎 ANEXOS</div>
                <AnexoLinks value={detalhe.anexos} />
              </div>
            )}

            {/* Ações */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={linkTarefa(detalhe)} target="_blank" rel="noreferrer"
                style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', color: 'var(--text)' }}>
                🔗 Abrir link público
              </a>
              <button onClick={() => { navigator.clipboard?.writeText(linkTarefa(detalhe)); }}
                style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 12 }}>
                📋 Copiar link
              </button>
              {detalhe.responsavel_nome && (
                <button onClick={() => notificarTarefaWhats(detalhe)} disabled={detalheSaving}
                  style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <MessageSquare size={13} /> Reenviar ao responsável
                </button>
              )}
              {!detalhe.aceite_status && detalhe.status !== 'cancelado' && (
                <button onClick={() => abrirPosicionamento(detalhe)} disabled={detalheSaving}
                  style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#0891b2', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700 }}>
                  <CheckCircle2 size={13} /> Fazer posicionamento
                </button>
              )}
              {detalhe.aceite_status === 'aceito' && (() => { const sla = slaInfo(detalhe); return (
                <div style={{ fontSize: 12, color: '#0891b2', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <CheckCircle2 size={13} /> Aceita por {detalhe.aceite_por || detalhe.recebido_por} em {fmtDataHora(detalhe.aceite_em || detalhe.recebido_em || null)}
                  {detalhe.aceite_prazo_concorda === false && <span style={{ color: '#d97706', fontWeight: 700 }}>· 📅 prazo renegociado</span>}
                  {sla && <span style={{ color: sla.cor, fontWeight: 700 }}>· ⏱ {sla.txt}</span>}
                </div>
              ) })()}
              {detalhe.aceite_status === 'recusado' && (
                <div style={{ fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <AlertTriangle size={13} /> Recusada por {detalhe.aceite_por} — {detalhe.aceite_recusa_motivo}
                </div>
              )}
              {(detalhe.status === 'concluido' || detalhe.status === 'cancelado' || detalhe.status === 'encerrada') && (
                <button onClick={() => reabrirTarefa(detalhe)}
                  style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <RotateCcw size={13} /> Reabrir Tarefa
                </button>
              )}
              {detalhe.precisa_aprovacao && !detalhe.aprovado_at && (
                <button onClick={() => aprovarTarefa(detalhe)} disabled={detalheSaving}
                  style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={13} /> Aprovar como Gestor
                </button>
              )}
              {detalhe.aprovado_at && (
                <div style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={13} /> Aprovada por {detalhe.aprovado_por} em {fmtData(detalhe.aprovado_at)}
                </div>
              )}
            </div>

            {/* ── Custo / Orçamento: informado por QUEM RECEBE a tarefa ── */}
            {!detalhe.gera_custo && detalhe.status !== 'cancelado' && detalhe.status !== 'encerrada' && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>💰 ESTA TAREFA GERA CUSTO?</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Se precisar de compra ou serviço pago, informe o orçamento — vai para aprovação de <strong>Wagner e Aline</strong>.</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input type="number" step="0.01" min="0" value={orcEntry.valor} onChange={e => setOrcEntry(f => ({ ...f, valor: e.target.value }))}
                      placeholder="Valor estimado (R$)" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                    <input type="date" value={orcEntry.data} onChange={e => setOrcEntry(f => ({ ...f, data: e.target.value }))}
                      style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                  </div>
                  <input value={orcEntry.descricao} onChange={e => setOrcEntry(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="Descrição do serviço/produto" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                  <input value={orcEntry.fornecedor} onChange={e => setOrcEntry(f => ({ ...f, fornecedor: e.target.value }))}
                    placeholder="Fornecedor (se houver)" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                  <AnexoUploader value={orcEntry.anexos} onChange={v => setOrcEntry(f => ({ ...f, anexos: v || '' }))} pasta="tarefas" label="📎 Orçamento / documento" />
                  <input value={orcEntry.obs} onChange={e => setOrcEntry(f => ({ ...f, obs: e.target.value }))}
                    placeholder="Observação (opcional)" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                  <button onClick={() => enviarOrcamento(detalhe)} disabled={detalheSaving}
                    style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    📤 Enviar orçamento para aprovação
                  </button>
                </div>
              </div>
            )}

            {/* ── Orçamento ── */}
            {detalhe.gera_custo && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>💰 ORÇAMENTO</span>
                  {detalhe.orcamento_status && (
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px',
                      background: detalhe.orcamento_status === 'aprovado' ? '#dcfce7' : detalhe.orcamento_status === 'reprovado' ? '#fee2e2' : '#fef3c7',
                      color: detalhe.orcamento_status === 'aprovado' ? '#15803d' : detalhe.orcamento_status === 'reprovado' ? '#b91c1c' : '#92400e' }}>
                      {detalhe.orcamento_status === 'aprovado' ? 'Aprovado' : detalhe.orcamento_status === 'reprovado' ? 'Reprovado' : 'Aguardando aprovação'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  {[['Estimado', detalhe.custo_previsto ?? detalhe.orcamento_valor], ['Aprovado', detalhe.orcamento_aprovado_valor], ['Realizado', detalhe.custo_executado]].map(([lbl, v]) => (
                    <div key={lbl as string} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{lbl as string}</div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMoeda(v as number | null)}</div>
                    </div>
                  ))}
                </div>
                {detalhe.orcamento_descricao && <div style={{ fontSize: 13, marginBottom: 4 }}>{detalhe.orcamento_descricao}</div>}
                {detalhe.orcamento_fornecedor && <div style={{ fontSize: 12, color: 'var(--muted)' }}>🏢 {detalhe.orcamento_fornecedor}{detalhe.orcamento_data ? ` · ${fmtData(detalhe.orcamento_data)}` : ''}</div>}
                {detalhe.orcamento_anexos && <div style={{ marginTop: 6 }}><AnexoLinks value={detalhe.orcamento_anexos} compact /></div>}
                {detalhe.orcamento_obs && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{detalhe.orcamento_obs}</div>}

                {detalhe.orcamento_status === 'aguardando' && (
                  <div style={{ marginTop: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Decisão (Wagner / Aline)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <input type="number" step="0.01" min="0" value={orcForm.valor} onChange={e => setOrcForm(f => ({ ...f, valor: e.target.value }))}
                        placeholder="Valor aprovado (R$)" style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }} />
                      <input value={orcForm.obs} onChange={e => setOrcForm(f => ({ ...f, obs: e.target.value }))}
                        placeholder="Observação (opcional)" style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => decidirOrcamento(detalhe, true)} disabled={detalheSaving}
                        style={{ flex: 1, padding: '8px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✓ Aprovar orçamento</button>
                      <button onClick={() => decidirOrcamento(detalhe, false)} disabled={detalheSaving}
                        style={{ flex: 1, padding: '8px', borderRadius: 7, border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✕ Reprovar</button>
                    </div>
                  </div>
                )}
                {detalhe.orcamento_aprovado_em && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    {detalhe.orcamento_status === 'aprovado' ? '✅' : '⛔'} {detalhe.orcamento_aprovado_por} · {fmtDataHora(detalhe.orcamento_aprovado_em)}
                    {detalhe.orcamento_obs_aprovacao ? ` — ${detalhe.orcamento_obs_aprovacao}` : ''}
                  </div>
                )}
              </div>
            )}

            {/* ── Conclusão & Validação do solicitante ── */}
            {(detalhe.status === 'concluido' || detalhe.status === 'aguardando_validacao' || detalhe.status === 'encerrada') && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>⭐ VALIDAÇÃO DO SOLICITANTE {detalhe.solicitante_nome ? `(${detalhe.solicitante_nome})` : ''}</div>

                {detalhe.aval_em ? (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>
                      {detalhe.aval_ok ? '✅ Serviço confirmado' : '⚠️ Marcado como NÃO conforme'} · {'★'.repeat(detalhe.aval_nota || 0)}{'☆'.repeat(5 - (detalhe.aval_nota || 0))}
                    </div>
                    {detalhe.aval_feedback && <div style={{ fontSize: 13, marginTop: 4 }}>{detalhe.aval_feedback}</div>}
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>por {detalhe.aval_por} · {fmtDataHora(detalhe.aval_em)}</div>
                  </div>
                ) : detalhe.status === 'concluido' ? (
                  <>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
                      A avaliação (★ e conforme/não conforme) só pode ser dada pelo próprio solicitante, pelo link que ele recebe — ninguém mais valida por ele aqui dentro.
                    </div>
                    <button onClick={() => enviarParaValidacao(detalhe)} disabled={detalheSaving}
                      style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      📲 Enviar para o solicitante validar
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
                      ⏳ Aguardando o solicitante <strong>{detalhe.solicitante_nome || '—'}</strong> validar pelo link enviado no WhatsApp.
                    </div>
                    <button onClick={() => enviarParaValidacao(detalhe)} disabled={detalheSaving}
                      style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      📲 Reenviar link de validação
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Abas: Checklist / Envolvidos / Aprovações / Execução / Histórico */}
            <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              {(['checklist', 'envolvidos', 'aprovacoes', 'execucao', 'historico'] as const).map(aba => (
                <button key={aba} onClick={() => setAbaDetalhe(aba)}
                  style={{ flex: '1 1 auto', minWidth: 70, padding: '10px 4px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 10.5, fontWeight: abaDetalhe === aba ? 700 : 400, color: abaDetalhe === aba ? 'var(--bordo)' : 'var(--muted)', borderBottom: abaDetalhe === aba ? '2px solid var(--bordo)' : '2px solid transparent', whiteSpace: 'nowrap' }}>
                  {aba === 'checklist' ? `✓ Checklist (${detalhe.checklist?.length ?? 0})`
                    : aba === 'envolvidos' ? `🤝 Envolvidos`
                    : aba === 'aprovacoes' ? `💰 Aprovações`
                    : aba === 'execucao' ? `🚀 Execução`
                    : `📋 Histórico (${montaTimeline(detalhe).length})`}
                </button>
              ))}
            </div>

            {/* Aba Checklist */}
            {abaDetalhe === 'checklist' && (
              <div style={{ padding: 16, flex: 1 }}>
                {(detalhe.checklist ?? []).map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => toggleCheck(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.concluido ? '#16a34a' : 'var(--muted)', padding: 0, flexShrink: 0 }}>
                      {item.concluido ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <span style={{ flex: 1, fontSize: 13, textDecoration: item.concluido ? 'line-through' : 'none', color: item.concluido ? 'var(--muted)' : 'var(--text)' }}>{item.descricao}</span>
                    {item.concluido && item.concluido_por && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{item.concluido_por}</span>}
                    <button onClick={() => delCheck(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}><X size={12} /></button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <input value={novoCheckDetalhe} onChange={e => setNovoCheckDetalhe(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCheckDetalhe()}
                    placeholder="Novo item..."
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                  <button onClick={addCheckDetalhe}
                    style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer' }}>
                    <Plus size={14} />
                  </button>
                </div>
                {(detalhe.checklist?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
                    {detalhe.checklist?.filter(c => c.concluido).length}/{detalhe.checklist?.length} itens concluídos
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#16a34a', borderRadius: 4, width: `${Math.round(((detalhe.checklist?.filter(c => c.concluido).length ?? 0) / (detalhe.checklist?.length ?? 1)) * 100)}%`, transition: 'width .3s' }} />
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* Aba Execução */}
            {/* Aba Envolvidos: responsável já está no cabeçalho; aqui fica quem mais foi acionado no processo */}
            {abaDetalhe === 'envolvidos' && (
              <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
                  <span><strong>Responsável:</strong> {detalhe.responsavel_nome || '— não definido —'}</span>
                  <button onClick={() => abrirTransferencia(detalhe)}
                    style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <RotateCcw size={12} /> Transferir
                  </button>
                </div>

                {/* ── Colaboradores vinculados ── */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>👥 COLABORADORES VINCULADOS</div>
                  {(detalhe.colaboradores ?? []).length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Nenhum colaborador vinculado ainda.</div>
                  )}
                  {(detalhe.colaboradores ?? []).map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, background: 'var(--card)', borderRadius: 8, padding: '6px 10px', marginBottom: 6 }}>
                      <span><strong>{c.nome}</strong> <span style={{ color: 'var(--muted)' }}>({c.tipo}){c.motivo ? ` — ${c.motivo}` : ''}</span></span>
                      <button onClick={() => removerColaborador(detalhe, i)} disabled={detalheSaving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={13} /></button>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr auto', gap: 6, marginTop: 4 }}>
                    <select value={novoColabTipo} onChange={e => setNovoColabTipo(e.target.value)}
                      style={{ padding: '7px 6px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 11.5 }}>
                      <option value="Setor">Setor</option>
                      <option value="Usuário">Usuário</option>
                      <option value="Fornecedor">Fornecedor</option>
                      <option value="Unidade">Unidade</option>
                    </select>
                    <input value={novoColabNome} onChange={e => setNovoColabNome(e.target.value)}
                      placeholder="Nome" style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                    <input value={novoColabMotivo} onChange={e => setNovoColabMotivo(e.target.value)}
                      placeholder="Motivo (opcional)" style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                    <button onClick={() => adicionarColaborador(detalhe)} disabled={detalheSaving || !novoColabNome.trim()}
                      style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: '#4338ca', color: '#fff', cursor: novoColabNome.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600 }}>+</button>
                  </div>
                </div>

                {/* ── Solicitar apoio de outro setor ── */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>🤝 SOLICITAR APOIO DE OUTRO SETOR</div>
                  {detalhe.apoio_setor && (
                    <div style={{ fontSize: 12.5, background: '#eef2ff', color: '#4338ca', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                      Apoio a <strong>{detalhe.apoio_setor}</strong>{detalhe.apoio_motivo ? ` — ${detalhe.apoio_motivo}` : ''}<div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{detalhe.apoio_por} · {fmtDataHora(detalhe.apoio_em || null)}</div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: 6 }}>
                    <select value={apoioForm.setor} onChange={e => setApoioForm(f => ({ ...f, setor: e.target.value }))}
                      style={{ padding: '7px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }}>
                      <option value="">Setor…</option>
                      {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input value={apoioForm.motivo} onChange={e => setApoioForm(f => ({ ...f, motivo: e.target.value }))}
                      placeholder="Motivo do apoio" style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                    <button onClick={() => solicitarApoioSetor(detalhe)} disabled={detalheSaving || !apoioForm.setor}
                      style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: '#4338ca', color: '#fff', cursor: apoioForm.setor ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600 }}>Solicitar</button>
                  </div>
                </div>
                {/* ── Desvio da tarefa (quem mudou o combinado) ── */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>↪️ DESVIO DA TAREFA</div>
                  {detalhe.desvio_motivo && (
                    <div style={{ fontSize: 12.5, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                      ⚠ {detalhe.desvio_motivo}<div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{detalhe.desvio_por} · {fmtDataHora(detalhe.desvio_em || null)}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={desvioForm} onChange={e => setDesvioForm(e.target.value)}
                      placeholder="O que mudou/desviou do combinado?"
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                    <button onClick={() => registrarDesvio(detalhe)} disabled={detalheSaving || !desvioForm.trim()}
                      style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: '#b91c1c', color: '#fff', cursor: desvioForm.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600 }}>Registrar</button>
                  </div>
                </div>
              </div>
            )}

            {/* Aba Aprovações: prazo e orçamento — tudo que depende de decisão de terceiros */}
            {abaDetalhe === 'aprovacoes' && (
              <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* ── Solicitação de prazo adicional ── */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>📅 PRAZO</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                    <span style={{ color: 'var(--muted)' }}>Prazo atual:</span>
                    <strong style={{ color: vencido(detalhe.prazo) ? '#dc2626' : 'var(--text)' }}>{detalhe.prazo ? fmtData(detalhe.prazo) : 'Sem prazo'}</strong>
                  </div>

                  {/* Solicitação pendente → gestor responde */}
                  {detalhe.prazo_extensao_status === 'pendente' ? (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>⏳ Prazo adicional solicitado: {fmtData(detalhe.prazo_extensao_data)}</div>
                      {detalhe.prazo_extensao_motivo && <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>Motivo: {detalhe.prazo_extensao_motivo}</div>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => responderExtensao(detalhe, true)} disabled={detalheSaving}
                          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✓ Aprovar novo prazo</button>
                        <button onClick={() => responderExtensao(detalhe, false)} disabled={detalheSaving}
                          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✕ Negar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {detalhe.prazo_extensao_status === 'aprovado' && <div style={{ fontSize: 11, color: '#16a34a', marginBottom: 8 }}>✓ Última extensão de prazo aprovada</div>}
                      {detalhe.prazo_extensao_status === 'negado' && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>✕ Última solicitação de prazo negada</div>}
                      {/* Responsável solicita mais prazo */}
                      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8 }}>
                        <input type="date" value={extForm.data} onChange={e => setExtForm(f => ({ ...f, data: e.target.value }))}
                          style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                        <input value={extForm.motivo} onChange={e => setExtForm(f => ({ ...f, motivo: e.target.value }))}
                          placeholder="Motivo do novo prazo…"
                          style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} />
                      </div>
                      <button onClick={solicitarExtensao} disabled={detalheSaving || !extForm.data}
                        style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', cursor: extForm.data ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                        Solicitar mais prazo
                      </button>
                    </>
                  )}
                </div>

                {/* ── Orçamento ── */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>💰 ORÇAMENTO</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>CUSTO PREVISTO</label>
                      <div style={{ fontSize: 14, fontWeight: 600, padding: '8px 10px', borderRadius: 7, background: 'var(--card)', border: '1px solid var(--border)' }}>{fmtMoeda(detalhe.custo_previsto)}</div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>CUSTO EXECUTADO (R$)</label>
                      <input type="number" step="0.01" min="0" value={resForm.custo_executado}
                        onChange={e => setResForm(r => ({ ...r, custo_executado: e.target.value }))}
                        placeholder="0,00"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 14, fontWeight: 600 }} />
                    </div>
                  </div>
                  {detalhe.custo_previsto != null && resForm.custo_executado !== '' && (
                    (() => {
                      const prev = detalhe.custo_previsto ?? 0
                      const exec = Number(resForm.custo_executado)
                      const dif = exec - prev
                      const acima = dif > 0
                      return (
                        <div style={{ fontSize: 12, color: acima ? '#dc2626' : '#16a34a', fontWeight: 600, marginTop: 8 }}>
                          {acima ? '▲ Acima do previsto em ' : dif < 0 ? '▼ Abaixo do previsto em ' : '✓ No orçamento — '}
                          {dif !== 0 ? fmtMoeda(Math.abs(dif)) : ''}
                        </div>
                      )
                    })()
                  )}
                  <button onClick={salvarResultado} disabled={detalheSaving}
                    style={{ marginTop: 10, padding: '7px 14px', borderRadius: 8, border: 'none', background: detalheSaving ? 'var(--border)' : 'var(--bordo)', color: '#fff', cursor: detalheSaving ? 'not-allowed' : 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                    Salvar custo executado
                  </button>
                </div>
              </div>
            )}

            {abaDetalhe === 'execucao' && (
              <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ── Período de execução ── */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>⏱ PERÍODO DE EXECUÇÃO</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>Início real:</span>
                    <strong>{fmtDataHora(detalhe.iniciado_em)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>Conclusão:</span>
                    <strong>{fmtDataHora(detalhe.concluido_em)}</strong>
                  </div>
                  {detalhe.iniciado_em && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--muted)' }}>Tempo {detalhe.concluido_em ? 'usado' : 'decorrido'}:</span>
                      <strong style={{ color: 'var(--bordo)' }}>{periodoExecucao(detalhe.iniciado_em, detalhe.concluido_em)}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {!detalhe.iniciado_em && (
                      <button onClick={() => iniciarExecucao(detalhe)} disabled={detalheSaving}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        ▶ Iniciar execução
                      </button>
                    )}
                    {detalhe.iniciado_em && !detalhe.concluido_em && (
                      <button onClick={() => concluirExecucao(detalhe)} disabled={detalheSaving}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        ■ Marcar conclusão
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Dificuldades na execução ── */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>⚠️ DIFICULDADES / DEFICIÊNCIAS NA EXECUÇÃO</label>
                  <textarea value={resForm.dificuldades}
                    onChange={e => setResForm(r => ({ ...r, dificuldades: e.target.value }))}
                    rows={3} placeholder="O que dificultou ou impediu a execução? Gargalos, faltas, dependências…"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', lineHeight: 1.5 }} />
                </div>

                {/* ── Retorno da execução ── */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>📄 RETORNO DA EXECUÇÃO</label>
                  <textarea value={resForm.resultado_final}
                    onChange={e => setResForm(r => ({ ...r, resultado_final: e.target.value }))}
                    rows={3} placeholder="Descreva o que foi realizado (ex: troca da resistência do forno e testes concluídos)…"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', lineHeight: 1.5 }} />
                </div>

                {/* ── Resultado da tarefa (status) ── */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>✅ RESULTADO DA TAREFA</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {RESULTADOS.map(r => {
                      const ativo = resForm.resultado_status === r.id
                      return (
                        <button key={r.id} type="button" onClick={() => setResForm(s => ({ ...s, resultado_status: ativo ? '' : r.id }))}
                          style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
                            border: `1px solid ${ativo ? r.cor : 'var(--border)'}`,
                            background: ativo ? r.cor : 'var(--bg)', color: ativo ? '#fff' : 'var(--muted)' }}>
                          {r.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* ── Observação final ── */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>🗒 OBSERVAÇÃO FINAL</label>
                  <textarea value={resForm.observacao_final}
                    onChange={e => setResForm(r => ({ ...r, observacao_final: e.target.value }))}
                    rows={2} placeholder="Pendências, melhorias futuras ou acompanhamento necessário…"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', lineHeight: 1.5 }} />
                </div>

                <button onClick={salvarResultado} disabled={detalheSaving}
                  style={{ alignSelf: 'flex-start', padding: '9px 18px', borderRadius: 8, border: 'none', background: detalheSaving ? 'var(--border)' : 'var(--bordo)', color: '#fff', cursor: detalheSaving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {detalheSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />}
                  Salvar Execução
                </button>

                {/* ── Validação final ── */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>🔒 VALIDAÇÃO FINAL</div>
                  {detalhe.validado_em ? (
                    <div style={{ fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={15} /> Validado por <strong>{detalhe.validado_por}</strong> em {fmtDataHora(detalhe.validado_em)}
                    </div>
                  ) : (
                    <button onClick={() => validarConclusao(detalhe)} disabled={detalheSaving}
                      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={14} /> Validar conclusão
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Aba Histórico */}
            {abaDetalhe === 'historico' && (
              <div style={{ padding: 16, flex: 1 }}>
                {/* Tempo parado por etapa (decompõe o tempo total da tarefa) */}
                <div style={{ marginBottom: 16, background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>⏱ TEMPO POR ETAPA</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tempoPorStatusDetalhe(detalhe).map(b => {
                      const col = COLUNAS.find(c => c.id === b.status)
                      const total = tempoPorStatusDetalhe(detalhe).reduce((s, x) => s + x.horas, 0) || 1
                      return (
                        <div key={b.status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 120, fontSize: 11.5, flexShrink: 0 }}>{b.label}</div>
                          <div style={{ flex: 1, height: 8, background: 'var(--card)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max((b.horas / total) * 100, 4)}%`, background: col?.cor || '#6b7280', borderRadius: 4 }} />
                          </div>
                          <div style={{ width: 50, fontSize: 11.5, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{fmtDur(b.horas)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Registrar atualização — entra direto na timeline abaixo, sem precisar mover o card */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>📝 O QUE ACONTECEU?</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <select value={novoComentTipo} onChange={e => setNovoComentTipo(e.target.value)}
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12 }}>
                      {TIPOS_ATUALIZACAO.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={novoComent} onChange={e => setNovoComent(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addComentario()}
                        placeholder="Ex: técnico acionado, material solicitado, compra aprovada…"
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                      <button onClick={addComentario} disabled={detalheSaving || !novoComent.trim()}
                        style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer' }}>
                        <MessageSquare size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Timeline única: transições de status + atualizações + demais eventos de auditoria, em ordem cronológica */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bordo)', marginBottom: 8 }}>🧭 HISTÓRICO DA TAREFA</div>
                {montaTimeline(detalhe).length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>Nenhum evento registrado ainda</div>
                )}
                {montaTimeline(detalhe).map((ev, i) => {
                  if (ev.kind === 'transicao') {
                    const tr = ev.tr
                    const col = COLUNAS.find(c => c.id === tr.para)
                    return (
                      <div key={'tr' + i} style={{ display: 'flex', gap: 10, paddingBottom: 12, borderLeft: `2px solid ${col?.cor || 'var(--border)'}`, paddingLeft: 10, marginLeft: 4, marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: col?.cor }}>🔄 {tr.de ? `${statusLabel(tr.de as TarefaStatus)} → ` : ''}{col?.label || tr.para}</div>
                          {tr.motivo && (
                            <div style={{ fontSize: 11.5, marginTop: 3, display: 'inline-block', background: tr.para === 'cancelado' ? '#fee2e2' : '#fef3c7', color: tr.para === 'cancelado' ? '#b91c1c' : '#92400e', borderRadius: 20, padding: '1px 8px', fontWeight: 600 }}>
                              {tr.para === 'cancelado' ? '🚫' : '🚧'} {tr.motivo}
                            </div>
                          )}
                          {tr.obs && <div style={{ fontSize: 12.5, marginTop: 2, whiteSpace: 'pre-wrap' }}>{tr.obs}</div>}
                          {(tr.resp_resolucao || tr.previsao) && (
                            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                              {tr.resp_resolucao && <>Resolve: <strong>{tr.resp_resolucao}</strong> </>}
                              {tr.previsao && <>· Previsão: <strong>{fmtData(tr.previsao)}</strong></>}
                            </div>
                          )}
                          {tr.anexos && <div style={{ marginTop: 4 }}><AnexoLinks value={tr.anexos} compact /></div>}
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{tr.por} · {fmtDataHora(tr.em)}</div>
                        </div>
                      </div>
                    )
                  }
                  if (ev.kind === 'comentario') {
                    const c = ev.c
                    return (
                      <div key={'c' + i} style={{ display: 'flex', gap: 10, paddingBottom: 12, borderLeft: '2px solid var(--border)', paddingLeft: 10, marginLeft: 4, marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 8px', whiteSpace: 'nowrap' }}>
                              {tipoAtualizacaoInfo(c.tipo).emoji} {tipoAtualizacaoInfo(c.tipo).label}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: 12 }}>{c.autor_nome}</span>
                          </div>
                          <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{c.texto}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fmtDataHora(c.created_at)}</div>
                        </div>
                      </div>
                    )
                  }
                  const h = ev.h
                  return (
                    <div key={'h' + i} style={{ display: 'flex', gap: 10, paddingBottom: 12, borderLeft: '2px solid var(--border)', paddingLeft: 10, marginLeft: 4, marginBottom: 12 }}>
                      <History size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{h.acao}</div>
                        {h.campo && (
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                            {h.campo}: <span style={{ textDecoration: 'line-through' }}>{h.valor_anterior}</span> → <strong>{h.valor_novo}</strong>
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{h.usuario_nome} · {fmtDataHora(h.created_at)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          MODAL: ATUALIZAR TAREFA (transição de status)
      ══════════════════════════════ */}
      {transicao && (() => {
        const colDe = COLUNAS.find(c => c.id === transicao.tarefa.status)
        const colPara = COLUNAS.find(c => c.id === transicao.novoStatus)
        const HINT: Record<string, string> = {
          recebida: 'Confirmação de recebimento / ciência',
          em_andamento: 'Ação executada · previsão de conclusão · responsável',
          aguardando_retorno: 'Pendência · o que aguarda · de quem',
          aguardando_fornecedor: 'Fornecedor · valor estimado · data prevista',
          concluido: 'Resultado · evidência · observação final',
          aguardando_validacao: 'Enviado para validação do solicitante',
          encerrada: 'Encerramento · observação final',
          cancelado: 'Motivo do cancelamento',
          pendente: 'Observação',
        }
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setTransicao(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 22, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Atualizar tarefa</h3>
                <button onClick={() => setTransicao(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
              </div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                <span style={{ background: colDe?.bg, color: colDe?.cor, borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>{colDe?.label}</span>
                <span style={{ margin: '0 8px', color: 'var(--muted)' }}>→</span>
                <span style={{ background: colPara?.bg, color: colPara?.cor, borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>{colPara?.label}</span>
              </div>
              {/* Cancelamento: motivo obrigatório */}
              {transicao.novoStatus === 'cancelado' && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', display: 'block', marginBottom: 4 }}>Motivo do cancelamento *</label>
                  <select value={transMotivo} onChange={e => setTransMotivo(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${!transMotivo ? '#fca5a5' : 'var(--border)'}`, background: 'var(--bg)', fontSize: 13 }}>
                    <option value="">Selecione...</option>
                    {MOTIVOS_CANCELAMENTO.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
              {/* Impedimento estruturado */}
              {STATUS_IMPEDIMENTO.includes(transicao.novoStatus) && (
                <div style={{ marginBottom: 10, display: 'grid', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#d97706', display: 'block', marginBottom: 4 }}>Motivo do impedimento *</label>
                    <select value={transMotivo} onChange={e => setTransMotivo(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${!transMotivo ? '#fcd34d' : 'var(--border)'}`, background: 'var(--bg)', fontSize: 13 }}>
                      <option value="">Selecione...</option>
                      {MOTIVOS_IMPEDIMENTO.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Quem precisa resolver?</label>
                      <input value={transResp} onChange={e => setTransResp(e.target.value)} placeholder="Nome / setor / fornecedor"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Previsão de resolução</label>
                      <input type="date" value={transPrevisao} onChange={e => setTransPrevisao(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>
              )}
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                {transMotivoObrigatorio ? 'Detalhes (opcional)' : 'Observação da transição'}
              </label>
              <textarea value={transObs} onChange={e => setTransObs(e.target.value)} rows={3} placeholder={HINT[transicao.novoStatus] || 'Observação'}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', marginBottom: 10 }} />
              <AnexoUploader value={transAnexos} onChange={v => setTransAnexos(v || '')} pasta="tarefas" label="📎 Evidência (foto, orçamento, NF, documento…)" />
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                📲 O solicitante <strong>{transicao.tarefa.solicitante_nome || '—'}</strong> será notificado da atualização.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={() => setTransicao(null)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
                <button onClick={confirmarTransicao} disabled={detalheSaving || (transMotivoObrigatorio && !transMotivo)}
                  style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: (detalheSaving || (transMotivoObrigatorio && !transMotivo)) ? 'not-allowed' : 'pointer', opacity: (transMotivoObrigatorio && !transMotivo) ? 0.6 : 1, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {detalheSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} Registrar atualização
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══════════════════════════════
          MODAL: POSICIONAMENTO (aceite formal do responsável)
      ══════════════════════════════ */}
      {posicionamento && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPosicionamento(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 22, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Posicionamento</h3>
              <button onClick={() => setPosicionamento(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>{posicionamento.titulo}</div>

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Você aceita esta tarefa?</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button onClick={() => setPosAceite(true)}
                style={{ flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, border: `1px solid ${posAceite === true ? '#16a34a' : 'var(--border)'}`, background: posAceite === true ? '#16a34a' : 'var(--bg)', color: posAceite === true ? '#fff' : 'var(--text)' }}>🟢 Aceitar</button>
              <button onClick={() => setPosAceite(false)}
                style={{ flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, border: `1px solid ${posAceite === false ? '#dc2626' : 'var(--border)'}`, background: posAceite === false ? '#dc2626' : 'var(--bg)', color: posAceite === false ? '#fff' : 'var(--text)' }}>🔴 Recusar / Devolver</button>
            </div>

            {posAceite === true && (
              <>
                <div style={{ fontSize: 12.5, marginBottom: 8 }}>
                  Prazo informado pelo solicitante: <strong>{posicionamento.prazo ? fmtData(posicionamento.prazo) : 'sem prazo definido'}</strong>
                </div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Você concorda com o prazo?</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setPosPrazoConcorda(true)}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: `1px solid ${posPrazoConcorda === true ? '#16a34a' : 'var(--border)'}`, background: posPrazoConcorda === true ? '#16a34a' : 'var(--bg)', color: posPrazoConcorda === true ? '#fff' : 'var(--text)' }}>☑ Sim, concordo</button>
                  <button onClick={() => setPosPrazoConcorda(false)}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: `1px solid ${posPrazoConcorda === false ? '#d97706' : 'var(--border)'}`, background: posPrazoConcorda === false ? '#d97706' : 'var(--bg)', color: posPrazoConcorda === false ? '#fff' : 'var(--text)' }}>Preciso alterar</button>
                </div>
                {posPrazoConcorda === false && (
                  <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Novo prazo</label>
                      <input type="date" value={posPrazoProposto} onChange={e => setPosPrazoProposto(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Justificativa</label>
                      <textarea value={posPrazoJustificativa} onChange={e => setPosPrazoJustificativa(e.target.value)} rows={2}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                )}
              </>
            )}

            {posAceite === false && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', display: 'block', marginBottom: 4 }}>Motivo da recusa *</label>
                <textarea value={posMotivoRecusa} onChange={e => setPosMotivoRecusa(e.target.value)} rows={2} placeholder="Ex: já estou sobrecarregado, não é da minha área…"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>A tarefa volta para "Solicitada" sem responsável, para reatribuição.</div>
              </div>
            )}

            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
              📲 O solicitante <strong>{posicionamento.solicitante_nome || '—'}</strong> será notificado da sua decisão.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setPosicionamento(null)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarPosicionamento} disabled={detalheSaving}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: detalheSaving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {detalheSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          MODAL: TRANSFERIR TAREFA
      ══════════════════════════════ */}
      {transferencia && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setTransferencia(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 22, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🔄 Transferir tarefa</h3>
              <button onClick={() => setTransferencia(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              {transferencia.titulo} · atualmente com <strong>{transferencia.responsavel_nome || 'ninguém'}</strong>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Transferir para</label>
            <select value={responsaveis.includes(transfNovoResp) ? transfNovoResp : ''} onChange={e => setTransfNovoResp(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, marginBottom: 6 }}>
              <option value="">Selecione…</option>
              {responsaveis.filter(n => n !== transferencia.responsavel_nome).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <input value={transfNovoResp} onChange={e => setTransfNovoResp(e.target.value)}
              placeholder="Ou digite o nome…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5, marginBottom: 10, boxSizing: 'border-box' }} />

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Motivo *</label>
            <textarea value={transfMotivo} onChange={e => setTransfMotivo(e.target.value)} rows={2}
              placeholder="Ex: a execução pertence ao setor de Marketing…"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
              Todo o histórico permanece. O novo responsável precisa se posicionar (aceitar/recusar) de novo.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setTransferencia(null)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarTransferencia} disabled={detalheSaving || !transfNovoResp.trim() || !transfMotivo.trim()}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: (detalheSaving || !transfNovoResp.trim() || !transfMotivo.trim()) ? 'not-allowed' : 'pointer', opacity: (!transfNovoResp.trim() || !transfMotivo.trim()) ? 0.6 : 1, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {detalheSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={14} />} Transferir
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Kanban Card ───────────────────────────────────────────────
function KanbanCard({ tarefa, onClick, onMover, colunas }: {
  tarefa: Tarefa
  onClick: () => void
  onMover: (t: Tarefa, s: TarefaStatus) => void
  colunas: typeof COLUNAS
}) {
  const [showMove, setShowMove] = useState(false)
  const check = tarefa.checklist ?? []
  const checkOk = check.filter(c => c.concluido).length
  const pct = check.length > 0 ? Math.round((checkOk / check.length) * 100) : -1

  return (
    <div
      onClick={onClick}
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', tarefa.id); e.dataTransfer.effectAllowed = 'move' }}
      style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, cursor: 'grab', transition: 'box-shadow .15s', position: 'relative' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Prioridade strip */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', borderRadius: '10px 0 0 10px', background: prioCor(tarefa.prioridade) }} />
      {/* Indicador de saúde da tarefa */}
      {(() => {
        const saude = saudeTarefa(tarefa)
        return saude ? (
          <div title={saude.label} style={{ position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: '50%', background: saude.cor }} />
        ) : null
      })()}
      <div style={{ paddingLeft: 8 }}>
        {/* Título */}
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>
          {tarefa.reaberta && <span style={{ fontSize: 10, background: '#fef9c3', color: '#92400e', borderRadius: 3, padding: '1px 4px', marginRight: 5 }}>↩</span>}
          {tarefa.titulo}
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ background: 'var(--bordo)', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>🏪 {tarefa.loja}</span>
          <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--muted)' }}>{tarefa.setor}</span>
          <span style={{ background: prioCor(tarefa.prioridade) + '20', color: prioCor(tarefa.prioridade), borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{prioLabel(tarefa.prioridade)}</span>
          {tarefa.precisa_aprovacao && !tarefa.aprovado_at && (
            <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>⏳ Aprovação</span>
          )}
          {tarefa.prazo_extensao_status === 'pendente' && (
            <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>📅 Prazo+</span>
          )}
          {tarefa.recebido_em && <span style={{ background: '#ecfeff', color: '#0891b2', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>✓ Recebida</span>}
          {tarefa.orcamento_status === 'aguardando' && <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>💰 Orçam.</span>}
          {tarefa.orcamento_status === 'aprovado' && <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>💰 Aprovado</span>}
          {tarefa.orcamento_status === 'reprovado' && <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>💰 Reprovado</span>}
          {tarefa.aval_nota != null && <span style={{ background: '#fffbeb', color: '#b45309', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{tarefa.aval_nota}★</span>}
          {tarefa.desvio_motivo && <span style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>⚠ Desvio</span>}
          {tarefa.apoio_setor && <span style={{ background: '#eef2ff', color: '#4338ca', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>🤝 {tarefa.apoio_setor}</span>}
          {(tarefa.colaboradores?.length ?? 0) > 0 && <span style={{ background: '#eef2ff', color: '#4338ca', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>👥 {tarefa.colaboradores!.length}</span>}
          {parseTags(tarefa.tags).slice(0, 2).map(tg => (
            <span key={tg} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--muted)' }}>#{tg}</span>
          ))}
        </div>

        {/* Responsável + prazo */}
        {(() => {
          const sem = prazoSemaforo(tarefa.prazo, tarefa.status)
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={11} />{tarefa.responsavel_nome || '—'}</span>
              {tarefa.prazo && (
                <span style={{ color: sem ? sem.cor : 'var(--muted)', fontWeight: sem && sem.emoji !== '🟢' ? 600 : 400 }}>
                  {sem ? `${sem.emoji} ` : ''}{fmtData(tarefa.prazo)}{parseHoras(tarefa.competencia).hl ? ` ${parseHoras(tarefa.competencia).hl}` : ''}
                </span>
              )}
            </div>
          )
        })()}

        {/* SLA (conta a partir do recebimento) + andamento por status */}
        {(() => {
          const sla = slaInfo(tarefa)
          const upd = ultimaAtualizacao(tarefa)
          let info = ''
          if (tarefa.status === 'aguardando_retorno' || tarefa.status === 'aguardando_fornecedor') info = tarefa.apoio_setor ? `Apoio: ${tarefa.apoio_setor}${tarefa.apoio_motivo ? ' — ' + tarefa.apoio_motivo : ''}` : 'Aguardando retorno'
          else if (tarefa.status === 'aguardando_validacao') info = `Aguardando validação${tarefa.solicitante_nome ? ' de ' + tarefa.solicitante_nome : ''}`
          else if (tarefa.status === 'encerrada' && tarefa.aval_nota != null) info = `Encerrada · ${tarefa.aval_nota}★`
          else if (tarefa.desvio_motivo) info = `Desvio: ${tarefa.desvio_motivo}`
          else if (upd) info = upd
          return (
            <>
              {(sla || tarefa.recebido_em) && (
                <div style={{ marginTop: 6, fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {tarefa.recebido_em && <span style={{ color: '#0891b2', fontWeight: 600 }}>✓ ciente</span>}
                  {sla && <span style={{ color: sla.cor, fontWeight: 600 }}>⏱ {sla.txt}</span>}
                  {tarefa.prazo_extensao_status === 'pendente' && <span style={{ color: '#854d0e' }}>· +prazo pedido</span>}
                </div>
              )}
              {info && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  💬 {info}
                </div>
              )}
            </>
          )
        })()}

        {/* Contadores: atualizações e anexos */}
        {(() => {
          const nAtualiz = (tarefa.comentarios?.length ?? 0) + (tarefa.transicoes?.length ?? 0)
          const nAnexos = contaAnexos(tarefa.anexos) + (tarefa.transicoes || []).reduce((s, tr) => s + contaAnexos(tr.anexos), 0)
          if (!nAtualiz && !nAnexos) return null
          return (
            <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 10.5, color: 'var(--muted)' }}>
              {nAtualiz > 0 && <span>💬 {nAtualiz}</span>}
              {nAnexos > 0 && <span>📎 {nAnexos}</span>}
            </div>
          )
        })()}

        {/* Checklist progress */}
        {pct >= 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
              <span>Checklist</span><span>{checkOk}/{check.length}</span>
            </div>
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: pct === 100 ? '#16a34a' : 'var(--bordo)', borderRadius: 4, width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Mover status */}
        <div style={{ marginTop: 8, position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowMove(v => !v)}
            style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            Mover para... <ChevronDown size={10} />
          </button>
          {showMove && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 100, overflow: 'hidden', marginBottom: 4 }}>
              {colunas.filter(c => c.id !== tarefa.status).map(c => (
                <button key={c.id} onClick={() => { onMover(tarefa, c.id); setShowMove(false) }}
                  style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, textAlign: 'left', color: c.cor, fontWeight: 600 }}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal: Regras de cobrança automática (módulo 13) ─────────
function CobrancaModal({ cfg, onClose, onSaved }: {
  cfg: CobrancaConfig
  onClose: () => void
  onSaved: (c: CobrancaConfig) => void
}) {
  const [c, setC] = useState<CobrancaConfig>(cfg)
  const [antesStr, setAntesStr] = useState(numListStr(cfg.lembretes_antes_min))
  const [aposStr, setAposStr] = useState(numListStr(cfg.lembretes_apos_min))
  const [salvando, setSalvando] = useState(false)
  const set = (patch: Partial<CobrancaConfig>) => setC(prev => ({ ...prev, ...patch }))
  const setNivel = (i: number, patch: Partial<CobrancaNivel>) => setC(prev => ({ ...prev, escalonamento: prev.escalonamento.map((n, j) => j === i ? { ...n, ...patch } : n) }))
  const toggleDia = (d: number) => setC(prev => ({ ...prev, dias_semana: prev.dias_semana.includes(d) ? prev.dias_semana.filter(x => x !== d) : [...prev.dias_semana, d].sort((a, b) => a - b) }))
  const salvar = async () => {
    setSalvando(true)
    const final: CobrancaConfig = { ...c, lembretes_antes_min: parseNumList(antesStr), lembretes_apos_min: parseNumList(aposStr) }
    try { await saveAppConfig('cobranca_cfg', final); onSaved(final) }
    finally { setSalvando(false) }
  }
  const inpS: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
  const lblS: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }
  const secS: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--bordo)', margin: '6px 0 2px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 22, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>⚙️ Regras de cobrança automática</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', background: c.ativo ? '#f0fdf4' : '#fef2f2', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <input type="checkbox" checked={c.ativo} onChange={e => set({ ativo: e.target.checked })} />
            <strong>Cobranças automáticas por WhatsApp {c.ativo ? 'ativas' : 'desativadas'}</strong>
          </label>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -6 }}>
            Estas regras ficam salvas para o robô de cobrança (worker no VPS). Enquanto o worker não estiver ligado, elas só ficam registradas.
          </div>

          <div style={secS}>Lembretes</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lblS}>Antes do prazo (min)</label><input value={antesStr} onChange={e => setAntesStr(e.target.value)} placeholder="30, 10" style={{ ...inpS, width: '100%' }} /></div>
            <div><label style={lblS}>Após o atraso (min)</label><input value={aposStr} onChange={e => setAposStr(e.target.value)} placeholder="10, 30, 60" style={{ ...inpS, width: '100%' }} /></div>
            <div><label style={lblS}>Máx. de lembretes</label><input type="number" min={1} value={c.max_lembretes} onChange={e => set({ max_lembretes: Number(e.target.value) || 1 })} style={{ ...inpS, width: '100%' }} /></div>
            <div><label style={lblS}>Tolerância de atraso (min)</label><input type="number" min={0} value={c.tolerancia_min} onChange={e => set({ tolerancia_min: Number(e.target.value) || 0 })} style={{ ...inpS, width: '100%' }} /></div>
          </div>

          <div style={secS}>Escalonamento (níveis)</div>
          {c.escalonamento.map((n, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '20px 1.4fr 1fr 1.2fr', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{i + 1}</span>
              <input value={n.rotulo} onChange={e => setNivel(i, { rotulo: e.target.value })} placeholder="Rótulo" style={{ ...inpS, fontSize: 12, padding: '6px 8px' }} />
              <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>+<input type="number" min={0} value={n.apos_min} onChange={e => setNivel(i, { apos_min: Number(e.target.value) || 0 })} style={{ ...inpS, width: 60, fontSize: 12, padding: '6px 6px' }} />min</label>
              <input value={n.whatsapp || ''} onChange={e => setNivel(i, { whatsapp: e.target.value || null })} placeholder="WhatsApp (opcional)" style={{ ...inpS, fontSize: 12, padding: '6px 8px' }} />
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -4 }}>Sem número: o robô resolve pelo responsável/setor da tarefa. "+X min" = tempo após o prazo para acionar o nível.</div>

          <div style={secS}>Janela de envio</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lblS}>Silêncio a partir de</label><input type="time" value={c.quiet_inicio} onChange={e => set({ quiet_inicio: e.target.value })} style={{ ...inpS, width: '100%' }} /></div>
            <div><label style={lblS}>Voltar a enviar às</label><input type="time" value={c.quiet_fim} onChange={e => set({ quiet_fim: e.target.value })} style={{ ...inpS, width: '100%' }} /></div>
          </div>
          <div>
            <label style={lblS}>Dias permitidos</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {DIAS_SEM.map((d, i) => (
                <button key={i} type="button" onClick={() => toggleDia(i)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', background: c.dias_semana.includes(i) ? 'var(--bordo)' : 'var(--card)', color: c.dias_semana.includes(i) ? '#fff' : 'var(--text)' }}>{d}</button>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={c.critico_acelera} onChange={e => set({ critico_acelera: e.target.checked })} />
            Tarefas <strong>urgentes/críticas</strong> escalam na metade do tempo
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: salvando ? 0.6 : 1 }}>
              {salvando ? 'Salvando...' : 'Salvar regras'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

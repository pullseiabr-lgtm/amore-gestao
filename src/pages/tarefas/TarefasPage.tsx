import { useState, useEffect, useCallback } from 'react'
import {
  Plus, X, CheckSquare, Square, MessageSquare, Clock,
  AlertTriangle, ChevronDown, Search,
  User, Building2, Flag, RotateCcw,
  CheckCircle2, Loader2, Trash2, History,
} from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchTarefas, insertTarefa, updateTarefa, deleteTarefa,
  insertTarefaChecklist, updateTarefaChecklist, deleteTarefaChecklist,
  insertTarefaComentario, insertTarefaHistorico, fetchProfiles,
} from '../../lib/db'
import { enviarWhatsApp, getZapiCfg } from '../../lib/notify'
import type { Tarefa, TarefaStatus, TarefaPrioridade, TarefaResultado, TarefaChecklist, TarefaComentario } from '../../types/database'
import { AnexoUploader, AnexoLinks } from '../../components/ui/AnexoUploader'

// ── Constants ────────────────────────────────────────────────

const SETORES = ['Operação','Cozinha','Delivery','Financeiro','Compras','Administrativo','TI','Manutenção','Eventos','Estoque','Marketing','Salão','Bar','RH','Limpeza','Produção','Diretoria','Geral']

const COLUNAS: { id: TarefaStatus; label: string; cor: string; bg: string }[] = [
  { id: 'pendente',              label: 'Aberto',                cor: '#6b7280', bg: '#f3f4f6' },
  { id: 'em_andamento',          label: 'Em Andamento',          cor: '#2563eb', bg: '#eff6ff' },
  { id: 'aguardando_retorno',    label: 'Aguardando Retorno',    cor: '#d97706', bg: '#fffbeb' },
  { id: 'aguardando_fornecedor', label: 'Aguardando Fornecedor', cor: '#9333ea', bg: '#faf5ff' },
  { id: 'concluido',             label: 'Finalizado',            cor: '#16a34a', bg: '#f0fdf4' },
  { id: 'cancelado',             label: 'Cancelado',             cor: '#dc2626', bg: '#fef2f2' },
]

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

function prioLabel(p: TarefaPrioridade) {
  return PRIORIDADES.find(x => x.id === p)?.label ?? p
}
function prioCor(p: TarefaPrioridade) {
  return PRIORIDADES.find(x => x.id === p)?.cor ?? '#6b7280'
}
function fmtData(s: string | null) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('pt-BR')
}
function fmtMoeda(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

// ── Empty form ───────────────────────────────────────────────
const hojeISO = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({
  titulo: '', descricao: '', setor: 'Operação', prioridade: 'media' as TarefaPrioridade,
  responsavel_nome: '', solicitante_nome: '',
  data_solicitacao: hojeISO(), prazo: '', observacoes: '',
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
  const { loja } = useLoja()
  const { user } = useAuth()

  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroSetor, setFiltroSetor] = useState('')
  const [filtroPrio, setFiltroPrio] = useState('')
  const [view, setView] = useState<'kanban' | 'lista'>('kanban')

  // Modal nova tarefa
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [novoCheckItem, setNovoCheckItem] = useState('')
  const [profiles, setProfiles] = useState<any[]>([])
  useEffect(() => { fetchProfiles().then(setProfiles).catch(() => {}) }, [])

  // Busca o WhatsApp de um usuário pelo nome (guardado em permissions_override.__perfil__)
  const whatsappDoResponsavel = (nome: string): string => {
    if (!nome) return ''
    const u = profiles.find(p => (p.name || '').trim().toLowerCase() === nome.trim().toLowerCase())
    const perfil = (u?.permissions_override as any)?.__perfil__
    return (perfil?.whatsapp || '').replace(/\D/g, '')
  }

  // Envia notificação de tarefa via Z-API (usa a config salva na Liz → WhatsApp)
  // e registra na Central de Notificações.
  const notificarTarefaWhats = async (titulo: string, responsavel: string, prazo: string, setor?: string) => {
    const cfg = getZapiCfg()
    const phone = whatsappDoResponsavel(responsavel)
    if (!cfg.instance || !cfg.token || !phone) return false
    const prazoBR = prazo ? new Date(prazo + 'T12:00:00').toLocaleDateString('pt-BR') : 'sem prazo definido'
    const msg = `🆕 *Nova tarefa atribuída*\n\n📋 *${titulo}*\n👤 Responsável: ${responsavel}\n⏰ Prazo: ${prazoBR}\n\nAcesse o painel para mais detalhes.\n_Amore Gestão_`
    return enviarWhatsApp(phone, msg, cfg, {
      tipo: 'tarefa', modulo: 'tarefas', titulo, setor: setor || null,
      loja, destinatario_nome: responsavel, created_by: user?.name || null,
    })
  }

  // Modal detalhe
  const [detalhe, setDetalhe] = useState<Tarefa | null>(null)
  const [novoComent, setNovoComent] = useState('')
  const [novoCheckDetalhe, setNovoCheckDetalhe] = useState('')
  const [detalheSaving, setDetalheSaving] = useState(false)
  const [abaDetalhe, setAbaDetalhe] = useState<'checklist'|'comentarios'|'execucao'|'historico'>('checklist')
  // Edição de execução/resultado no detalhe
  const [resForm, setResForm] = useState({ resultado_final: '', custo_executado: '', dificuldades: '', resultado_status: '' as '' | TarefaResultado, observacao_final: '' })
  // Solicitação de mais prazo
  const [extForm, setExtForm] = useState({ data: '', motivo: '' })

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
  }, [detalhe?.id]) // eslint-disable-line

  // ── Filtro ───────────────────────────────────────────────
  const tarefasFiltradas = tarefas.filter(t => {
    if (busca && !t.titulo.toLowerCase().includes(busca.toLowerCase()) &&
        !(t.responsavel_nome || '').toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroSetor && t.setor !== filtroSetor) return false
    if (filtroPrio && t.prioridade !== filtroPrio) return false
    return true
  })

  // ── Criar tarefa ─────────────────────────────────────────
  const criarTarefa = async () => {
    if (!form.titulo.trim()) return
    setSaving(true)
    try {
      const nova = await insertTarefa({
        loja,
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
        competencia: null,
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
      })
      // Checklist items
      for (const desc of form.checklist.filter(Boolean)) {
        await insertTarefaChecklist({ tarefa_id: nova.id, descricao: desc, concluido: false, concluido_por: null, concluido_at: null })
      }
      // Histórico
      await insertTarefaHistorico({ tarefa_id: nova.id, acao: 'Tarefa criada', campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Sistema' })
      // Notificação WhatsApp ao responsável (se ativado e houver número cadastrado)
      if (form.enviarWhats && form.responsavel_nome) {
        await notificarTarefaWhats(form.titulo.trim(), form.responsavel_nome, form.prazo, form.setor)
      }
      setShowForm(false)
      setForm(emptyForm())
      await load()
    } finally { setSaving(false) }
  }

  // ── Mover status ─────────────────────────────────────────
  const moverStatus = async (tarefa: Tarefa, novoStatus: TarefaStatus) => {
    const anterior = tarefa.status
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, status: novoStatus } : t))
    try {
      await updateTarefa(tarefa.id, { status: novoStatus })
      await insertTarefaHistorico({ tarefa_id: tarefa.id, acao: 'Status alterado', campo: 'status', valor_anterior: anterior, valor_novo: novoStatus, usuario_nome: user?.name || 'Sistema' })
    } catch {
      setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, status: anterior } : t))
    }
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
      await insertTarefaComentario({ tarefa_id: detalhe.id, texto: novoComent.trim(), autor_nome: user?.name || 'Usuário' })
      setNovoComent('')
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
      await updateTarefa(t.id, { concluido_em: new Date().toISOString() })
      await insertTarefaHistorico({ tarefa_id: t.id, acao: 'Execução concluída', campo: null, valor_anterior: null, valor_novo: null, usuario_nome: user?.name || 'Sistema' })
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

  // ── Contadores ───────────────────────────────────────────
  const counts = COLUNAS.reduce((acc, col) => {
    acc[col.id] = tarefasFiltradas.filter(t => t.status === col.id).length
    return acc
  }, {} as Record<TarefaStatus, number>)

  // ── Métricas de gestão ───────────────────────────────────
  const ativas = tarefasFiltradas.filter(t => t.status !== 'concluido' && t.status !== 'cancelado')
  const metricas = {
    total: tarefasFiltradas.length,
    emAndamento: tarefasFiltradas.filter(t => t.status === 'em_andamento').length,
    atrasadas: ativas.filter(t => vencido(t.prazo)).length,
    concluidas: tarefasFiltradas.filter(t => t.status === 'concluido').length,
    pctConclusao: tarefasFiltradas.length > 0
      ? Math.round((tarefasFiltradas.filter(t => t.status === 'concluido').length / tarefasFiltradas.length) * 100)
      : 0,
  }

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
          <button
            onClick={() => setView(v => v === 'kanban' ? 'lista' : 'kanban')}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13 }}
          >
            {view === 'kanban' ? '☰ Lista' : '⊞ Kanban'}
          </button>
          <button
            onClick={() => { setForm(emptyForm()); setShowForm(true) }}
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
        {(busca || filtroSetor || filtroPrio) && (
          <button onClick={() => { setBusca(''); setFiltroSetor(''); setFiltroPrio('') }}
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

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
                  {cards.map(t => (
                    <KanbanCard
                      key={t.id}
                      tarefa={t}
                      onClick={() => { setDetalhe(t); setAbaDetalhe('checklist') }}
                      onMover={moverStatus}
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
                  <input value={form.responsavel_nome} onChange={e => setForm(f => ({ ...f, responsavel_nome: e.target.value }))}
                    placeholder="Quem irá executar"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
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
                  <button onClick={() => excluirTarefa(detalhe)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }} title="Excluir"><Trash2 size={15} /></button>
                  <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
                </div>
              </div>
            </div>

            {/* Meta */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Status */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>STATUS</div>
                <select value={detalhe.status}
                  onChange={e => moverStatus(detalhe, e.target.value as TarefaStatus)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}>
                  {COLUNAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
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
              {(detalhe.status === 'concluido' || detalhe.status === 'cancelado') && (
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

            {/* Abas: Checklist / Comentários / Histórico */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              {(['checklist', 'comentarios', 'execucao', 'historico'] as const).map(aba => (
                <button key={aba} onClick={() => setAbaDetalhe(aba)}
                  style={{ flex: 1, padding: '10px 6px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: abaDetalhe === aba ? 700 : 400, color: abaDetalhe === aba ? 'var(--bordo)' : 'var(--muted)', borderBottom: abaDetalhe === aba ? '2px solid var(--bordo)' : '2px solid transparent' }}>
                  {aba === 'checklist' ? `✓ Checklist (${detalhe.checklist?.length ?? 0})` : aba === 'comentarios' ? `🔧 Controle (${detalhe.comentarios?.length ?? 0})` : aba === 'execucao' ? `🚀 Execução` : `📋 Histórico`}
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

            {/* Aba Comentários */}
            {abaDetalhe === 'comentarios' && (
              <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(detalhe.comentarios ?? []).map((c: TarefaComentario) => (
                  <div key={c.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{c.autor_nome}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtData(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>{c.texto}</div>
                  </div>
                ))}
                {(detalhe.comentarios ?? []).length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>Nenhuma atualização registrada</div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input value={novoComent} onChange={e => setNovoComent(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addComentario()}
                    placeholder="Atualização (ex: técnico acionado, material solicitado, compra aprovada…)"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                  <button onClick={addComentario} disabled={detalheSaving || !novoComent.trim()}
                    style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer' }}>
                    <MessageSquare size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Aba Execução */}
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

                {/* ── Dificuldades na execução ── */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>⚠️ DIFICULDADES / DEFICIÊNCIAS NA EXECUÇÃO</label>
                  <textarea value={resForm.dificuldades}
                    onChange={e => setResForm(r => ({ ...r, dificuldades: e.target.value }))}
                    rows={3} placeholder="O que dificultou ou impediu a execução? Gargalos, faltas, dependências…"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', lineHeight: 1.5 }} />
                </div>

                {/* ── Orçamento ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>💰 CUSTO PREVISTO</label>
                    <div style={{ fontSize: 14, fontWeight: 600, padding: '8px 10px', borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--border)' }}>{fmtMoeda(detalhe.custo_previsto)}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>💸 CUSTO EXECUTADO (R$)</label>
                    <input type="number" step="0.01" min="0" value={resForm.custo_executado}
                      onChange={e => setResForm(r => ({ ...r, custo_executado: e.target.value }))}
                      placeholder="0,00"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 600 }} />
                  </div>
                </div>
                {detalhe.custo_previsto != null && resForm.custo_executado !== '' && (
                  (() => {
                    const prev = detalhe.custo_previsto ?? 0
                    const exec = Number(resForm.custo_executado)
                    const dif = exec - prev
                    const acima = dif > 0
                    return (
                      <div style={{ fontSize: 12, color: acima ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                        {acima ? '▲ Acima do previsto em ' : dif < 0 ? '▼ Abaixo do previsto em ' : '✓ No orçamento — '}
                        {dif !== 0 ? fmtMoeda(Math.abs(dif)) : ''}
                      </div>
                    )
                  })()
                )}

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
                {(detalhe.historico ?? []).length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>Sem histórico</div>
                )}
                {[...(detalhe.historico ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(h => (
                  <div key={h.id} style={{ display: 'flex', gap: 10, paddingBottom: 12, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
                    <History size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{h.acao}</div>
                      {h.campo && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          {h.campo}: <span style={{ textDecoration: 'line-through' }}>{h.valor_anterior}</span> → <strong>{h.valor_novo}</strong>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{h.usuario_nome} · {new Date(h.created_at).toLocaleString('pt-BR')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
      style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, cursor: 'pointer', transition: 'box-shadow .15s', position: 'relative' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Prioridade strip */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', borderRadius: '10px 0 0 10px', background: prioCor(tarefa.prioridade) }} />
      <div style={{ paddingLeft: 8 }}>
        {/* Título */}
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>
          {tarefa.reaberta && <span style={{ fontSize: 10, background: '#fef9c3', color: '#92400e', borderRadius: 3, padding: '1px 4px', marginRight: 5 }}>↩</span>}
          {tarefa.titulo}
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--muted)' }}>{tarefa.setor}</span>
          <span style={{ background: prioCor(tarefa.prioridade) + '20', color: prioCor(tarefa.prioridade), borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{prioLabel(tarefa.prioridade)}</span>
          {tarefa.precisa_aprovacao && !tarefa.aprovado_at && (
            <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>⏳ Aprovação</span>
          )}
          {tarefa.prazo_extensao_status === 'pendente' && (
            <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>📅 Prazo+</span>
          )}
          {parseTags(tarefa.tags).slice(0, 2).map(tg => (
            <span key={tg} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--muted)' }}>#{tg}</span>
          ))}
        </div>

        {/* Responsável + prazo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
          <span>{tarefa.responsavel_nome || '—'}</span>
          {tarefa.prazo && (
            <span style={{ color: vencido(tarefa.prazo) ? '#dc2626' : 'var(--muted)', fontWeight: vencido(tarefa.prazo) ? 600 : 400 }}>
              {vencido(tarefa.prazo) && '⚠ '}{fmtData(tarefa.prazo)}
            </span>
          )}
        </div>

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

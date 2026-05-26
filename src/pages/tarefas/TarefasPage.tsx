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
  insertTarefaComentario, insertTarefaHistorico,
} from '../../lib/db'
import type { Tarefa, TarefaStatus, TarefaPrioridade, TarefaChecklist, TarefaComentario } from '../../types/database'

// ── Constants ────────────────────────────────────────────────

const SETORES = ['Geral','Cozinha','Bar','Salão','Estoque','Compras','Financeiro','RH','Limpeza','Produção','Diretoria']

const COLUNAS: { id: TarefaStatus; label: string; cor: string; bg: string }[] = [
  { id: 'pendente',             label: 'Pendente',             cor: '#6b7280', bg: '#f3f4f6' },
  { id: 'em_andamento',         label: 'Em Andamento',         cor: '#2563eb', bg: '#eff6ff' },
  { id: 'aguardando_validacao', label: 'Aguardando Validação', cor: '#d97706', bg: '#fffbeb' },
  { id: 'concluido',            label: 'Concluído',            cor: '#16a34a', bg: '#f0fdf4' },
  { id: 'cancelado',            label: 'Cancelado',            cor: '#dc2626', bg: '#fef2f2' },
]

const PRIORIDADES: { id: TarefaPrioridade; label: string; cor: string }[] = [
  { id: 'baixa',   label: 'Baixa',   cor: '#6b7280' },
  { id: 'media',   label: 'Média',   cor: '#2563eb' },
  { id: 'alta',    label: 'Alta',    cor: '#d97706' },
  { id: 'urgente', label: 'Urgente', cor: '#dc2626' },
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
function vencido(prazo: string | null) {
  if (!prazo) return false
  return new Date(prazo) < new Date(new Date().toDateString())
}

// ── Empty form ───────────────────────────────────────────────
const emptyForm = () => ({
  titulo: '', descricao: '', setor: 'Geral', prioridade: 'media' as TarefaPrioridade,
  responsavel_nome: '', solicitante_nome: '', prazo: '', observacoes: '',
  precisa_aprovacao: false,
  checklist: [] as string[],
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

  // Modal detalhe
  const [detalhe, setDetalhe] = useState<Tarefa | null>(null)
  const [novoComent, setNovoComent] = useState('')
  const [novoCheckDetalhe, setNovoCheckDetalhe] = useState('')
  const [detalheSaving, setDetalheSaving] = useState(false)
  const [abaDetalhe, setAbaDetalhe] = useState<'checklist'|'comentarios'|'historico'>('checklist')

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

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Central de Tarefas</h2>
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
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', flex: 1, minHeight: 0, paddingBottom: 8 }}>
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
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Nova Tarefa</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {/* Título */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Título *</label>
                <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Descreva a tarefa..."
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
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Responsável</label>
                  <input value={form.responsavel_nome} onChange={e => setForm(f => ({ ...f, responsavel_nome: e.target.value }))}
                    placeholder="Nome do responsável"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Solicitante</label>
                  <input value={form.solicitante_nome} onChange={e => setForm(f => ({ ...f, solicitante_nome: e.target.value }))}
                    placeholder={user?.name || 'Nome do solicitante'}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                </div>
              </div>

              {/* Prazo */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Prazo</label>
                <input type="date" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
              </div>

              {/* Descrição */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Descrição</label>
                <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  rows={3} placeholder="Detalhes da tarefa..."
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
                Requer aprovação do gestor
              </label>

              {/* Observações */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Observações</label>
                <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2} placeholder="Informações adicionais..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical' }} />
              </div>
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
                  {detalhe.reaberta && <span style={{ fontSize: 11, background: '#fef9c3', color: '#92400e', borderRadius: 4, padding: '2px 6px', marginBottom: 6, display: 'inline-block' }}>↩ Reaberta</span>}
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
            </div>

            {/* Descrição */}
            {detalhe.descricao && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
                {detalhe.descricao}
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
              {(['checklist', 'comentarios', 'historico'] as const).map(aba => (
                <button key={aba} onClick={() => setAbaDetalhe(aba)}
                  style={{ flex: 1, padding: '10px 8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: abaDetalhe === aba ? 700 : 400, color: abaDetalhe === aba ? 'var(--bordo)' : 'var(--muted)', borderBottom: abaDetalhe === aba ? '2px solid var(--bordo)' : '2px solid transparent' }}>
                  {aba === 'checklist' ? `✓ Checklist (${detalhe.checklist?.length ?? 0})` : aba === 'comentarios' ? `💬 Comentários (${detalhe.comentarios?.length ?? 0})` : `📋 Histórico`}
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
                  <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>Nenhum comentário ainda</div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input value={novoComent} onChange={e => setNovoComent(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addComentario()}
                    placeholder="Adicionar comentário..."
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                  <button onClick={addComentario} disabled={detalheSaving || !novoComent.trim()}
                    style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer' }}>
                    <MessageSquare size={14} />
                  </button>
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

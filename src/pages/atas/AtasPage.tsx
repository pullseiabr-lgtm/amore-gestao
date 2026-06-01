import { useState, useEffect, useMemo } from 'react'
import {
  Plus, X, Edit2, Trash2, Search,
  FileText, Users, ChevronRight, ChevronDown,
  ThumbsUp, Send, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchAtas, insertAta, updateAta, deleteAta,
  insertAtaAcao, updateAtaAcao, deleteAtaAcao,
  insertTarefa, uploadAnexo,
} from '../../lib/db'
import type { AtaReuniao, AtaAcao, AtaTipo, AtaStatus, AtaAcaoStatus } from '../../types/database'

/* ── constants ──────────────────────────────────────────── */
const TIPOS: Record<AtaTipo, { label: string; emoji: string; cor: string }> = {
  operacional:  { label: 'Operacional',  emoji: '⚙️',  cor: '#6366f1' },
  estrategica:  { label: 'Estratégica',  emoji: '🎯',  cor: '#8b5cf6' },
  feedback:     { label: 'Feedback',     emoji: '💬',  cor: '#3b82f6' },
  treinamento:  { label: 'Treinamento',  emoji: '📚',  cor: '#ec4899' },
  outro:        { label: 'Outro',        emoji: '📌',  cor: '#6b7280' },
}

const STATUS_ATA: Record<AtaStatus, { label: string; color: string }> = {
  rascunho:   { label: 'Rascunho',   color: '#6b7280' },
  finalizada: { label: 'Finalizada', color: '#3b82f6' },
  aprovada:   { label: 'Aprovada',   color: '#10b981' },
}

const STATUS_ACAO: Record<AtaAcaoStatus, { label: string; color: string }> = {
  pendente:     { label: 'Pendente',     color: '#f59e0b' },
  em_andamento: { label: 'Em andamento', color: '#3b82f6' },
  concluido:    { label: 'Concluído',    color: '#10b981' },
  cancelado:    { label: 'Cancelado',    color: '#6b7280' },
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

const today = new Date().toISOString().slice(0, 10)

const BLANK_ATA: Omit<AtaReuniao, 'id' | 'created_at' | 'updated_at' | 'acoes'> = {
  loja: '', titulo: '', data_reuniao: today, hora_inicio: '09:00', hora_fim: null, local_reuniao: null,
  tipo: 'operacional', participantes: [], pauta: null, decisoes: null, proximos_passos: null,
  observacoes: null, status: 'rascunho', aprovada_por: null, aprovada_at: null,
  arquivo_url: null, arquivo_nome: null, created_by: null,
}

/* ══════════════════════════════════════════════════════════ */
export default function AtasPage() {
  const { user, can } = useAuth()
  const { loja }       = useLoja()

  const [atas,    setAtas]    = useState<AtaReuniao[]>([])
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  const [filterTipo, setFilterTipo] = useState<AtaTipo | ''>('')

  const [selAta,        setSelAta]        = useState<AtaReuniao | null>(null)
  const [showAtaModal,  setShowAtaModal]  = useState(false)
  const [editAta,       setEditAta]       = useState<AtaReuniao | null>(null)
  const [ataForm,       setAtaForm]       = useState({ ...BLANK_ATA })
  const [participInput, setParticipInput] = useState('')

  const [newAcao,   setNewAcao]   = useState({ descricao: '', responsavel: '', prazo: '' })
  const [expandAta, setExpandAta] = useState<string | null>(null)
  const [uploadingAnexo, setUploadingAnexo] = useState(false)

  const handleUploadAnexo = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingAnexo(true)
    try {
      const urls: string[] = []
      for (const f of Array.from(files)) {
        try { urls.push(await uploadAnexo(f, 'atas')) } catch (e) { alert('Falha ao enviar ' + f.name + ': ' + (e as Error).message) }
      }
      if (urls.length) {
        setAtaForm(p => ({ ...p, arquivo_url: [p.arquivo_url, urls.join('\n')].filter(Boolean).join('\n') }))
      }
    } finally { setUploadingAnexo(false) }
  }
  const [saving, setSaving]       = useState(false)

  const load = async () => {
    if (!loja) return
    setLoading(true)
    const a = await fetchAtas(loja)
    setAtas(a)
    setLoading(false)
  }
  useEffect(() => { load() }, [loja])

  const filtered = useMemo(() => atas.filter(a => {
    if (search    && !a.titulo.toLowerCase().includes(search.toLowerCase())) return false
    if (filterTipo && a.tipo !== filterTipo) return false
    return true
  }), [atas, search, filterTipo])

  /* ── ata CRUD ── */
  const openNewAta = () => {
    setEditAta(null)
    setAtaForm({ ...BLANK_ATA, loja, created_by: user?.name || null })
    setParticipInput('')
    setShowAtaModal(true)
  }
  const openEditAta = (a: AtaReuniao) => {
    setEditAta(a)
    setAtaForm({ loja: a.loja, titulo: a.titulo, data_reuniao: a.data_reuniao, hora_inicio: a.hora_inicio, hora_fim: a.hora_fim, local_reuniao: a.local_reuniao, tipo: a.tipo, participantes: a.participantes || [], pauta: a.pauta, decisoes: a.decisoes, proximos_passos: a.proximos_passos, observacoes: a.observacoes, status: a.status, aprovada_por: a.aprovada_por, aprovada_at: a.aprovada_at, arquivo_url: a.arquivo_url, arquivo_nome: a.arquivo_nome, created_by: a.created_by })
    setParticipInput('')
    setShowAtaModal(true)
  }
  const saveAta = async () => {
    if (!ataForm.titulo.trim()) return
    setSaving(true)
    try {
      if (editAta) await updateAta(editAta.id, ataForm)
      else await insertAta({ ...ataForm, loja })
      setShowAtaModal(false)
      await load()
    } finally { setSaving(false) }
  }
  const removeAta = async (id: string) => {
    if (!confirm('Excluir esta ata? Todas as ações vinculadas serão removidas.')) return
    await deleteAta(id)
    if (selAta?.id === id) setSelAta(null)
    await load()
  }
  const aprovarAta = async (a: AtaReuniao) => {
    await updateAta(a.id, { status: 'aprovada', aprovada_por: user?.name || 'Gestão', aprovada_at: new Date().toISOString() })
    await load()
    if (selAta?.id === a.id) setSelAta(prev => prev ? { ...prev, status: 'aprovada' } : null)
  }
  const finalizarAta = async (a: AtaReuniao) => {
    await updateAta(a.id, { status: 'finalizada' })
    await load()
  }

  /* ── ação CRUD ── */
  const addAcao = async (ataId: string) => {
    if (!newAcao.descricao.trim() || !newAcao.responsavel.trim()) return
    setSaving(true)
    try {
      await insertAtaAcao({
        loja, ata_id: ataId, descricao: newAcao.descricao, responsavel: newAcao.responsavel,
        prazo: newAcao.prazo || null, status: 'pendente', tarefa_id: null, observacoes: null,
      })
      setNewAcao({ descricao: '', responsavel: '', prazo: '' })
      await load()
    } finally { setSaving(false) }
  }
  const updateAcaoStatus = async (id: string, status: AtaAcaoStatus) => {
    await updateAtaAcao(id, { status })
    await load()
  }
  const removeAcao = async (id: string) => {
    await deleteAtaAcao(id)
    await load()
  }

  /* ── criar tarefa a partir de ação ── */
  const criarTarefaDaAcao = async (acao: AtaAcao, ata: AtaReuniao) => {
    if (!confirm(`Criar tarefa para: "${acao.descricao}"?`)) return
    setSaving(true)
    try {
      const tarefa = await insertTarefa({
        loja,
        titulo: acao.descricao,
        descricao: `Gerada da ata: ${ata.titulo} (${fmtDate(ata.data_reuniao)})`,
        setor: 'Geral',
        status: 'pendente',
        prioridade: 'media',
        responsavel_nome: acao.responsavel,
        solicitante_nome: user?.name || 'Sistema',
        prazo: acao.prazo || null,
        observacoes: null,
        objetivo: null,
        envolvidos: null,
        competencia: null,
        data_inicio: null,
        entregaveis: null,
        anexos: null,
        tags: null,
        custo_previsto: null,
        custo_executado: null,
        resultado_esperado: null,
        resultado_final: null,
        dificuldades: null,
        iniciado_em: null,
        concluido_em: null,
        prazo_extensao_data: null,
        prazo_extensao_motivo: null,
        prazo_extensao_status: null,
        data_solicitacao: new Date().toISOString().slice(0, 10),
        resultado_status: null,
        validado_por: null,
        validado_em: null,
        observacao_final: null,
        precisa_aprovacao: false,
        aprovado_por: null,
        aprovado_at: null,
        obs_aprovacao: null,
        reaberta: false,
        created_by: user?.name || null,
      })
      await updateAtaAcao(acao.id, { tarefa_id: tarefa.id })
      await load()
      alert('✅ Tarefa criada com sucesso!')
    } finally { setSaving(false) }
  }

  /* ── stats ── */
  const stats = useMemo(() => {
    const todasAcoes = atas.flatMap(a => a.acoes || [])
    return {
      totalAtas:    atas.length,
      aprovadas:    atas.filter(a => a.status === 'aprovada').length,
      acoesPendentes: todasAcoes.filter(a => a.status === 'pendente').length,
      acoesOk:      todasAcoes.filter(a => a.status === 'concluido').length,
    }
  }, [atas])

  /* ════════════════ RENDER ════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ata..."
              style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value as AtaTipo | '')}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: 13 }}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} />
          </button>
          {can('atas', 'create') && (
            <button onClick={openNewAta}
              style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nova Ata
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
        {[
          { label: 'Total de Atas',     value: stats.totalAtas,       color: '#6366f1' },
          { label: 'Aprovadas',         value: stats.aprovadas,       color: '#10b981' },
          { label: 'Ações pendentes',   value: stats.acoesPendentes,  color: '#f59e0b' },
          { label: 'Ações concluídas',  value: stats.acoesOk,         color: '#10b981' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--card-bg)', borderRadius: 10, padding: '12px 16px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* List */}
      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
          <FileText size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p>Nenhuma ata encontrada</p>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(a => {
          const ti = TIPOS[a.tipo]
          const st = STATUS_ATA[a.status]
          const isExpanded = expandAta === a.id
          const acoes = a.acoes || []
          return (
            <div key={a.id} style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1px solid ${selAta?.id === a.id ? 'var(--primary)' : 'var(--border)'}`, overflow: 'hidden' }}>
              {/* main row */}
              <div onClick={() => setSelAta(selAta?.id === a.id ? null : a)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }}>
                <div style={{ fontSize: 22, lineHeight: 1 }}>{ti.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{a.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {fmtDate(a.data_reuniao)}
                    {a.hora_inicio && ` · ${a.hora_inicio.slice(0,5)}`}
                    {a.local_reuniao && ` · ${a.local_reuniao}`}
                    {acoes.length > 0 && ` · ${acoes.filter(x => x.status === 'pendente').length} ações pendentes`}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: ti.cor + '20', color: ti.cor }}>{ti.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: st.color + '20', color: st.color }}>{st.label}</span>
                {(a.participantes || []).length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <Users size={12} />
                    <span>{(a.participantes || []).length}</span>
                  </div>
                )}
                <button onClick={e => { e.stopPropagation(); setExpandAta(isExpanded ? null : a.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              </div>

              {/* expanded actions */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px', background: 'var(--bg-secondary,#f9fafb)' }}>
                  {/* pauta / decisoes summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {a.pauta && (
                      <div style={{ background: 'var(--card-bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Pauta</div>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.pauta}</p>
                      </div>
                    )}
                    {a.decisoes && (
                      <div style={{ background: 'var(--card-bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Decisões</div>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.decisoes}</p>
                      </div>
                    )}
                  </div>

                  {/* anexos */}
                  {a.arquivo_url && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>📎 Anexos</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {a.arquivo_url.split(/\n+/).map(s => s.trim()).filter(Boolean).map((linha, i) => (
                          /^https?:\/\//.test(linha)
                            ? <a key={i} href={linha} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--primary)', wordBreak: 'break-all' }}>🔗 {linha}</a>
                            : <span key={i} style={{ fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{linha}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* actions list */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>
                      Ações ({acoes.length})
                    </div>
                    {acoes.map(ac => {
                      const as = STATUS_ACAO[ac.status]
                      return (
                        <div key={ac.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                          <select value={ac.status} onChange={e => updateAcaoStatus(ac.id, e.target.value as AtaAcaoStatus)}
                            style={{ padding: '3px 6px', borderRadius: 6, border: `1px solid ${as.color}40`, background: as.color + '15', color: as.color, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            {Object.entries(STATUS_ACAO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textDecoration: ac.status === 'concluido' ? 'line-through' : 'none', opacity: ac.status === 'cancelado' ? 0.5 : 1 }}>{ac.descricao}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              👤 {ac.responsavel}
                              {ac.prazo && ` · ⏰ ${new Date(ac.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                              {ac.tarefa_id && <span style={{ marginLeft: 6, color: '#10b981' }}>✅ Tarefa criada</span>}
                            </div>
                          </div>
                          {!ac.tarefa_id && can('atas', 'edit') && (
                            <button onClick={() => criarTarefaDaAcao(ac, a)} title="Criar tarefa"
                              style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Send size={10} /> Tarefa
                            </button>
                          )}
                          {can('atas', 'delete') && (
                            <button onClick={() => removeAcao(ac.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {acoes.length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0' }}>Nenhuma ação registrada.</p>
                    )}
                  </div>

                  {/* add action */}
                  {can('atas', 'edit') && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <input value={newAcao.descricao} onChange={e => setNewAcao(p => ({ ...p, descricao: e.target.value }))}
                        placeholder="Descrição da ação *"
                        style={{ flex: 2, minWidth: 160, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12 }} />
                      <input value={newAcao.responsavel} onChange={e => setNewAcao(p => ({ ...p, responsavel: e.target.value }))}
                        placeholder="Responsável *"
                        style={{ flex: 1, minWidth: 120, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12 }} />
                      <input type="date" value={newAcao.prazo} onChange={e => setNewAcao(p => ({ ...p, prazo: e.target.value }))}
                        style={{ flex: 1, minWidth: 130, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12 }} />
                      <button onClick={() => addAcao(a.id)} disabled={saving || !newAcao.descricao.trim() || !newAcao.responsavel.trim()}
                        style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, opacity: saving ? 0.6 : 1 }}>
                        + Ação
                      </button>
                    </div>
                  )}

                  {/* ata actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    {can('atas', 'edit') && a.status === 'rascunho' && (
                      <button onClick={() => finalizarAta(a)}
                        style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #3b82f6', color: '#3b82f6', background: '#3b82f610', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Finalizar Ata
                      </button>
                    )}
                    {can('atas', 'edit') && a.status === 'finalizada' && (
                      <button onClick={() => aprovarAta(a)}
                        style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#10b981', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ThumbsUp size={12} /> Aprovar Ata
                      </button>
                    )}
                    {can('atas', 'edit') && (
                      <button onClick={() => openEditAta(a)}
                        style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Edit2 size={12} /> Editar
                      </button>
                    )}
                    {can('atas', 'delete') && (
                      <button onClick={() => removeAta(a.id)}
                        style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#ef444418', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Trash2 size={12} /> Excluir
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ══ Modal: Nova/Editar Ata ══ */}
      {showAtaModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowAtaModal(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px #0004' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{editAta ? 'Editar Ata' : 'Nova Ata de Reunião'}</h3>
              <button onClick={() => setShowAtaModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* titulo */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Título *</label>
                <input value={ataForm.titulo} onChange={e => setAtaForm(p => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ex: Reunião de alinhamento semanal"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              {/* tipo / status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tipo</label>
                  <select value={ataForm.tipo} onChange={e => setAtaForm(p => ({ ...p, tipo: e.target.value as AtaTipo }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Status</label>
                  <select value={ataForm.status} onChange={e => setAtaForm(p => ({ ...p, status: e.target.value as AtaStatus }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {Object.entries(STATUS_ATA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              {/* data / hora */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Data *</label>
                  <input type="date" value={ataForm.data_reuniao} onChange={e => setAtaForm(p => ({ ...p, data_reuniao: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Início</label>
                  <input type="time" value={ataForm.hora_inicio || ''} onChange={e => setAtaForm(p => ({ ...p, hora_inicio: e.target.value || null }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Fim</label>
                  <input type="time" value={ataForm.hora_fim || ''} onChange={e => setAtaForm(p => ({ ...p, hora_fim: e.target.value || null }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              {/* local */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Local / Sala</label>
                <input value={ataForm.local_reuniao || ''} onChange={e => setAtaForm(p => ({ ...p, local_reuniao: e.target.value || null }))}
                  placeholder="Ex: Sala da gestão / Online (Meet)"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              {/* participantes */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Participantes</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input value={participInput} onChange={e => setParticipInput(e.target.value)}
                    placeholder="Nome do participante"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && participInput.trim()) {
                        setAtaForm(p => ({ ...p, participantes: [...(p.participantes || []), participInput.trim()] }))
                        setParticipInput('')
                      }
                    }}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12 }} />
                  <button onClick={() => { if (participInput.trim()) { setAtaForm(p => ({ ...p, participantes: [...(p.participantes || []), participInput.trim()] })); setParticipInput('') } }}
                    style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>+</button>
                </div>
                {(ataForm.participantes || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {(ataForm.participantes || []).map((p, i) => (
                      <span key={i} style={{ padding: '3px 8px', borderRadius: 20, background: 'var(--primary)20', color: 'var(--primary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {p}
                        <button onClick={() => setAtaForm(pr => ({ ...pr, participantes: (pr.participantes || []).filter((_, j) => j !== i) }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {/* pauta / decisoes / proximos */}
              {[
                { field: 'pauta',           label: 'Pauta',           placeholder: 'Tópicos a discutir...' },
                { field: 'decisoes',        label: 'Decisões',        placeholder: 'O que foi decidido...' },
                { field: 'proximos_passos', label: 'Próximos passos', placeholder: 'Encaminhamentos gerais...' },
              ].map(f => (
                <div key={f.field}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <textarea value={(ataForm as Record<string, unknown>)[f.field] as string || ''} onChange={e => setAtaForm(p => ({ ...p, [f.field]: e.target.value || null }))} rows={3}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              ))}
              {/* anexos */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>📎 Anexos</label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 8, border: '1px dashed var(--primary)', background: 'var(--bg-secondary,#f9fafb)', cursor: uploadingAnexo ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--primary)', marginBottom: 6 }}>
                  {uploadingAnexo ? '⏳ Enviando…' : '📤 Enviar arquivo / foto (do celular)'}
                  <input type="file" accept="image/*,application/pdf" multiple capture="environment" disabled={uploadingAnexo}
                    onChange={e => handleUploadAnexo(e.target.files)} style={{ display: 'none' }} />
                </label>
                <textarea value={ataForm.arquivo_url || ''} onChange={e => setAtaForm(p => ({ ...p, arquivo_url: e.target.value || null }))} rows={2}
                  placeholder="Arquivos enviados aparecem aqui. Também pode colar links (Drive/PDF), um por linha…"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              {/* actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowAtaModal(false)}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={saveAta} disabled={saving || !ataForm.titulo.trim()}
                  style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

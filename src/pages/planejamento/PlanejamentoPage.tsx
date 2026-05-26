import { useState, useEffect, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, X, Edit2, Trash2,
  Target, CheckCircle2, AlertTriangle, Clock, RefreshCw,
  Calendar, Flag,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchPlanejamentoEventos, insertPlanejamentoEvento, updatePlanejamentoEvento, deletePlanejamentoEvento,
  fetchPlanejamentoMetas, insertPlanejamentoMeta, updatePlanejamentoMeta, deletePlanejamentoMeta,
} from '../../lib/db'
import type {
  PlanejamentoEvento, PlanejamentoMeta,
  PlanejamentoTipo, PlanejamentoStatus, PlanejamentoPrioridade,
} from '../../types/database'

/* ── constants ──────────────────────────────────────────── */
const TIPOS: Record<PlanejamentoTipo, { label: string; cor: string; emoji: string }> = {
  reuniao:        { label: 'Reunião',         cor: '#3b82f6', emoji: '🤝' },
  evento_especial:{ label: 'Evento Especial', cor: '#f59e0b', emoji: '🎉' },
  turno:          { label: 'Turno',           cor: '#6366f1', emoji: '🕐' },
  rotina:         { label: 'Rotina',          cor: '#10b981', emoji: '🔄' },
  meta:           { label: 'Meta',            cor: '#8b5cf6', emoji: '🎯' },
  treinamento:    { label: 'Treinamento',     cor: '#ec4899', emoji: '📚' },
  outro:          { label: 'Outro',           cor: '#6b7280', emoji: '📌' },
}

const STATUS_EV: Record<PlanejamentoStatus, { label: string; color: string }> = {
  planejado:    { label: 'Planejado',    color: '#6366f1' },
  em_andamento: { label: 'Em andamento', color: '#f59e0b' },
  concluido:    { label: 'Concluído',    color: '#10b981' },
  cancelado:    { label: 'Cancelado',    color: '#6b7280' },
}

const PRIORIDADES: Record<PlanejamentoPrioridade, { label: string; color: string }> = {
  baixa:   { label: 'Baixa',   color: '#10b981' },
  media:   { label: 'Média',   color: '#6366f1' },
  alta:    { label: 'Alta',    color: '#f59e0b' },
  urgente: { label: 'Urgente', color: '#ef4444' },
}

const SETORES = ['Geral', 'Cozinha', 'Salão', 'Bar', 'Gestão', 'Financeiro', 'RH', 'Marketing', 'Operações']
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function toYMD(d: Date) { return d.toISOString().slice(0, 10) }
function padMonth(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

/* ── calendar helper ────────────────────────────────────── */
function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  return days
}

/* ── blank forms ────────────────────────────────────────── */
const today = new Date()
const BLANK_EV: Omit<PlanejamentoEvento, 'id' | 'created_at' | 'updated_at'> = {
  loja: '', titulo: '', descricao: null, tipo: 'reuniao',
  data_inicio: toYMD(today), data_fim: null, hora_inicio: '09:00', hora_fim: '10:00',
  dia_todo: false, setor: null, responsavel: null, status: 'planejado',
  prioridade: 'media', cor: '#3b82f6', recorrente: false, recorrencia: null, observacoes: null, created_by: null,
}
const BLANK_META: Omit<PlanejamentoMeta, 'id' | 'created_at' | 'updated_at'> = {
  loja: '', titulo: '', setor: 'Geral', indicador: '', meta_valor: 100, valor_atual: 0,
  unidade: '%', periodo_ref: padMonth(today), status: 'em_andamento', observacoes: null, created_by: null,
}

/* ══════════════════════════════════════════════════════════ */
export default function PlanejamentoPage() {
  const { user, can } = useAuth()
  const { loja }       = useLoja()

  const [tab, setTab]         = useState<'calendario' | 'metas'>('calendario')
  const [viewMode, setViewMode] = useState<'mes' | 'semana'>('mes')
  const [curDate, setCurDate] = useState(new Date())

  const [eventos, setEventos] = useState<PlanejamentoEvento[]>([])
  const [metas,   setMetas]   = useState<PlanejamentoMeta[]>([])
  const [_loading, setLoading] = useState(false)

  // modals
  const [showEvModal,   setShowEvModal]   = useState(false)
  const [showMetaModal, setShowMetaModal] = useState(false)
  const [editEv,        setEditEv]        = useState<PlanejamentoEvento | null>(null)
  const [editMeta,      setEditMeta]      = useState<PlanejamentoMeta | null>(null)
  const [selEv,         setSelEv]         = useState<PlanejamentoEvento | null>(null)
  const [selectedDay,   setSelectedDay]   = useState<string | null>(null)

  const [evForm,   setEvForm]   = useState({ ...BLANK_EV })
  const [metaForm, setMetaForm] = useState({ ...BLANK_META })
  const [saving, setSaving]     = useState(false)

  const year  = curDate.getFullYear()
  const month = curDate.getMonth()
  const mesRef = padMonth(curDate)

  /* ── load ── */
  const load = async () => {
    if (!loja) return
    setLoading(true)
    const [ev, mt] = await Promise.all([
      fetchPlanejamentoEventos(loja),
      fetchPlanejamentoMetas(loja),
    ])
    setEventos(ev)
    setMetas(mt)
    setLoading(false)
  }
  useEffect(() => { load() }, [loja])

  /* ── calendar data ── */
  const calDays = useMemo(() => buildCalendarDays(year, month), [year, month])

  const eventosByDay = useMemo(() => {
    const m: Record<string, PlanejamentoEvento[]> = {}
    eventos.forEach(e => {
      const d = e.data_inicio.slice(0, 10)
      if (!m[d]) m[d] = []
      m[d].push(e)
    })
    return m
  }, [eventos])

  /* ── week view ── */
  const weekDays = useMemo(() => {
    const start = new Date(curDate)
    start.setDate(curDate.getDate() - curDate.getDay())
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [curDate])

  /* ── nav ── */
  const prev = () => {
    const d = new Date(curDate)
    if (viewMode === 'mes') d.setMonth(d.getMonth() - 1)
    else d.setDate(d.getDate() - 7)
    setCurDate(d)
  }
  const next = () => {
    const d = new Date(curDate)
    if (viewMode === 'mes') d.setMonth(d.getMonth() + 1)
    else d.setDate(d.getDate() + 7)
    setCurDate(d)
  }

  /* ── evento CRUD ── */
  const openNewEv = (day?: string) => {
    setEditEv(null)
    setEvForm({ ...BLANK_EV, loja, data_inicio: day || toYMD(today), created_by: user?.name || null })
    setShowEvModal(true)
  }
  const openEditEv = (e: PlanejamentoEvento) => {
    setEditEv(e)
    setEvForm({ loja: e.loja, titulo: e.titulo, descricao: e.descricao, tipo: e.tipo, data_inicio: e.data_inicio, data_fim: e.data_fim, hora_inicio: e.hora_inicio, hora_fim: e.hora_fim, dia_todo: e.dia_todo, setor: e.setor, responsavel: e.responsavel, status: e.status, prioridade: e.prioridade, cor: e.cor, recorrente: e.recorrente, recorrencia: e.recorrencia, observacoes: e.observacoes, created_by: e.created_by })
    setShowEvModal(true)
  }
  const saveEv = async () => {
    if (!evForm.titulo.trim()) return
    setSaving(true)
    try {
      if (editEv) await updatePlanejamentoEvento(editEv.id, evForm)
      else await insertPlanejamentoEvento({ ...evForm, loja })
      setShowEvModal(false)
      setSelEv(null)
      await load()
    } finally { setSaving(false) }
  }
  const removeEv = async (id: string) => {
    if (!confirm('Excluir este evento?')) return
    await deletePlanejamentoEvento(id)
    setSelEv(null)
    await load()
  }

  /* ── meta CRUD ── */
  const openNewMeta = () => {
    setEditMeta(null)
    setMetaForm({ ...BLANK_META, loja, periodo_ref: mesRef, created_by: user?.name || null })
    setShowMetaModal(true)
  }
  const openEditMeta = (m: PlanejamentoMeta) => {
    setEditMeta(m)
    setMetaForm({ loja: m.loja, titulo: m.titulo, setor: m.setor, indicador: m.indicador, meta_valor: m.meta_valor, valor_atual: m.valor_atual, unidade: m.unidade, periodo_ref: m.periodo_ref, status: m.status, observacoes: m.observacoes, created_by: m.created_by })
    setShowMetaModal(true)
  }
  const saveMeta = async () => {
    if (!metaForm.titulo.trim() || !metaForm.indicador.trim()) return
    setSaving(true)
    try {
      if (editMeta) await updatePlanejamentoMeta(editMeta.id, metaForm)
      else await insertPlanejamentoMeta({ ...metaForm, loja })
      setShowMetaModal(false)
      await load()
    } finally { setSaving(false) }
  }
  const removeMeta = async (id: string) => {
    if (!confirm('Excluir esta meta?')) return
    await deletePlanejamentoMeta(id)
    await load()
  }

  /* ── meta stats ── */
  const metaStats = useMemo(() => {
    const cur = metas.filter(m => m.periodo_ref === mesRef)
    return {
      total:     cur.length,
      atingidas: cur.filter(m => m.status === 'atingida').length,
      andamento: cur.filter(m => m.status === 'em_andamento').length,
      naoAting:  cur.filter(m => m.status === 'nao_atingida').length,
    }
  }, [metas, mesRef])

  const evMes = useMemo(() =>
    eventos.filter(e => e.data_inicio.startsWith(mesRef)).length,
    [eventos, mesRef]
  )

  /* ════════════════ RENDER ════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['calendario', 'metas'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                background: tab === t ? 'var(--primary)' : 'var(--card-bg)', color: tab === t ? '#fff' : 'var(--text-secondary)' }}>
              {t === 'calendario' ? '📅 Calendário' : '🎯 Metas & Indicadores'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={load} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} />
          </button>
          {tab === 'calendario' && can('planejamento', 'create') && (
            <button onClick={() => openNewEv()}
              style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Novo Evento
            </button>
          )}
          {tab === 'metas' && can('planejamento', 'create') && (
            <button onClick={openNewMeta}
              style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nova Meta
            </button>
          )}
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
        {[
          { label: 'Eventos este mês',  value: evMes,           color: '#6366f1', icon: <Calendar size={16} /> },
          { label: 'Metas do mês',      value: metaStats.total,    color: '#8b5cf6', icon: <Target size={16} /> },
          { label: 'Atingidas',         value: metaStats.atingidas, color: '#10b981', icon: <CheckCircle2 size={16} /> },
          { label: 'Em andamento',      value: metaStats.andamento, color: '#f59e0b', icon: <Clock size={16} /> },
          { label: 'Não atingidas',     value: metaStats.naoAting,  color: '#ef4444', icon: <AlertTriangle size={16} /> },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--card-bg)', borderRadius: 10, padding: '12px 16px', border: '1px solid var(--border)' }}>
            <div style={{ color: k.color, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ══ TAB: Calendário ══ */}
      {tab === 'calendario' && (
        <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>

          {/* Nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <button onClick={prev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 6, borderRadius: 6 }}><ChevronLeft size={20} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                {viewMode === 'mes'
                  ? `${MESES_PT[month]} ${year}`
                  : `${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MESES_PT[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`}
              </h3>
              <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {(['mes', 'semana'] as const).map(v => (
                  <button key={v} onClick={() => setViewMode(v)}
                    style={{ padding: '4px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: viewMode === v ? 'var(--primary)' : 'var(--card-bg)',
                      color: viewMode === v ? '#fff' : 'var(--text-secondary)' }}>
                    {v === 'mes' ? 'Mês' : 'Semana'}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={next} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 6, borderRadius: 6 }}><ChevronRight size={20} /></button>
          </div>

          {/* ── Month view ── */}
          {viewMode === 'mes' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--border)' }}>
                {DIAS_SEMANA.map(d => (
                  <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                {calDays.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} style={{ minHeight: 90, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary,#f9fafb)', opacity: 0.5 }} />
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayEvents = eventosByDay[dateStr] || []
                  const isToday   = dateStr === toYMD(new Date())
                  const isSel     = dateStr === selectedDay
                  return (
                    <div key={day} onClick={() => { setSelectedDay(isSel ? null : dateStr); setSelEv(null) }}
                      style={{ minHeight: 90, padding: 6, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSel ? 'var(--primary)10' : 'transparent', position: 'relative' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: isToday ? 'var(--primary)' : 'transparent', color: isToday ? '#fff' : 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: isToday ? 700 : 500, fontSize: 13, marginBottom: 4 }}>{day}</div>
                      {dayEvents.slice(0, 3).map(ev => (
                        <div key={ev.id} onClick={e => { e.stopPropagation(); setSelEv(ev); setSelectedDay(dateStr) }}
                          style={{ fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 4, marginBottom: 2, background: ev.cor + '25', color: ev.cor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: `1px solid ${ev.cor}40` }}>
                          {TIPOS[ev.tipo]?.emoji} {ev.titulo}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', paddingLeft: 5 }}>+{dayEvents.length - 3}</div>
                      )}
                      {can('planejamento', 'create') && (
                        <button onClick={e => { e.stopPropagation(); openNewEv(dateStr) }}
                          style={{ position: 'absolute', top: 4, right: 4, opacity: 0, transition: 'opacity .2s', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 2, lineHeight: 1 }}
                          className="day-add-btn">
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Week view ── */}
          {viewMode === 'semana' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--border)' }}>
                {weekDays.map(d => {
                  const dateStr = toYMD(d)
                  const isToday = dateStr === toYMD(new Date())
                  return (
                    <div key={dateStr} style={{ padding: '12px 8px', borderRight: '1px solid var(--border)', background: isToday ? 'var(--primary)08' : 'transparent' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>{DIAS_SEMANA[d.getDay()]}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: isToday ? 'var(--primary)' : 'var(--text-primary)', marginTop: 2 }}>{d.getDate()}</div>
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(eventosByDay[dateStr] || []).map(ev => (
                          <div key={ev.id} onClick={() => { setSelEv(ev); setSelectedDay(dateStr) }}
                            style={{ fontSize: 11, fontWeight: 600, padding: '4px 6px', borderRadius: 6, background: ev.cor + '20', color: ev.cor, cursor: 'pointer', border: `1px solid ${ev.cor}40` }}>
                            {ev.hora_inicio && <span style={{ opacity: 0.7, marginRight: 4 }}>{ev.hora_inicio.slice(0, 5)}</span>}
                            {TIPOS[ev.tipo]?.emoji} {ev.titulo}
                          </div>
                        ))}
                        {can('planejamento', 'create') && (
                          <button onClick={() => openNewEv(dateStr)}
                            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left' }}>
                            + Evento
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Day events list (when day selected) ── */}
          {selectedDay && !selEv && (eventosByDay[selectedDay] || []).length > 0 && (
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--card-bg)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase' }}>
                {new Date(selectedDay + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(eventosByDay[selectedDay] || []).map(ev => {
                  const ti = TIPOS[ev.tipo]
                  const st = STATUS_EV[ev.status]
                  return (
                    <div key={ev.id} onClick={() => setSelEv(ev)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${ev.cor}30`, background: ev.cor + '08', cursor: 'pointer' }}>
                      <div style={{ fontSize: 20 }}>{ti.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{ev.titulo}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {!ev.dia_todo && ev.hora_inicio && `${ev.hora_inicio.slice(0,5)}${ev.hora_fim ? ` – ${ev.hora_fim.slice(0,5)}` : ''} · `}
                          {ev.setor || 'Geral'} · {ev.responsavel || '—'}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: st.color + '20', color: st.color }}>{st.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: PRIORIDADES[ev.prioridade].color + '20', color: PRIORIDADES[ev.prioridade].color }}>{PRIORIDADES[ev.prioridade].label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: Metas ══ */}
      {tab === 'metas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Filtro período */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Período:</label>
            <input type="month" defaultValue={mesRef} onChange={_e => {
              setMetas(m => m) // re-render
            }}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }} />
          </div>

          {/* Meta cards */}
          {metas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
              <Target size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p>Nenhuma meta cadastrada</p>
              {can('planejamento', 'create') && (
                <button onClick={openNewMeta} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                  Criar primeira meta
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
              {metas.map(m => {
                const pct  = m.meta_valor > 0 ? Math.min(100, (m.valor_atual / m.meta_valor) * 100) : 0
                const cor  = m.status === 'atingida' ? '#10b981' : m.status === 'nao_atingida' ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#6366f1'
                return (
                  <div key={m.id} style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 18, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{m.titulo}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{m.setor} · {m.periodo_ref}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {can('planejamento', 'edit') && (
                          <button onClick={() => openEditMeta(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}><Edit2 size={12} /></button>
                        )}
                        {can('planejamento', 'delete') && (
                          <button onClick={() => removeMeta(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}><Trash2 size={12} /></button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{m.indicador}</div>

                    {/* progress */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: cor }}>{m.valor_atual}<span style={{ fontSize: 13, fontWeight: 500, marginLeft: 2 }}>{m.unidade}</span></span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>meta: {m.meta_valor} {m.unidade}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 8, background: 'var(--border)', overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', borderRadius: 8, background: cor, width: `${pct}%`, transition: 'width .4s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cor }}>{pct.toFixed(0)}% atingido</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: (m.status === 'atingida' ? '#10b981' : m.status === 'nao_atingida' ? '#ef4444' : '#f59e0b') + '20',
                        color:      (m.status === 'atingida' ? '#10b981' : m.status === 'nao_atingida' ? '#ef4444' : '#f59e0b') }}>
                        {m.status === 'atingida' ? 'Atingida' : m.status === 'nao_atingida' ? 'Não atingida' : 'Em andamento'}
                      </span>
                    </div>

                    {/* quick value update */}
                    {can('planejamento', 'edit') && m.status === 'em_andamento' && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <input type="number" defaultValue={m.valor_atual} min={0}
                          onBlur={async e => {
                            const v = +e.target.value
                            if (v !== m.valor_atual) {
                              const newStatus = v >= m.meta_valor ? 'atingida' : 'em_andamento'
                              await updatePlanejamentoMeta(m.id, { valor_atual: v, status: newStatus })
                              await load()
                            }
                          }}
                          style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12 }} />
                        <span style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>Atualizar valor</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Side panel: evento detail ══ */}
      {selEv && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: 'var(--card-bg)', borderLeft: '1px solid var(--border)', zIndex: 900, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(() => {
            const ti = TIPOS[selEv.tipo]
            const st = STATUS_EV[selEv.status]
            const pr = PRIORIDADES[selEv.prioridade]
            return (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ fontSize: 30 }}>{ti.emoji}</div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{selEv.titulo}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{ti.label}</p>
                  </div>
                </div>
                <button onClick={() => setSelEv(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ padding: '3px 10px', borderRadius: 8, background: st.color + '20', color: st.color, fontWeight: 700, fontSize: 12 }}>{st.label}</span>
                <span style={{ padding: '3px 10px', borderRadius: 8, background: pr.color + '20', color: pr.color, fontWeight: 700, fontSize: 12 }}><Flag size={10} style={{ marginRight: 4 }} />{pr.label}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Data',       val: new Date(selEv.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) },
                  { label: 'Horário',    val: selEv.dia_todo ? 'Dia todo' : `${selEv.hora_inicio?.slice(0,5) || '—'}${selEv.hora_fim ? ` – ${selEv.hora_fim.slice(0,5)}` : ''}` },
                  { label: 'Setor',      val: selEv.setor || 'Geral' },
                  { label: 'Responsável', val: selEv.responsavel || '—' },
                ].map(r => (
                  <div key={r.label} style={{ background: 'var(--bg-secondary,#f8f9fa)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.val}</div>
                  </div>
                ))}
              </div>
              {selEv.descricao && (
                <div style={{ background: 'var(--bg-secondary,#f8f9fa)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Descrição</div>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{selEv.descricao}</p>
                </div>
              )}
              {/* status change */}
              {can('planejamento', 'edit') && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Alterar status</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(['planejado', 'em_andamento', 'concluido', 'cancelado'] as PlanejamentoStatus[]).map(s => (
                      <button key={s} onClick={async () => { await updatePlanejamentoEvento(selEv.id, { status: s }); await load(); setSelEv({ ...selEv, status: s }) }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${selEv.status === s ? STATUS_EV[s].color : 'var(--border)'}`, background: selEv.status === s ? STATUS_EV[s].color + '20' : 'transparent', color: selEv.status === s ? STATUS_EV[s].color : 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        {STATUS_EV[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {can('planejamento', 'edit') && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setSelEv(null); openEditEv(selEv) }}
                    style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Edit2 size={13} /> Editar
                  </button>
                  {can('planejamento', 'delete') && (
                    <button onClick={() => removeEv(selEv.id)}
                      style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#ef444420', color: '#ef4444', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Trash2 size={13} /> Excluir
                    </button>
                  )}
                </div>
              )}
            </>)
          })()}
        </div>
      )}

      {/* ══ Modal: Novo/Editar Evento ══ */}
      {showEvModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowEvModal(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px #0004' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{editEv ? 'Editar Evento' : 'Novo Evento'}</h3>
              <button onClick={() => setShowEvModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* titulo */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Título *</label>
                <input value={evForm.titulo} onChange={e => setEvForm(p => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ex: Reunião de equipe semanal"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              {/* tipo / cor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tipo</label>
                  <select value={evForm.tipo} onChange={e => { const t = e.target.value as PlanejamentoTipo; setEvForm(p => ({ ...p, tipo: t, cor: TIPOS[t].cor })) }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cor</label>
                  <input type="color" value={evForm.cor} onChange={e => setEvForm(p => ({ ...p, cor: e.target.value }))}
                    style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                </div>
              </div>
              {/* data */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Data início *</label>
                  <input type="date" value={evForm.data_inicio} onChange={e => setEvForm(p => ({ ...p, data_inicio: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Data fim</label>
                  <input type="date" value={evForm.data_fim || ''} onChange={e => setEvForm(p => ({ ...p, data_fim: e.target.value || null }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              {/* horário / dia todo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={evForm.dia_todo} onChange={e => setEvForm(p => ({ ...p, dia_todo: e.target.checked }))} />
                  Dia todo
                </label>
              </div>
              {!evForm.dia_todo && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Hora início</label>
                    <input type="time" value={evForm.hora_inicio || ''} onChange={e => setEvForm(p => ({ ...p, hora_inicio: e.target.value || null }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Hora fim</label>
                    <input type="time" value={evForm.hora_fim || ''} onChange={e => setEvForm(p => ({ ...p, hora_fim: e.target.value || null }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}
              {/* setor / responsavel */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Setor</label>
                  <select value={evForm.setor || ''} onChange={e => setEvForm(p => ({ ...p, setor: e.target.value || null }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    <option value="">Todos</option>
                    {SETORES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Responsável</label>
                  <input value={evForm.responsavel || ''} onChange={e => setEvForm(p => ({ ...p, responsavel: e.target.value || null }))}
                    placeholder="Nome"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              {/* prioridade / status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Prioridade</label>
                  <select value={evForm.prioridade} onChange={e => setEvForm(p => ({ ...p, prioridade: e.target.value as PlanejamentoPrioridade }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Status</label>
                  <select value={evForm.status} onChange={e => setEvForm(p => ({ ...p, status: e.target.value as PlanejamentoStatus }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {Object.entries(STATUS_EV).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              {/* descricao */}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Descrição</label>
                <textarea value={evForm.descricao || ''} onChange={e => setEvForm(p => ({ ...p, descricao: e.target.value || null }))} rows={2}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, resize: 'none', boxSizing: 'border-box' }} />
              </div>
              {/* actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowEvModal(false)}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={saveEv} disabled={saving || !evForm.titulo.trim()}
                  style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Nova/Editar Meta ══ */}
      {showMetaModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowMetaModal(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px #0004' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{editMeta ? 'Editar Meta' : 'Nova Meta / Indicador'}</h3>
              <button onClick={() => setShowMetaModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Título *</label>
                <input value={metaForm.titulo} onChange={e => setMetaForm(p => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ex: Reduzir desperdício de enxoval"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Indicador *</label>
                <input value={metaForm.indicador} onChange={e => setMetaForm(p => ({ ...p, indicador: e.target.value }))}
                  placeholder="Ex: % de peças com avaria"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Meta</label>
                  <input type="number" min={0} value={metaForm.meta_valor} onChange={e => setMetaForm(p => ({ ...p, meta_valor: +e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Atual</label>
                  <input type="number" min={0} value={metaForm.valor_atual} onChange={e => setMetaForm(p => ({ ...p, valor_atual: +e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Unidade</label>
                  <input value={metaForm.unidade} onChange={e => setMetaForm(p => ({ ...p, unidade: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Setor</label>
                  <select value={metaForm.setor} onChange={e => setMetaForm(p => ({ ...p, setor: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {SETORES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Período (Mês)</label>
                  <input type="month" value={metaForm.periodo_ref} onChange={e => setMetaForm(p => ({ ...p, periodo_ref: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Status</label>
                <select value={metaForm.status} onChange={e => setMetaForm(p => ({ ...p, status: e.target.value as PlanejamentoMeta['status'] }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                  <option value="em_andamento">Em andamento</option>
                  <option value="atingida">Atingida</option>
                  <option value="nao_atingida">Não atingida</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowMetaModal(false)}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={saveMeta} disabled={saving || !metaForm.titulo.trim() || !metaForm.indicador.trim()}
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

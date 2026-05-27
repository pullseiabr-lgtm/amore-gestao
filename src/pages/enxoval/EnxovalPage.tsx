import { useState, useEffect, useMemo } from 'react'
import {
  Package, Plus, Search, ArrowDownCircle, ArrowUpCircle,
  RotateCcw, AlertTriangle, CheckCircle2, X,
  Layers, ClipboardList, BarChart2, Edit2, Trash2, Send,
  ThumbsUp, ThumbsDown, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchEnxovalItens, insertEnxovalItem, updateEnxovalItem, deleteEnxovalItem,
  fetchEnxovalMovimentacoes, insertEnxovalMovimentacao, updateEnxovalMovimentacao,
  insertActivityLog,
} from '../../lib/db'
import type { EnxovalItem, EnxovalMovimentacao, EnxovalMovTipo, EnxovalMovStatus } from '../../types/database'

/* ── helpers ─────────────────────────────────────────────── */
const CATEGORIAS = ['Cama', 'Mesa', 'Banho', 'Uniforme', 'Limpeza', 'Decoração', 'Cozinha', 'Geral']
const UNIDADES   = ['Unidade', 'Par', 'Conjunto', 'Peça', 'Jogo', 'Rolo', 'Pacote', 'Kit']
const SETORES    = ['Cozinha', 'Salão', 'Bar', 'Recepção', 'Limpeza', 'Estoque', 'Gestão']

type MovTipoInfo = { label: string; color: string; icon: React.ReactNode }
const MOV_TIPO: Record<EnxovalMovTipo, MovTipoInfo> = {
  solicitacao: { label: 'Solicitação',  color: '#3b82f6', icon: <Send     size={12} /> },
  saida:       { label: 'Saída',        color: '#f59e0b', icon: <ArrowUpCircle   size={12} /> },
  devolucao:   { label: 'Devolução',    color: '#10b981', icon: <RotateCcw size={12} /> },
  perda:       { label: 'Perda/Avaria', color: '#ef4444', icon: <AlertTriangle   size={12} /> },
  entrada:     { label: 'Entrada',      color: '#6366f1', icon: <ArrowDownCircle size={12} /> },
}

const STATUS_MOV: Record<EnxovalMovStatus, { label: string; color: string }> = {
  pendente:  { label: 'Pendente',  color: '#f59e0b' },
  aprovado:  { label: 'Aprovado',  color: '#3b82f6' },
  recusado:  { label: 'Recusado',  color: '#ef4444' },
  concluido: { label: 'Concluído', color: '#10b981' },
}

function estoqueStatus(item: EnxovalItem): { label: string; color: string } {
  if (item.estoque_atual === 0)                                         return { label: 'Zerado',    color: '#ef4444' }
  if (item.estoque_minimo > 0 && item.estoque_atual <= item.estoque_minimo) return { label: 'Crítico',   color: '#f97316' }
  if (item.estoque_minimo > 0 && item.estoque_atual <= item.estoque_minimo * 1.5) return { label: 'Atenção', color: '#f59e0b' }
  return { label: 'OK', color: '#10b981' }
}

function fmt(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/* ── blank forms ─────────────────────────────────────────── */
const BLANK_ITEM: Omit<EnxovalItem, 'id' | 'created_at' | 'updated_at'> = {
  loja: '', nome: '', categoria: 'Geral', unidade: 'Unidade',
  estoque_atual: 0, estoque_minimo: 0, ativo: true,
}
const BLANK_MOV: Partial<Omit<EnxovalMovimentacao, 'id' | 'created_at' | 'item'>> = {
  tipo: 'solicitacao', quantidade: 1, setor_destino: '', responsavel: '',
  status: 'pendente', avarias: 0, perdas: 0, divergencias: '', observacoes: '',
}

/* ══════════════════════════════════════════════════════════ */
export default function EnxovalPage() {
  const { user, can } = useAuth()
  const { loja }       = useLoja()

  const [tab, setTab]     = useState<'catalogo' | 'movimentacoes' | 'painel'>('catalogo')
  const [itens, setItens] = useState<EnxovalItem[]>([])
  const [movs,  setMovs]  = useState<EnxovalMovimentacao[]>([])
  const [loading, setLoading] = useState(false)

  // search / filter
  const [search, setSearch]       = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterTipo, setFilterTipo] = useState<EnxovalMovTipo | ''>('')
  const [filterStatus, setFilterStatus] = useState<EnxovalMovStatus | ''>('')

  // modals
  const [showItemModal, setShowItemModal] = useState(false)
  const [showMovModal,  setShowMovModal]  = useState(false)
  const [editItem, setEditItem]           = useState<EnxovalItem | null>(null)
  const [selItem, setSelItem]             = useState<EnxovalItem | null>(null)
  const [selMov,  setSelMov]              = useState<EnxovalMovimentacao | null>(null)

  const [itemForm, setItemForm] = useState({ ...BLANK_ITEM })
  const [movForm,  setMovForm]  = useState({ ...BLANK_MOV, item_id: '' })
  const [saving, setSaving]     = useState(false)

  /* ── quick movement (always-visible buttons) ── */
  const quickMov = (tipo: EnxovalMovTipo) => {
    const ativos = itens.filter(i => i.ativo)
    if (ativos.length === 0) {
      setTab('catalogo')
      setEditItem(null)
      setItemForm({ ...BLANK_ITEM, loja })
      setShowItemModal(true)
      return
    }
    setMovForm({ ...BLANK_MOV, tipo, item_id: '', loja, created_by: user?.name || '' })
    setShowMovModal(true)
  }

  /* ── load ── */
  const load = async () => {
    if (!loja) return
    setLoading(true)
    const [i, m] = await Promise.all([fetchEnxovalItens(loja), fetchEnxovalMovimentacoes(loja)])
    setItens(i)
    setMovs(m)
    setLoading(false)
  }
  useEffect(() => { load() }, [loja])

  /* ── filtered lists ── */
  const filteredItens = useMemo(() => itens.filter(i => {
    if (!i.ativo) return false
    if (search    && !i.nome.toLowerCase().includes(search.toLowerCase())) return false
    if (filterCat && i.categoria !== filterCat) return false
    return true
  }), [itens, search, filterCat])

  const filteredMovs = useMemo(() => movs.filter(m => {
    if (filterTipo   && m.tipo   !== filterTipo)   return false
    if (filterStatus && m.status !== filterStatus) return false
    if (search && !(m.item?.nome || '').toLowerCase().includes(search.toLowerCase()) && !m.responsavel.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [movs, filterTipo, filterStatus, search])

  /* ── item CRUD ── */
  const openNewItem = () => {
    setEditItem(null)
    setItemForm({ ...BLANK_ITEM, loja })
    setShowItemModal(true)
  }
  const openEditItem = (item: EnxovalItem) => {
    setEditItem(item)
    setItemForm({ loja: item.loja, nome: item.nome, categoria: item.categoria, unidade: item.unidade, estoque_atual: item.estoque_atual, estoque_minimo: item.estoque_minimo, ativo: item.ativo })
    setShowItemModal(true)
  }
  const saveItem = async () => {
    if (!itemForm.nome.trim()) return
    setSaving(true)
    try {
      if (editItem) {
        await updateEnxovalItem(editItem.id, itemForm)
      } else {
        await insertEnxovalItem({ ...itemForm, loja })
      }
      setShowItemModal(false)
      await load()
    } finally { setSaving(false) }
  }
  const removeItem = async (id: string) => {
    if (!confirm('Excluir este item do catálogo?')) return
    await deleteEnxovalItem(id)
    await load()
  }

  /* ── movement CRUD ── */
  const openNewMov = (item?: EnxovalItem) => {
    setMovForm({ ...BLANK_MOV, item_id: item?.id || '', loja, created_by: user?.name || '' })
    setShowMovModal(true)
  }
  const saveMov = async () => {
    if (!movForm.item_id || !movForm.responsavel?.trim()) return
    setSaving(true)
    try {
      await insertEnxovalMovimentacao({
        loja,
        item_id:       movForm.item_id!,
        tipo:          movForm.tipo as EnxovalMovTipo,
        quantidade:    movForm.quantidade ?? 1,
        setor_destino: movForm.setor_destino || null,
        responsavel:   movForm.responsavel!,
        aprovado_por:  null,
        status:        'pendente',
        avarias:       movForm.avarias ?? 0,
        perdas:        movForm.perdas ?? 0,
        divergencias:  movForm.divergencias || null,
        observacoes:   movForm.observacoes || null,
        created_by:    user?.name || null,
      })
      const nomeItem = itens.find(i => i.id === movForm.item_id)?.nome || movForm.item_id
      insertActivityLog({ loja, usuario: user?.name || null, modulo: 'Enxoval', acao: MOV_TIPO[movForm.tipo as EnxovalMovTipo].label, entidade: 'enxoval_movimentacao', entidade_id: movForm.item_id || null, descricao: `${MOV_TIPO[movForm.tipo as EnxovalMovTipo].label} de ${movForm.quantidade} × ${nomeItem} por ${movForm.responsavel}` })
      setShowMovModal(false)
      await load()
    } finally { setSaving(false) }
  }

  /* ── approve/reject ── */
  const aprovar = async (mov: EnxovalMovimentacao) => {
    await updateEnxovalMovimentacao(mov.id, { status: 'aprovado', aprovado_por: user?.name || 'Gestão' })
    // if saida — debit stock
    if (mov.tipo === 'saida' || mov.tipo === 'solicitacao') {
      const item = itens.find(i => i.id === mov.item_id)
      if (item) await updateEnxovalItem(item.id, { estoque_atual: Math.max(0, item.estoque_atual - mov.quantidade) })
    }
    if (mov.tipo === 'devolucao' || mov.tipo === 'entrada') {
      const item = itens.find(i => i.id === mov.item_id)
      if (item) await updateEnxovalItem(item.id, { estoque_atual: item.estoque_atual + mov.quantidade })
    }
    insertActivityLog({ loja, usuario: user?.name || null, modulo: 'Enxoval', acao: 'aprovar', entidade: 'enxoval_movimentacao', entidade_id: mov.id, descricao: `Aprovada movimentação: ${MOV_TIPO[mov.tipo].label} × ${mov.quantidade} — ${mov.item?.nome || mov.item_id}` })
    await load()
    if (selMov?.id === mov.id) setSelMov(null)
  }
  const recusar = async (mov: EnxovalMovimentacao) => {
    await updateEnxovalMovimentacao(mov.id, { status: 'recusado' })
    insertActivityLog({ loja, usuario: user?.name || null, modulo: 'Enxoval', acao: 'recusar', entidade: 'enxoval_movimentacao', entidade_id: mov.id, descricao: `Recusada movimentação: ${MOV_TIPO[mov.tipo].label} × ${mov.quantidade} — ${mov.item?.nome || mov.item_id}` })
    await load()
    if (selMov?.id === mov.id) setSelMov(null)
  }

  /* ── painel stats ── */
  const statsItens = useMemo(() => ({
    total:    itens.filter(i => i.ativo).length,
    criticos: itens.filter(i => i.ativo && i.estoque_atual <= i.estoque_minimo && i.estoque_minimo > 0).length,
    zerados:  itens.filter(i => i.ativo && i.estoque_atual === 0).length,
    ok:       itens.filter(i => i.ativo && (i.estoque_minimo === 0 || i.estoque_atual > i.estoque_minimo)).length,
  }), [itens])

  const pendentes  = movs.filter(m => m.status === 'pendente').length
  const totalPerda = movs.filter(m => m.tipo === 'perda').reduce((a, m) => a + m.perdas, 0)

  /* ══════════ RENDER ══════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['catalogo', 'movimentacoes', 'painel'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                background: tab === t ? 'var(--primary)' : 'var(--card-bg)', color: tab === t ? '#fff' : 'var(--text-secondary)' }}>
              {t === 'catalogo' ? '📦 Catálogo' : t === 'movimentacoes' ? '📋 Movimentações' : '📊 Painel'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={load} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={14} />
          </button>
          {/* ── Botões de movimentação sempre visíveis ── */}
          {can('enxoval', 'create') && (<>
            <button onClick={() => quickMov('entrada')}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#6366f125', color: '#6366f1', cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              📥 Entrada
            </button>
            <button onClick={() => quickMov('saida')}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#f59e0b25', color: '#d97706', cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              📤 Saída
            </button>
            <button onClick={() => quickMov('devolucao')}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#10b98125', color: '#059669', cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              ↩ Devolução
            </button>
            <button onClick={() => quickMov('perda')}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#ef444425', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              ⚠ Perda
            </button>
          </>)}
          {tab === 'catalogo' && can('enxoval', 'create') && (
            <button onClick={openNewItem}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Plus size={14} /> Novo Item
            </button>
          )}
        </div>
      </div>

      {/* Search / Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
            style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        {tab === 'catalogo' && (
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: 13 }}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
        )}
        {tab === 'movimentacoes' && (<>
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value as EnxovalMovTipo | '')}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: 13 }}>
            <option value="">Todos os tipos</option>
            {Object.entries(MOV_TIPO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as EnxovalMovStatus | '')}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: 13 }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_MOV).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </>)}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>
      )}

      {/* ── TAB: Catálogo ── */}
      {!loading && tab === 'catalogo' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filteredItens.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
              <Package size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p>Nenhum item no catálogo</p>
            </div>
          )}
          {filteredItens.map(item => {
            const st = estoqueStatus(item)
            const pct = item.estoque_minimo > 0 ? Math.min(100, (item.estoque_atual / (item.estoque_minimo * 2)) * 100) : 100
            return (
              <div key={item.id} onClick={() => setSelItem(item)}
                style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 16, border: `1px solid ${selItem?.id === item.id ? 'var(--primary)' : 'var(--border)'}`, cursor: 'pointer', transition: 'border-color .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>{item.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.categoria} · {item.unidade}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: st.color + '20', color: st.color }}>{st.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: st.color }}>{item.estoque_atual}</div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)' }}>
                    <div>Mínimo: {item.estoque_minimo}</div>
                    <div>{item.unidade}</div>
                  </div>
                </div>
                <div style={{ height: 4, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: st.color, width: `${pct}%`, transition: 'width .3s' }} />
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={e => { e.stopPropagation(); openNewMov(item) }}
                    style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                    + Movimentação
                  </button>
                  {can('enxoval', 'edit') && (
                    <button onClick={e => { e.stopPropagation(); openEditItem(item) }}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <Edit2 size={12} />
                    </button>
                  )}
                  {can('enxoval', 'delete') && (
                    <button onClick={e => { e.stopPropagation(); removeItem(item.id) }}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ef444430', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── TAB: Movimentações ── */}
      {!loading && tab === 'movimentacoes' && (
        <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {itens.filter(i => i.ativo).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
              <Package size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Catálogo vazio</p>
              <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>Antes de registrar movimentações, cadastre os itens de enxoval</p>
              {can('enxoval', 'create') && (
                <button onClick={() => { setTab('catalogo'); openNewItem() }}
                  style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  📦 Ir para Catálogo e Cadastrar
                </button>
              )}
            </div>
          ) : filteredMovs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
              <ClipboardList size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p>Nenhuma movimentação encontrada</p>
              {can('enxoval', 'create') && (
                <p style={{ fontSize: 12, marginTop: 8 }}>Use os botões <strong>📥 Entrada</strong>, <strong>📤 Saída</strong> ou <strong>↩ Devolução</strong> no topo para registrar</p>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Tipo', 'Item', 'Qtd', 'Setor', 'Responsável', 'Status', 'Data', 'Ações'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMovs.map(m => {
                  const ti = MOV_TIPO[m.tipo]
                  const st = STATUS_MOV[m.status]
                  return (
                    <tr key={m.id} onClick={() => setSelMov(m)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selMov?.id === m.id ? 'var(--primary-light,#eef2ff)' : 'transparent' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: ti.color + '20', color: ti.color, fontWeight: 600, fontSize: 11 }}>
                          {ti.icon} {ti.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.item?.nome || m.item_id}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>{m.quantidade}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{m.setor_destino || '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{m.responsavel}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 6, background: st.color + '20', color: st.color, fontWeight: 600, fontSize: 11 }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap' }}>{fmt(m.created_at)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {m.status === 'pendente' && can('enxoval', 'edit') && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={e => { e.stopPropagation(); aprovar(m) }}
                              title="Aprovar"
                              style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#10b98120', color: '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <ThumbsUp size={12} />
                            </button>
                            <button onClick={e => { e.stopPropagation(); recusar(m) }}
                              title="Recusar"
                              style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#ef444420', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <ThumbsDown size={12} />
                            </button>
                          </div>
                        )}
                        {m.status !== 'pendente' && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.aprovado_por || '—'}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB: Painel ── */}
      {!loading && tab === 'painel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Total de Itens', value: statsItens.total,   color: '#6366f1', icon: <Layers size={18} /> },
              { label: 'Status OK',      value: statsItens.ok,      color: '#10b981', icon: <CheckCircle2 size={18} /> },
              { label: 'Estoque Crítico',value: statsItens.criticos, color: '#f97316', icon: <AlertTriangle size={18} /> },
              { label: 'Zerados',        value: statsItens.zerados,  color: '#ef4444', icon: <Package size={18} /> },
              { label: 'Mov. Pendentes', value: pendentes,           color: '#f59e0b', icon: <ClipboardList size={18} /> },
              { label: 'Total de Perdas',value: totalPerda,          color: '#ef4444', icon: <AlertTriangle size={18} /> },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--card-bg)', borderRadius: 12, padding: '16px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: k.color }}>{k.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Itens críticos */}
          {itens.filter(i => i.ativo && estoqueStatus(i).label !== 'OK').length > 0 && (
            <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#f97316' }}>
                <AlertTriangle size={16} /> Itens que precisam de atenção
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {itens.filter(i => i.ativo && estoqueStatus(i).label !== 'OK').map(item => {
                  const st = estoqueStatus(item)
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: st.color + '10', border: `1px solid ${st.color}30` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{item.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.categoria} · mínimo: {item.estoque_minimo}</div>
                      </div>
                      <span style={{ fontSize: 22, fontWeight: 800, color: st.color, minWidth: 40, textAlign: 'right' }}>{item.estoque_atual}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: st.color + '20', color: st.color }}>{st.label}</span>
                      <button onClick={() => openNewMov(item)}
                        style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        + Entrada
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Ranking consumo por categoria */}
          <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={16} /> Saídas por Categoria (últimas 300 movs.)
            </div>
            <div style={{ padding: 16 }}>
              {(() => {
                const byCat: Record<string, number> = {}
                movs.filter(m => m.tipo === 'saida' || m.tipo === 'solicitacao').forEach(m => {
                  const cat = m.item?.categoria || 'Geral'
                  byCat[cat] = (byCat[cat] || 0) + m.quantidade
                })
                const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1])
                const max = sorted[0]?.[1] || 1
                return sorted.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>Sem saídas registradas</p>
                ) : sorted.map(([cat, qty]) => (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 90, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>{cat}</div>
                    <div style={{ flex: 1, height: 20, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--primary)', borderRadius: 4, width: `${(qty / max) * 100}%`, transition: 'width .4s' }} />
                    </div>
                    <div style={{ width: 36, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{qty}</div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Novo/Editar Item ══ */}
      {showItemModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowItemModal(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px #0004' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{editItem ? 'Editar Item' : 'Novo Item de Enxoval'}</h3>
              <button onClick={() => setShowItemModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Nome do Item *</label>
                <input value={itemForm.nome} onChange={e => setItemForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Toalha de mesa branca"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Categoria</label>
                  <select value={itemForm.categoria} onChange={e => setItemForm(p => ({ ...p, categoria: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Unidade</label>
                  <select value={itemForm.unidade} onChange={e => setItemForm(p => ({ ...p, unidade: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {UNIDADES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Estoque Atual</label>
                  <input type="number" min={0} value={itemForm.estoque_atual} onChange={e => setItemForm(p => ({ ...p, estoque_atual: +e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Estoque Mínimo</label>
                  <input type="number" min={0} value={itemForm.estoque_minimo} onChange={e => setItemForm(p => ({ ...p, estoque_minimo: +e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowItemModal(false)}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={saveItem} disabled={saving || !itemForm.nome.trim()}
                  style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Nova Movimentação ══ */}
      {showMovModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowMovModal(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, boxShadow: '0 20px 60px #0004' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Registrar Movimentação</h3>
              <button onClick={() => setShowMovModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Item *</label>
                <select value={movForm.item_id} onChange={e => setMovForm(p => ({ ...p, item_id: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                  <option value="">Selecionar item...</option>
                  {itens.filter(i => i.ativo).map(i => <option key={i.id} value={i.id}>{i.nome} (estoque: {i.estoque_atual})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Tipo *</label>
                  <select value={movForm.tipo} onChange={e => setMovForm(p => ({ ...p, tipo: e.target.value as EnxovalMovTipo }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {Object.entries(MOV_TIPO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Quantidade *</label>
                  <input type="number" min={1} value={movForm.quantidade ?? 1} onChange={e => setMovForm(p => ({ ...p, quantidade: +e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Setor Destino</label>
                  <select value={movForm.setor_destino || ''} onChange={e => setMovForm(p => ({ ...p, setor_destino: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    <option value="">Selecionar...</option>
                    {SETORES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Responsável *</label>
                  <input value={movForm.responsavel || ''} onChange={e => setMovForm(p => ({ ...p, responsavel: e.target.value }))}
                    placeholder="Nome do responsável"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              {(movForm.tipo === 'devolucao' || movForm.tipo === 'perda') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Avarias</label>
                    <input type="number" min={0} value={movForm.avarias ?? 0} onChange={e => setMovForm(p => ({ ...p, avarias: +e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Perdas</label>
                    <input type="number" min={0} value={movForm.perdas ?? 0} onChange={e => setMovForm(p => ({ ...p, perdas: +e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Observações</label>
                <textarea value={movForm.observacoes || ''} onChange={e => setMovForm(p => ({ ...p, observacoes: e.target.value }))} rows={2}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, resize: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowMovModal(false)}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={saveMov} disabled={saving || !movForm.item_id || !movForm.responsavel?.trim()}
                  style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Salvando...' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Side Panel: Item detail ══ */}
      {selItem && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, background: 'var(--card-bg)', borderLeft: '1px solid var(--border)', zIndex: 900, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{selItem.nome}</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{selItem.categoria} · {selItem.unidade}</p>
            </div>
            <button onClick={() => setSelItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
          </div>
          {(() => {
            const st = estoqueStatus(selItem)
            return (
              <div style={{ background: st.color + '10', borderRadius: 10, padding: 16, textAlign: 'center', border: `1px solid ${st.color}30` }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: st.color }}>{selItem.estoque_atual}</div>
                <div style={{ fontSize: 12, color: st.color, fontWeight: 700 }}>{st.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Mínimo: {selItem.estoque_minimo}</div>
              </div>
            )
          })()}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>Últimas movimentações</div>
            {movs.filter(m => m.item_id === selItem.id).slice(0, 6).map(m => {
              const ti = MOV_TIPO[m.tipo]
              const st = STATUS_MOV[m.status]
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: ti.color }}>{ti.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{ti.label} · {m.quantidade} {selItem.unidade}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.responsavel} · {fmt(m.created_at)}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: st.color + '20', color: st.color }}>{st.label}</span>
                </div>
              )
            })}
            {movs.filter(m => m.item_id === selItem.id).length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0' }}>Nenhuma movimentação</p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => openNewMov(selItem)}
              style={{ padding: '10px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              + Nova Movimentação
            </button>
            {can('enxoval', 'edit') && (
              <button onClick={() => { setSelItem(null); openEditItem(selItem) }}
                style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>
                Editar Item
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══ Side Panel: Movement detail ══ */}
      {selMov && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, background: 'var(--card-bg)', borderLeft: '1px solid var(--border)', zIndex: 900, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Movimentação</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{fmt(selMov.created_at)}</p>
            </div>
            <button onClick={() => setSelMov(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
          </div>
          {(() => {
            const ti = MOV_TIPO[selMov.tipo]
            const st = STATUS_MOV[selMov.status]
            return (<>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ padding: '4px 12px', borderRadius: 8, background: ti.color + '20', color: ti.color, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>{ti.icon} {ti.label}</span>
                <span style={{ padding: '4px 12px', borderRadius: 8, background: st.color + '20', color: st.color, fontWeight: 700, fontSize: 13 }}>{st.label}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Item',        val: selMov.item?.nome || '—' },
                  { label: 'Quantidade',  val: `${selMov.quantidade} ${selMov.item?.unidade || ''}` },
                  { label: 'Setor',       val: selMov.setor_destino || '—' },
                  { label: 'Responsável', val: selMov.responsavel },
                  { label: 'Avarias',     val: selMov.avarias },
                  { label: 'Perdas',      val: selMov.perdas },
                  { label: 'Aprovado por', val: selMov.aprovado_por || '—' },
                ].map(r => (
                  <div key={r.label} style={{ background: 'var(--bg-secondary,#f8f9fa)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{String(r.val)}</div>
                  </div>
                ))}
              </div>
              {selMov.observacoes && (
                <div style={{ background: 'var(--bg-secondary,#f8f9fa)', borderRadius: 8, padding: '12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Observações</div>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>{selMov.observacoes}</p>
                </div>
              )}
              {selMov.status === 'pendente' && can('enxoval', 'edit') && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => aprovar(selMov)} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <ThumbsUp size={14} /> Aprovar
                  </button>
                  <button onClick={() => recusar(selMov)} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <ThumbsDown size={14} /> Recusar
                  </button>
                </div>
              )}
            </>)
          })()}
        </div>
      )}
    </div>
  )
}

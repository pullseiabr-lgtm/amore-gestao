import { useState, useEffect, useMemo } from 'react'
import {
  Plus, X, Edit2, Trash2, Search, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, ShoppingCart,
  ThumbsUp, RefreshCw, ChevronDown, ChevronRight,
  History,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchListasPadrao, insertListaPadrao, updateListaPadrao, deleteListaPadrao,
  insertListaPadraoItem, updateListaPadraoItem, deleteListaPadraoItem,
  fetchListaHistoricoPrecos, insertListaHistoricoPreco,
} from '../../lib/db'
import type {
  ListaPadrao, ListaPadraoItem, ListaHistoricoPreco,
  ListaPadraoStatus, ListaPadraoPeriodo,
} from '../../types/database'

/* ── constants ──────────────────────────────────────────── */
const STATUS_INFO: Record<ListaPadraoStatus, { label: string; color: string; next?: ListaPadraoStatus }> = {
  rascunho:   { label: 'Rascunho',     color: '#6b7280', next: 'revisao'   },
  revisao:    { label: 'Em revisão',   color: '#f59e0b', next: 'aprovada'  },
  aprovada:   { label: 'Aprovada',     color: '#10b981', next: 'em_compra' },
  em_compra:  { label: 'Em compra',    color: '#3b82f6', next: 'concluida' },
  concluida:  { label: 'Concluída',    color: '#6366f1'                    },
  cancelada:  { label: 'Cancelada',    color: '#ef4444'                    },
}

const PERIODOS: Record<ListaPadraoPeriodo, string> = {
  semanal:    'Semanal',
  quinzenal:  'Quinzenal',
  mensal:     'Mensal',
  avulso:     'Avulso',
}

const CATEGORIAS = ['Carnes', 'Bebidas', 'Laticínios', 'Hortifrúti', 'Secos/Grãos', 'Limpeza', 'Descartáveis', 'Temperos', 'Frios', 'Panificação', 'Geral']
const UNIDADES   = ['kg', 'g', 'L', 'ml', 'un', 'cx', 'pct', 'fardo', 'saco', 'lata', 'gal', 'par']

const ALERTA_PCT = 10 // alerta acima de 10% de variação

function calcVariacao(atual: number | null, referencia: number | null): number | null {
  if (!atual || !referencia || referencia === 0) return null
  return ((atual - referencia) / referencia) * 100
}

function fmtMoney(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function isoWeek(d = new Date()) {
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const dayOfYear = Math.ceil((+d - +new Date(d.getFullYear(), 0, 1)) / 86400000) + 1
  const wk = Math.ceil((dayOfYear + jan4.getDay()) / 7)
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`
}

type Tab = 'listas' | 'historico'

/* ══════════════════════════════════════════════════════════ */
export default function ListaPadraoPage() {
  const { user, can } = useAuth()
  const { loja }       = useLoja()

  const [tab, setTab]         = useState<Tab>('listas')
  const [listas, setListas]   = useState<ListaPadrao[]>([])
  const [historico, setHistorico] = useState<ListaHistoricoPreco[]>([])
  const [loading, setLoading] = useState(false)

  const [search, setSearch]           = useState('')
  const [filterStatus, setFilterStatus] = useState<ListaPadraoStatus | ''>('')
  const [histSearch, setHistSearch]   = useState('')
  const [expandId, setExpandId]       = useState<string | null>(null)

  // modals
  const [showListaModal, setShowListaModal] = useState(false)
  const [editLista, setEditLista]           = useState<ListaPadrao | null>(null)
  const [listaForm, setListaForm]           = useState({
    titulo: '', periodo: 'semanal' as ListaPadraoPeriodo,
    referencia: isoWeek(), observacoes: '',
  })

  // item form (inline)
  const [newItem, setNewItem] = useState({
    produto_nome: '', categoria: 'Geral', unidade: 'un',
    quantidade: 1, fornecedor: '', urgente: false, obs: '',
  })

  const [saving, setSaving] = useState(false)

  /* ── load ── */
  const load = async () => {
    if (!loja) return
    setLoading(true)
    const [ls, hs] = await Promise.all([fetchListasPadrao(loja), fetchListaHistoricoPrecos(loja)])
    setListas(ls)
    setHistorico(hs)
    setLoading(false)
  }
  useEffect(() => { load() }, [loja])

  /* ── price reference calc ── */
  const priceRef = useMemo(() => {
    const map: Record<string, { avg: number; min: number; max: number; count: number }> = {}
    historico.forEach(h => {
      const k = h.produto_nome.toLowerCase()
      if (!map[k]) map[k] = { avg: 0, min: Infinity, max: -Infinity, count: 0 }
      map[k].count++
      map[k].avg += h.preco
      map[k].min  = Math.min(map[k].min, h.preco)
      map[k].max  = Math.max(map[k].max, h.preco)
    })
    Object.values(map).forEach(v => { v.avg = v.avg / v.count })
    return map
  }, [historico])

  /* ── filtered lists ── */
  const filteredListas = useMemo(() => listas.filter(l => {
    if (search     && !l.titulo.toLowerCase().includes(search.toLowerCase())) return false
    if (filterStatus && l.status !== filterStatus) return false
    return true
  }), [listas, search, filterStatus])

  /* ── price history grouped ── */
  const histGrouped = useMemo(() => {
    const map: Record<string, ListaHistoricoPreco[]> = {}
    historico.forEach(h => {
      const k = h.produto_nome
      if (!map[k]) map[k] = []
      map[k].push(h)
    })
    return map
  }, [historico])

  const histFiltered = useMemo(() => {
    if (!histSearch) return Object.entries(histGrouped)
    return Object.entries(histGrouped).filter(([k]) => k.toLowerCase().includes(histSearch.toLowerCase()))
  }, [histGrouped, histSearch])

  /* ── lista CRUD ── */
  const openNew = () => {
    setEditLista(null)
    setListaForm({ titulo: '', periodo: 'semanal', referencia: isoWeek(), observacoes: '' })
    setShowListaModal(true)
  }
  const openEdit = (l: ListaPadrao) => {
    setEditLista(l)
    setListaForm({ titulo: l.titulo, periodo: l.periodo, referencia: l.referencia, observacoes: l.observacoes || '' })
    setShowListaModal(true)
  }
  const saveLista = async () => {
    if (!listaForm.titulo.trim()) return
    setSaving(true)
    try {
      if (editLista) {
        await updateListaPadrao(editLista.id, { titulo: listaForm.titulo, periodo: listaForm.periodo, referencia: listaForm.referencia, observacoes: listaForm.observacoes || null })
      } else {
        await insertListaPadrao({
          loja, titulo: listaForm.titulo, periodo: listaForm.periodo, referencia: listaForm.referencia,
          status: 'rascunho', total_estimado: 0, total_real: 0, observacoes: listaForm.observacoes || null,
          criado_por: user?.name || null, aprovado_por: null, aprovado_at: null, obs_aprovacao: null,
        })
      }
      setShowListaModal(false)
      await load()
    } finally { setSaving(false) }
  }
  const removeLista = async (id: string) => {
    if (!confirm('Excluir esta lista? Todos os itens serão removidos.')) return
    await deleteListaPadrao(id)
    if (expandId === id) setExpandId(null)
    await load()
  }

  /* ── status flow ── */
  const avancarStatus = async (l: ListaPadrao) => {
    const next = STATUS_INFO[l.status].next
    if (!next) return
    const upd: Partial<ListaPadrao> = { status: next }
    if (next === 'aprovada') {
      upd.aprovado_por = user?.name || 'Gestão'
      upd.aprovado_at  = new Date().toISOString()
    }
    await updateListaPadrao(l.id, upd)
    await load()
  }
  const cancelarLista = async (id: string) => {
    if (!confirm('Cancelar esta lista?')) return
    await updateListaPadrao(id, { status: 'cancelada' })
    await load()
  }

  /* ── item CRUD ── */
  const addItem = async (listaId: string) => {
    if (!newItem.produto_nome.trim()) return
    const ref = priceRef[newItem.produto_nome.toLowerCase()]
    const precoRef = ref ? ref.avg : null
    setSaving(true)
    try {
      await insertListaPadraoItem({
        loja,
        lista_id:          listaId,
        produto_nome:      newItem.produto_nome.trim(),
        categoria:         newItem.categoria,
        unidade:           newItem.unidade,
        quantidade:        newItem.quantidade,
        preco_referencia:  precoRef,
        preco_digitado:    null,
        preco_minimo:      ref ? ref.min : null,
        preco_maximo:      ref ? ref.max : null,
        variacao_pct:      null,
        alerta_preco:      false,
        fornecedor:        newItem.fornecedor || null,
        urgente:           newItem.urgente,
        comprado:          false,
        obs:               newItem.obs || null,
      })
      setNewItem({ produto_nome: '', categoria: 'Geral', unidade: 'un', quantidade: 1, fornecedor: '', urgente: false, obs: '' })
      await load()
    } finally { setSaving(false) }
  }

  const updatePreco = async (item: ListaPadraoItem, preco: number, lista: ListaPadrao) => {
    const vari = calcVariacao(preco, item.preco_referencia)
    const alerta = vari !== null && Math.abs(vari) > ALERTA_PCT
    await updateListaPadraoItem(item.id, { preco_digitado: preco, variacao_pct: vari, alerta_preco: alerta })
    // save to price history
    await insertListaHistoricoPreco({
      loja, produto_nome: item.produto_nome, unidade: item.unidade,
      preco, fornecedor: item.fornecedor, lista_id: lista.id, referencia: lista.referencia,
    })
    // update lista total_real
    const lista_ = listas.find(l => l.id === lista.id)
    if (lista_) {
      const itens = lista_.itens || []
      const total = itens.reduce((acc, it) => {
        const p = it.id === item.id ? preco : (it.preco_digitado ?? 0)
        return acc + p * it.quantidade
      }, 0)
      await updateListaPadrao(lista.id, { total_real: total })
    }
    await load()
  }

  const toggleComprado = async (item: ListaPadraoItem) => {
    await updateListaPadraoItem(item.id, { comprado: !item.comprado })
    await load()
  }

  const removeItem = async (id: string) => {
    await deleteListaPadraoItem(id)
    await load()
  }

  /* ── stats ── */
  const stats = useMemo(() => {
    const ativas = listas.filter(l => !['cancelada', 'concluida'].includes(l.status))
    const todasItens = listas.flatMap(l => l.itens || [])
    return {
      total:     listas.length,
      ativas:    ativas.length,
      alertas:   todasItens.filter(i => i.alerta_preco).length,
      produtos:  Object.keys(priceRef).length,
    }
  }, [listas, priceRef])

  /* ════════════════ RENDER ════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['listas', 'historico'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                background: tab === t ? 'var(--primary)' : 'var(--card-bg)', color: tab === t ? '#fff' : 'var(--text-secondary)' }}>
              {t === 'listas' ? '🛒 Listas de Compra' : '📊 Histórico de Preços'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <RefreshCw size={14} />
          </button>
          {tab === 'listas' && can('lista-padrao', 'create') && (
            <button onClick={openNew}
              style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nova Lista
            </button>
          )}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
        {[
          { label: 'Total de listas',  value: stats.total,    color: '#6366f1', icon: <ShoppingCart size={16} /> },
          { label: 'Listas ativas',    value: stats.ativas,   color: '#10b981', icon: <CheckCircle2 size={16} /> },
          { label: 'Alertas de preço', value: stats.alertas,  color: '#ef4444', icon: <AlertTriangle size={16} /> },
          { label: 'Produtos no hist.',value: stats.produtos,  color: '#f59e0b', icon: <History size={16} />      },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--card-bg)', borderRadius: 10, padding: '12px 16px', border: '1px solid var(--border)' }}>
            <div style={{ color: k.color, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ══ TAB: Listas ══ */}
      {tab === 'listas' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lista..."
                style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ListaPadraoStatus | '')}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: 13 }}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredListas.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                <ShoppingCart size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                <p>Nenhuma lista encontrada</p>
              </div>
            )}
            {filteredListas.map(lista => {
              const st = STATUS_INFO[lista.status]
              const isOpen = expandId === lista.id
              const itens = lista.itens || []
              const itensComprados = itens.filter(i => i.comprado).length
              const itensAlerta    = itens.filter(i => i.alerta_preco).length
              const pct = itens.length > 0 ? Math.round((itensComprados / itens.length) * 100) : 0
              const totalEst = itens.reduce((a, i) => a + (i.preco_referencia ?? 0) * i.quantidade, 0)
              const totalReal = itens.reduce((a, i) => a + (i.preco_digitado ?? 0) * i.quantidade, 0)

              return (
                <div key={lista.id} style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`, overflow: 'hidden' }}>
                  {/* header row */}
                  <div onClick={() => setExpandId(isOpen ? null : lista.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, lineHeight: 1 }}>
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                        {lista.titulo}
                        {itensAlerta > 0 && <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 4, background: '#ef444420', color: '#ef4444', fontSize: 10, fontWeight: 800 }}>⚠️ {itensAlerta} alerta</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {PERIODOS[lista.periodo]} · {lista.referencia} · {itens.length} itens
                        {lista.aprovado_por && ` · ✅ Aprovada por ${lista.aprovado_por}`}
                      </div>
                    </div>
                    {/* progress bar */}
                    {itens.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: '#10b981', width: `${pct}%`, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 32 }}>{pct}%</span>
                      </div>
                    )}
                    {/* totals */}
                    <div style={{ textAlign: 'right', minWidth: 110 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtMoney(totalReal || totalEst)}</div>
                      {totalReal > 0 && totalEst > 0 && (
                        <div style={{ fontSize: 10, color: totalReal > totalEst ? '#ef4444' : '#10b981' }}>
                          {totalReal > totalEst ? '▲' : '▼'} {fmtMoney(Math.abs(totalReal - totalEst))} vs ref.
                        </div>
                      )}
                    </div>
                    <span style={{ padding: '3px 8px', borderRadius: 6, background: st.color + '20', color: st.color, fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>{st.label}</span>
                  </div>

                  {/* expanded body */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary,#f9fafb)' }}>

                      {/* items table */}
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              {['✓', 'Produto', 'Cat.', 'Qtd', 'Un.', 'Ref.', 'Digitado', 'Var.%', 'Fornecedor', ''].map(h => (
                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {itens.map(item => {
                              const varPct = item.variacao_pct
                              const varColor = varPct == null ? 'var(--text-secondary)' : Math.abs(varPct) > ALERTA_PCT ? '#ef4444' : varPct > 0 ? '#f59e0b' : '#10b981'
                              return (
                                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: item.alerta_preco ? '#ef444408' : item.comprado ? '#10b98108' : 'transparent', opacity: item.comprado ? 0.6 : 1 }}>
                                  <td style={{ padding: '8px 10px' }}>
                                    <input type="checkbox" checked={item.comprado} onChange={() => toggleComprado(item)} style={{ cursor: 'pointer' }} />
                                  </td>
                                  <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                    {item.urgente && <span style={{ color: '#ef4444', marginRight: 4 }}>🔴</span>}
                                    {item.produto_nome}
                                  </td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{item.categoria}</td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{item.quantidade}</td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{item.unidade}</td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                    {fmtMoney(item.preco_referencia)}
                                    {item.preco_minimo != null && item.preco_maximo != null && (
                                      <div style={{ fontSize: 10, opacity: 0.7 }}>{fmtMoney(item.preco_minimo)} – {fmtMoney(item.preco_maximo)}</div>
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 10px' }}>
                                    {can('lista-padrao', 'edit') && lista.status !== 'concluida' && lista.status !== 'cancelada' ? (
                                      <input
                                        type="number" min={0} step={0.01}
                                        defaultValue={item.preco_digitado ?? ''}
                                        placeholder="R$ 0,00"
                                        onBlur={async e => {
                                          const v = parseFloat(e.target.value)
                                          if (!isNaN(v) && v > 0 && v !== item.preco_digitado) await updatePreco(item, v, lista)
                                        }}
                                        style={{ width: 80, padding: '4px 6px', borderRadius: 6, border: `1px solid ${item.alerta_preco ? '#ef4444' : 'var(--border)'}`, background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12 }}
                                      />
                                    ) : (
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmtMoney(item.preco_digitado)}</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 10px' }}>
                                    {varPct != null && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: varColor, fontWeight: 700 }}>
                                        {varPct > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        {varPct > 0 ? '+' : ''}{varPct.toFixed(1)}%
                                        {Math.abs(varPct) > ALERTA_PCT && <AlertTriangle size={12} />}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{item.fornecedor || '—'}</td>
                                  <td style={{ padding: '8px 10px' }}>
                                    {can('lista-padrao', 'delete') && (
                                      <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}><X size={12} /></button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                            {itens.length === 0 && (
                              <tr><td colSpan={10} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>Nenhum item adicionado</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* add item row */}
                      {can('lista-padrao', 'edit') && lista.status !== 'concluida' && lista.status !== 'cancelada' && (
                        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <div style={{ position: 'relative', flex: 2, minWidth: 160 }}>
                            <input value={newItem.produto_nome} onChange={e => setNewItem(p => ({ ...p, produto_nome: e.target.value }))}
                              placeholder="Produto *"
                              list={`produtos-hint-${lista.id}`}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12, boxSizing: 'border-box' }} />
                            <datalist id={`produtos-hint-${lista.id}`}>
                              {Object.keys(priceRef).map(k => <option key={k} value={k} />)}
                            </datalist>
                          </div>
                          <select value={newItem.categoria} onChange={e => setNewItem(p => ({ ...p, categoria: e.target.value }))}
                            style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: 12 }}>
                            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                          </select>
                          <input type="number" min={0.01} step={0.01} value={newItem.quantidade} onChange={e => setNewItem(p => ({ ...p, quantidade: +e.target.value }))}
                            placeholder="Qtd" style={{ width: 60, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12 }} />
                          <select value={newItem.unidade} onChange={e => setNewItem(p => ({ ...p, unidade: e.target.value }))}
                            style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: 12 }}>
                            {UNIDADES.map(u => <option key={u}>{u}</option>)}
                          </select>
                          <input value={newItem.fornecedor} onChange={e => setNewItem(p => ({ ...p, fornecedor: e.target.value }))}
                            placeholder="Fornecedor"
                            style={{ flex: 1, minWidth: 100, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 12 }} />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={newItem.urgente} onChange={e => setNewItem(p => ({ ...p, urgente: e.target.checked }))} />
                            Urgente
                          </label>
                          <button onClick={() => addItem(lista.id)} disabled={saving || !newItem.produto_nome.trim()}
                            style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, opacity: saving ? 0.6 : 1 }}>
                            + Item
                          </button>
                        </div>
                      )}

                      {/* footer actions */}
                      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* totals */}
                        <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {totalEst > 0 && <span>Est.: <b style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalEst)}</b></span>}
                          {totalReal > 0 && <span style={{ marginLeft: 12 }}>Real: <b style={{ color: totalReal > totalEst ? '#ef4444' : '#10b981' }}>{fmtMoney(totalReal)}</b></span>}
                        </div>
                        {/* status actions */}
                        {can('lista-padrao', 'edit') && STATUS_INFO[lista.status].next && (
                          <button onClick={() => avancarStatus(lista)}
                            style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <ThumbsUp size={12} />
                            {lista.status === 'rascunho'   ? 'Enviar para revisão' :
                             lista.status === 'revisao'    ? 'Aprovar lista' :
                             lista.status === 'aprovada'   ? 'Iniciar compra' :
                             lista.status === 'em_compra'  ? 'Concluir compra' : ''}
                          </button>
                        )}
                        {can('lista-padrao', 'edit') && (
                          <button onClick={() => openEdit(lista)}
                            style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Edit2 size={12} /> Editar
                          </button>
                        )}
                        {can('lista-padrao', 'edit') && !['concluida', 'cancelada'].includes(lista.status) && (
                          <button onClick={() => cancelarLista(lista.id)}
                            style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#ef444418', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>
                            Cancelar
                          </button>
                        )}
                        {can('lista-padrao', 'delete') && (
                          <button onClick={() => removeLista(lista.id)}
                            style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#ef444418', color: '#ef4444', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
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
        </>
      )}

      {/* ══ TAB: Histórico de Preços ══ */}
      {tab === 'historico' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative', maxWidth: 360 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="Filtrar produto..."
              style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>

          {histFiltered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
              <History size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p>Nenhum histórico de preços ainda</p>
              <p style={{ fontSize: 12 }}>Preencha os preços nas listas para gerar o histórico</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
            {histFiltered.map(([produto, registros]) => {
              const sorted = [...registros].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              const precos = sorted.map(r => r.preco)
              const avg    = precos.reduce((a, b) => a + b, 0) / precos.length
              const min    = Math.min(...precos)
              const max    = Math.max(...precos)
              const ultimo = sorted[0]
              const penult = sorted[1]
              const tendencia = penult ? ultimo.preco - penult.preco : 0

              return (
                <div key={produto} style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{produto}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{registros.length} registro{registros.length !== 1 ? 's' : ''} · {ultimo.unidade}</div>
                    </div>
                    {tendencia !== 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: tendencia > 0 ? '#ef4444' : '#10b981' }}>
                        {tendencia > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {tendencia > 0 ? '+' : ''}{fmtMoney(tendencia)}
                      </div>
                    )}
                  </div>
                  {/* price stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                    {[
                      { label: 'Média',  value: avg, color: '#6366f1' },
                      { label: 'Mínimo', value: min, color: '#10b981' },
                      { label: 'Máximo', value: max, color: '#ef4444' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', background: s.color + '10', borderRadius: 8, padding: '6px 8px' }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{fmtMoney(s.value)}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* last 5 records */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {sorted.slice(0, 5).map((r, i) => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: i === 0 ? 700 : 400 }}>
                        <span>{new Date(r.created_at).toLocaleDateString('pt-BR')} {r.referencia ? `(${r.referencia})` : ''}</span>
                        <span style={{ color: i === 0 ? 'var(--primary)' : 'inherit' }}>{fmtMoney(r.preco)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══ Modal: Nova/Editar Lista ══ */}
      {showListaModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowListaModal(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px #0004' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{editLista ? 'Editar Lista' : 'Nova Lista de Compras'}</h3>
              <button onClick={() => setShowListaModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Título *</label>
                <input value={listaForm.titulo} onChange={e => setListaForm(p => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ex: Compras semanais — Semana 21"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Período</label>
                  <select value={listaForm.periodo} onChange={e => setListaForm(p => ({ ...p, periodo: e.target.value as ListaPadraoPeriodo }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {Object.entries(PERIODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Referência</label>
                  <input value={listaForm.referencia} onChange={e => setListaForm(p => ({ ...p, referencia: e.target.value }))}
                    placeholder="Ex: 2026-W21 ou 2026-05"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Observações</label>
                <textarea value={listaForm.observacoes} onChange={e => setListaForm(p => ({ ...p, observacoes: e.target.value }))} rows={2}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, resize: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowListaModal(false)}
                  style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={saveLista} disabled={saving || !listaForm.titulo.trim()}
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

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, Trash2, ChevronLeft, Loader, CheckCircle2,
  Circle, XCircle, ShoppingCart, ClipboardList, Calendar,
  Package, ChevronDown, Edit3, Check, X, Download,
  AlertTriangle, Building2, TrendingUp, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchComprasListas, insertComprasLista, updateComprasLista, deleteComprasLista,
  fetchComprasListaItens, insertComprasListaItem, updateComprasListaItem, deleteComprasListaItem,
  fetchItensComprasDashboard, fetchEstoqueProdutos,
} from '../../lib/db'
import type { ComprasLista, ComprasListaItem, ListaStatus, ListaItemStatus, EstoqueProduto } from '../../types/database'

// ── Constantes ───────────────────────────────────────────────

const CATEGORIAS = [
  'Açaí', 'Bebidas', 'Carnes', 'Condimentos', 'Descartáveis', 'Embalagens',
  'Frutas', 'Grãos', 'Higiene', 'Laticínios', 'Legumes', 'Limpeza',
  'Proteínas', 'Sorvetes', 'Temperos', 'Outros',
]

const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'fd', 'sc', 'lt', 'dz']

const STATUS_LISTA: Record<ListaStatus, { label: string; color: string; bg: string }> = {
  rascunho:    { label: 'Rascunho',    color: '#92400E', bg: '#FEF3C7' },
  em_andamento:{ label: 'Em andamento',color: '#1D4ED8', bg: '#DBEAFE' },
  concluido:   { label: 'Concluído',   color: 'var(--success)', bg: '#D1FAE5' },
  cancelado:   { label: 'Cancelado',   color: 'var(--danger)',  bg: '#FEE2E2' },
}

const STATUS_ITEM: Record<ListaItemStatus, { icon: React.ReactNode; color: string; label: string }> = {
  pendente: { icon: <Circle size={14} />,       color: 'var(--muted)',   label: 'Pendente' },
  comprado: { icon: <CheckCircle2 size={14} />, color: 'var(--success)', label: 'Comprado' },
  cancelado:{ icon: <XCircle size={14} />,      color: 'var(--danger)',  label: 'Cancelado'},
}

// ── Helpers ──────────────────────────────────────────────────

const fmtR$ = (v: number | null | undefined) =>
  v == null ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`

const fmtData = (d: string | null) => {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

function exportarCSV(lista: ComprasLista, itens: ComprasListaItem[]) {
  const toStr = (v: string | number | null | undefined) =>
    v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v).replace(/"/g, '""')}"`
  const header = 'Produto;Categoria;Quantidade;Unidade;Preço Est. (R$);Preço Real (R$);Fornecedor;Status'
  const rows = itens.map(i => [
    toStr(i.produto_nome),
    toStr(i.categoria),
    String(i.quantidade).replace('.', ','),
    toStr(i.unidade),
    toStr(i.preco_estimado),
    toStr(i.preco_real),
    toStr(i.fornecedor_nome),
    { comprado: 'Comprado', cancelado: 'Cancelado', pendente: 'Pendente' }[i.status],
  ].join(';'))
  const csv = '﻿' + [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `compras-${lista.titulo.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ── Badge de Status de Lista ─────────────────────────────────

function ListaBadge({ status }: { status: ListaStatus }) {
  const s = STATUS_LISTA[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  )
}

// ── Barra de progresso ───────────────────────────────────────

function ProgressBar({ comprados, total }: { comprados: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((comprados / total) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--bordo)', borderRadius: 99, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 40, color: pct === 100 ? 'var(--success)' : 'var(--text)' }}>
        {comprados}/{total}
      </span>
    </div>
  )
}

// ── Mini barra para gráficos ─────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', flex: 1, minWidth: 60 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .5s' }} />
    </div>
  )
}

// ── Formulário Nova Lista ────────────────────────────────────

function NovaListaForm({ loja, onSalvo, onCancelar, itensIniciais }: {
  loja: string
  onSalvo: (lista: ComprasLista) => void
  onCancelar: () => void
  itensIniciais?: { produto_nome: string; categoria: string | null; quantidade: number; unidade: string }[]
}) {
  const { user } = useAuth()
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (itensIniciais?.length) {
      setTitulo(`Reposição crítica — ${new Date().toLocaleDateString('pt-BR')}`)
    }
  }, [itensIniciais])

  const salvar = async () => {
    if (!titulo.trim()) { setErr('Título é obrigatório'); return }
    setSaving(true)
    try {
      const lista = await insertComprasLista({
        loja,
        titulo: titulo.trim(),
        data_compra: data || null,
        status: 'rascunho',
        total_estimado: 0,
        total_real: 0,
        observacoes: obs.trim() || null,
        created_by: user?.name || null,
      })
      // Se vieram itens pré-selecionados, insere automaticamente
      if (itensIniciais?.length) {
        await Promise.all(itensIniciais.map(item =>
          insertComprasListaItem({
            lista_id: lista.id,
            produto_nome: item.produto_nome,
            categoria: item.categoria,
            quantidade: item.quantidade,
            unidade: item.unidade,
            preco_estimado: null,
            preco_real: null,
            fornecedor_nome: null,
            status: 'pendente',
            observacoes: null,
          })
        ))
      }
      onSalvo(lista)
    } catch (e) { console.error(e); setErr('Erro ao salvar') }
    setSaving(false)
  }

  return (
    <div className="card" style={{ maxWidth: 560, padding: 28 }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800 }}>
        {itensIniciais?.length ? '🔄 Nova Lista — Reposição Automática' : '📋 Nova Lista de Compras'}
      </h3>

      {itensIniciais?.length && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FEF3C7', borderRadius: 8, fontSize: 12, color: '#92400E', fontWeight: 600 }}>
          <AlertTriangle size={12} style={{ display: 'inline', marginRight: 4 }} />
          {itensIniciais.length} produto(s) crítico(s) serão adicionados automaticamente.
        </div>
      )}

      <div className="fg" style={{ marginBottom: 14 }}>
        <label className="fl">Título da lista <span className="rq">*</span></label>
        <input
          className={`inp${err ? ' err' : ''}`}
          value={titulo}
          onChange={e => { setTitulo(e.target.value); setErr('') }}
          placeholder="Ex: Compras semana 20/05, Reposição urgente..."
          autoFocus
        />
        {err && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{err}</span>}
      </div>

      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="fg">
          <label className="fl">Data da compra</label>
          <input className="inp" type="date" value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      <div className="fg" style={{ marginBottom: 20 }}>
        <label className="fl">Observações</label>
        <textarea
          className="inp" rows={2}
          value={obs} onChange={e => setObs(e.target.value)}
          placeholder="Prioridades, fornecedores preferidos..."
          style={{ resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn bo" onClick={onCancelar}>Cancelar</button>
        <button className="btn bp" onClick={salvar} disabled={saving}>
          {saving ? <><Loader size={12} className="spin" /> Criando...</> : <><Plus size={12} /> Criar Lista</>}
        </button>
      </div>
    </div>
  )
}

// ── Linha de item inline ─────────────────────────────────────

function ItemRow({ item, onUpdate, onDelete, fornecedores }: {
  item: ComprasListaItem
  onUpdate: (id: string, patch: Partial<ComprasListaItem>) => void
  onDelete: (id: string) => void
  fornecedores: string[]
}) {
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({ ...item })
  const s = STATUS_ITEM[item.status]

  const salvar = () => {
    onUpdate(item.id, {
      produto_nome: form.produto_nome,
      categoria: form.categoria,
      quantidade: form.quantidade,
      unidade: form.unidade,
      preco_estimado: form.preco_estimado,
      preco_real: form.preco_real,
      fornecedor_nome: form.fornecedor_nome,
      observacoes: form.observacoes,
    })
    setEditando(false)
  }

  const ciclarStatus = () => {
    const prox: Record<ListaItemStatus, ListaItemStatus> = {
      pendente: 'comprado',
      comprado: 'cancelado',
      cancelado: 'pendente',
    }
    onUpdate(item.id, { status: prox[item.status] })
  }

  if (editando) {
    return (
      <tr style={{ background: 'var(--bordo-bg)' }}>
        <td>
          <button onClick={ciclarStatus} style={{ border: 'none', background: 'none', cursor: 'pointer', color: s.color, display: 'flex', alignItems: 'center' }}>
            {s.icon}
          </button>
        </td>
        <td>
          <input className="inp" style={{ minWidth: 160, fontSize: 12 }} value={form.produto_nome}
            onChange={e => setForm(f => ({ ...f, produto_nome: e.target.value }))} />
        </td>
        <td>
          <select className="sel" style={{ fontSize: 12 }} value={form.categoria ?? ''} onChange={e => setForm(f => ({ ...f, categoria: e.target.value || null }))}>
            <option value="">—</option>
            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
        </td>
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            <input className="inp" type="number" min={0} step={0.001} style={{ width: 70, fontSize: 12 }}
              value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: parseFloat(e.target.value) || 0 }))} />
            <select className="sel" style={{ fontSize: 12, width: 60 }} value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}>
              {UNIDADES.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </td>
        <td>
          <input className="inp" type="number" min={0} step={0.01} style={{ width: 90, fontSize: 12 }} placeholder="Estimado"
            value={form.preco_estimado ?? ''} onChange={e => setForm(f => ({ ...f, preco_estimado: parseFloat(e.target.value) || null }))} />
        </td>
        <td>
          <input className="inp" type="number" min={0} step={0.01} style={{ width: 90, fontSize: 12 }} placeholder="Real"
            value={form.preco_real ?? ''} onChange={e => setForm(f => ({ ...f, preco_real: parseFloat(e.target.value) || null }))} />
        </td>
        <td>
          <input className="inp" style={{ width: 120, fontSize: 12 }} list="forn-list"
            value={form.fornecedor_nome ?? ''} onChange={e => setForm(f => ({ ...f, fornecedor_nome: e.target.value || null }))} placeholder="Fornecedor" />
          <datalist id="forn-list">{fornecedores.map(f => <option key={f} value={f} />)}</datalist>
        </td>
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="ib" onClick={salvar} style={{ color: 'var(--success)' }}><Check size={13} /></button>
            <button className="ib" onClick={() => { setForm({ ...item }); setEditando(false) }}><X size={13} /></button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{
      opacity: item.status === 'cancelado' ? 0.5 : 1,
      textDecoration: item.status === 'cancelado' ? 'line-through' : 'none',
      background: item.status === 'comprado' ? '#F0FDF4' : undefined,
    }}>
      <td>
        <button onClick={ciclarStatus} title={`Status: ${s.label} — clique para mudar`}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: s.color, display: 'flex', alignItems: 'center', padding: 4 }}>
          {s.icon}
        </button>
      </td>
      <td>
        <strong style={{ fontSize: 12 }}>{item.produto_nome}</strong>
        {item.observacoes && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{item.observacoes}</div>}
      </td>
      <td>
        {item.categoria
          ? <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: 'var(--bordo-bg)', color: 'var(--bordo)', fontWeight: 600 }}>{item.categoria}</span>
          : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
      </td>
      <td style={{ fontSize: 12, fontWeight: 600 }}>{item.quantidade} {item.unidade}</td>
      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtR$(item.preco_estimado)}</td>
      <td style={{ fontSize: 12, fontWeight: item.preco_real ? 700 : 400, color: item.preco_real ? 'var(--text)' : 'var(--muted)' }}>
        {fmtR$(item.preco_real)}
      </td>
      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{item.fornecedor_nome || '—'}</td>
      <td>
        <div className="ab" style={{ gap: 4 }}>
          <button className="ib" onClick={() => setEditando(true)} title="Editar"><Edit3 size={12} /></button>
          <button className="ib rd" onClick={() => onDelete(item.id)} title="Remover"><Trash2 size={12} /></button>
        </div>
      </td>
    </tr>
  )
}

// ── Formulário rápido de adição de item ──────────────────────

function AddItemRow({ listaId, onAdd }: { listaId: string; onAdd: (item: ComprasListaItem) => void }) {
  const EMPTY = { produto_nome: '', categoria: '', quantidade: 1, unidade: 'un', preco_estimado: '', fornecedor_nome: '' }
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const adicionar = async () => {
    if (!form.produto_nome.trim()) return
    setSaving(true)
    try {
      const item = await insertComprasListaItem({
        lista_id: listaId,
        produto_nome: form.produto_nome.trim().toUpperCase(),
        categoria: form.categoria || null,
        quantidade: Number(form.quantidade) || 1,
        unidade: form.unidade,
        preco_estimado: form.preco_estimado ? Number(form.preco_estimado) : null,
        preco_real: null,
        fornecedor_nome: form.fornecedor_nome || null,
        status: 'pendente',
        observacoes: null,
      })
      onAdd(item)
      setForm(EMPTY)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  if (!open) {
    return (
      <tr>
        <td colSpan={8} style={{ padding: '8px 12px' }}>
          <button className="btn bo bsm" onClick={() => setOpen(true)}
            style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }}>
            <Plus size={11} /> Adicionar item
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ background: 'var(--bordo-bg)' }}>
      <td />
      <td>
        <input className="inp" style={{ minWidth: 160, fontSize: 12 }}
          value={form.produto_nome} onChange={e => setForm(f => ({ ...f, produto_nome: e.target.value }))}
          placeholder="Nome do produto *" autoFocus
          onKeyDown={e => e.key === 'Enter' && adicionar()} />
      </td>
      <td>
        <select className="sel" style={{ fontSize: 12 }} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
          <option value="">Categoria</option>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <input className="inp" type="number" min={0} step={0.001} style={{ width: 70, fontSize: 12 }}
            value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value as unknown as number }))} />
          <select className="sel" style={{ fontSize: 12, width: 60 }} value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}>
            {UNIDADES.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </td>
      <td>
        <input className="inp" type="number" min={0} step={0.01} style={{ width: 90, fontSize: 12 }} placeholder="R$ est."
          value={form.preco_estimado} onChange={e => setForm(f => ({ ...f, preco_estimado: e.target.value }))} />
      </td>
      <td />
      <td>
        <input className="inp" style={{ width: 120, fontSize: 12 }}
          value={form.fornecedor_nome} onChange={e => setForm(f => ({ ...f, fornecedor_nome: e.target.value }))} placeholder="Fornecedor" />
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="ib" onClick={adicionar} disabled={saving} style={{ color: 'var(--success)' }}>
            {saving ? <Loader size={12} className="spin" /> : <Check size={13} />}
          </button>
          <button className="ib" onClick={() => { setForm(EMPTY); setOpen(false) }}><X size={13} /></button>
        </div>
      </td>
    </tr>
  )
}

// ── Detalhe da Lista ─────────────────────────────────────────

function ListaDetalhe({ lista, onVoltar, onAtualizar }: {
  lista: ComprasLista
  onVoltar: () => void
  onAtualizar: (l: ComprasLista) => void
}) {
  const [itens, setItens] = useState<ComprasListaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<'todos' | ListaItemStatus>('todos')
  const [filtroCateg, setFiltroCateg] = useState('')
  const [editandoTitulo, setEditandoTitulo] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState(lista.titulo)
  const [mudandoStatus, setMudandoStatus] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItens(await fetchComprasListaItens(lista.id)) } catch {}
    setLoading(false)
  }, [lista.id])

  useEffect(() => { load() }, [load])

  const recalcularTotais = useCallback(async (itensAtuais: ComprasListaItem[]) => {
    const est  = itensAtuais.reduce((s, i) => s + (i.preco_estimado ?? 0) * i.quantidade, 0)
    const real = itensAtuais.filter(i => i.status === 'comprado').reduce((s, i) => s + (i.preco_real ?? i.preco_estimado ?? 0) * i.quantidade, 0)
    const atualizado = await updateComprasLista(lista.id, { total_estimado: est, total_real: real })
    onAtualizar(atualizado)
  }, [lista.id, onAtualizar])

  const handleUpdate = async (id: string, patch: Partial<ComprasListaItem>) => {
    try {
      const updated = await updateComprasListaItem(id, patch)
      const novosItens = itens.map(i => i.id === id ? updated : i)
      setItens(novosItens)
      await recalcularTotais(novosItens)
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteComprasListaItem(id)
      const novosItens = itens.filter(i => i.id !== id)
      setItens(novosItens)
      await recalcularTotais(novosItens)
    } catch (e) { console.error(e) }
  }

  const handleAdd = async (item: ComprasListaItem) => {
    const novosItens = [...itens, item]
    setItens(novosItens)
    await recalcularTotais(novosItens)
  }

  const salvarTitulo = async () => {
    if (!novoTitulo.trim()) return
    try {
      const atualizado = await updateComprasLista(lista.id, { titulo: novoTitulo.trim() })
      onAtualizar(atualizado)
    } catch {}
    setEditandoTitulo(false)
  }

  const mudarStatus = async (status: ListaStatus) => {
    setMudandoStatus(true)
    try {
      const atualizado = await updateComprasLista(lista.id, { status })
      onAtualizar(atualizado)
    } catch {}
    setMudandoStatus(false)
  }

  const comprados = itens.filter(i => i.status === 'comprado').length
  const pendentes  = itens.filter(i => i.status === 'pendente').length
  const cancelados = itens.filter(i => i.status === 'cancelado').length

  const filtrados = itens
    .filter(i => filtroStatus === 'todos' || i.status === filtroStatus)
    .filter(i => !filtroCateg || i.categoria === filtroCateg)

  const fornecedoresUsados = [...new Set(itens.map(i => i.fornecedor_nome).filter(Boolean) as string[])]

  const economia = lista.total_estimado > 0 && lista.total_real > 0
    ? lista.total_estimado - lista.total_real
    : null

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <button className="btn bo bsm" onClick={onVoltar}><ChevronLeft size={12} /> Listas</button>
        <div style={{ flex: 1 }}>
          {editandoTitulo ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="inp" style={{ fontSize: 18, fontWeight: 800, maxWidth: 400 }}
                value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && salvarTitulo()} autoFocus />
              <button className="ib" onClick={salvarTitulo} style={{ color: 'var(--success)' }}><Check size={14} /></button>
              <button className="ib" onClick={() => { setNovoTitulo(lista.titulo); setEditandoTitulo(false) }}><X size={14} /></button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{lista.titulo}</h2>
              <button className="ib" onClick={() => setEditandoTitulo(true)} title="Editar título"><Edit3 size={13} /></button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
            <ListaBadge status={lista.status} />
            {lista.data_compra && (
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={11} /> {fmtData(lista.data_compra)}
              </span>
            )}
            {lista.created_by && <span style={{ fontSize: 11, color: 'var(--muted)' }}>por {lista.created_by}</span>}
          </div>
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
          {/* Export dropdown */}
          <div style={{ position: 'relative' }}>
            <button className="btn bo bsm" onClick={() => setExportMenu(o => !o)}>
              <Download size={12} /> Exportar
            </button>
            {exportMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '110%', zIndex: 200,
                background: 'var(--sidebar)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.15)', minWidth: 160,
              }} onClick={() => setExportMenu(false)}>
                <button onClick={() => exportarCSV(lista, itens)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  <Download size={12} /> Exportar CSV
                </button>
                <button onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, borderTop: '1px solid var(--border)' }}>
                  🖨️ Imprimir
                </button>
              </div>
            )}
          </div>

          {/* Mudar status */}
          <select className="sel" value={lista.status} onChange={e => mudarStatus(e.target.value as ListaStatus)}
            disabled={mudandoStatus} style={{ fontSize: 12, fontWeight: 700 }}>
            {(Object.keys(STATUS_LISTA) as ListaStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LISTA[s].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs resumo */}
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Total Estimado</div>
          <div className="kpi-val">{fmtR$(lista.total_estimado)}</div>
          <div className="kpi-sub">{itens.length} itens</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--success)' }} />
          <div className="kpi-lbl">Total Real</div>
          <div className="kpi-val" style={{ color: lista.total_real > 0 ? 'var(--text)' : 'var(--muted)' }}>
            {lista.total_real > 0 ? fmtR$(lista.total_real) : '—'}
          </div>
          <div className="kpi-sub">{comprados} comprados</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: economia !== null && economia >= 0 ? 'var(--success)' : 'var(--warning)' }} />
          <div className="kpi-lbl">Economia</div>
          <div className="kpi-val" style={{ color: economia !== null ? (economia >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--muted)', fontSize: economia !== null ? 20 : 24 }}>
            {economia !== null ? (economia >= 0 ? `- ${fmtR$(economia)}` : `+ ${fmtR$(Math.abs(economia))}`) : '—'}
          </div>
          <div className="kpi-sub">{economia !== null ? (economia >= 0 ? 'vs estimado' : 'acima do est.') : 'vs estimado'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Pendentes</div>
          <div className="kpi-val" style={{ color: pendentes > 0 ? 'var(--warning)' : 'var(--muted)' }}>{pendentes}</div>
          <div className="kpi-sub">{cancelados} cancelados</div>
        </div>
      </div>

      {/* Progresso geral */}
      {itens.length > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Progresso da lista</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {Math.round((comprados / itens.length) * 100)}% concluído
            </span>
          </div>
          <ProgressBar comprados={comprados} total={itens.length} />
        </div>
      )}

      {/* Tabela de itens */}
      <div className="card">
        <div className="card-hd">
          <span className="card-tt"><Package size={14} style={{ display: 'inline', marginRight: 4 }} />Itens da lista</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="flt" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)}>
              <option value="todos">Todos os status</option>
              <option value="pendente">Pendentes</option>
              <option value="comprado">Comprados</option>
              <option value="cancelado">Cancelados</option>
            </select>
            <select className="flt" value={filtroCateg} onChange={e => setFiltroCateg(e.target.value)}>
              <option value="">Todas as categorias</option>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty"><Loader size={22} className="spin" /></div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Qtd</th>
                  <th>Preço est.</th>
                  <th>Preço real</th>
                  <th>Fornecedor</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>
                      Nenhum item encontrado
                    </td>
                  </tr>
                )}
                {filtrados.map(item => (
                  <ItemRow key={item.id} item={item} onUpdate={handleUpdate} onDelete={handleDelete} fornecedores={fornecedoresUsados} />
                ))}
                {filtroStatus === 'todos' && !filtroCateg && (
                  <AddItemRow listaId={lista.id} onAdd={handleAdd} />
                )}
              </tbody>
            </table>
          </div>
        )}

        {itens.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
            <span>{filtrados.length} de {itens.length} itens exibidos</span>
            <span>
              Estimado: <strong>{fmtR$(lista.total_estimado)}</strong>
              {lista.total_real > 0 && <> · Real: <strong style={{ color: 'var(--text)' }}>{fmtR$(lista.total_real)}</strong></>}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Dashboard de Compras ─────────────────────────────────────

interface TopItem { nome: string; count: number; qtdTotal: number }
interface TopFornec { nome: string; count: number; total: number }

function DashboardTab({ loja, listas, onCriarLista }: {
  loja: string
  listas: ComprasLista[]
  onCriarLista: (itens: { produto_nome: string; categoria: string | null; quantidade: number; unidade: string }[]) => void
}) {
  const [topItens, setTopItens] = useState<TopItem[]>([])
  const [topFornec, setTopFornec] = useState<TopFornec[]>([])
  const [criticos, setCriticos] = useState<EstoqueProduto[]>([])
  const [ruptura, setRuptura] = useState<EstoqueProduto[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [showCriticos, setShowCriticos] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [itensData, prodData] = await Promise.all([
        fetchItensComprasDashboard(loja),
        fetchEstoqueProdutos(loja),
      ])

      // Agrega top produtos
      const itemMap: Record<string, { count: number; qtdTotal: number }> = {}
      const fornMap: Record<string, { count: number; total: number }> = {}
      for (const item of itensData) {
        if (item.produto_nome) {
          if (!itemMap[item.produto_nome]) itemMap[item.produto_nome] = { count: 0, qtdTotal: 0 }
          itemMap[item.produto_nome].count++
          itemMap[item.produto_nome].qtdTotal += item.quantidade
        }
        if (item.fornecedor_nome) {
          if (!fornMap[item.fornecedor_nome]) fornMap[item.fornecedor_nome] = { count: 0, total: 0 }
          fornMap[item.fornecedor_nome].count++
          fornMap[item.fornecedor_nome].total += (item.preco_real ?? 0) * item.quantidade
        }
      }
      setTopItens(Object.entries(itemMap).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.count - a.count).slice(0, 10))
      setTopFornec(Object.entries(fornMap).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.total - a.total).slice(0, 5))

      // Alertas de estoque
      const rupt = prodData.filter(p => p.nivel_atual === 0 && p.nivel_minimo > 0)
      const crit = prodData.filter(p => p.nivel_atual > 0 && p.nivel_atual <= p.nivel_minimo && p.nivel_minimo > 0)
      setRuptura(rupt)
      setCriticos(crit)
      setSelecionados(new Set([...rupt.map(p => p.id), ...crit.map(p => p.id)]))
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  // KPIs das listas
  const totalGasto   = listas.filter(l => l.status === 'concluido').reduce((s, l) => s + l.total_real, 0)
  const totalEst     = listas.filter(l => l.status === 'concluido').reduce((s, l) => s + l.total_estimado, 0)
  const economia     = totalEst > 0 ? totalEst - totalGasto : null
  const ativas       = listas.filter(l => l.status === 'rascunho' || l.status === 'em_andamento').length
  const nFornec      = topFornec.length

  const maxItem  = topItens[0]?.count ?? 1
  const maxFornec = topFornec[0]?.total ?? 1

  const todosAlerta = [...ruptura, ...criticos]

  const criarListaAutomatica = () => {
    const selecionadosArr = todosAlerta.filter(p => selecionados.has(p.id))
    if (!selecionadosArr.length) return
    onCriarLista(selecionadosArr.map(p => ({
      produto_nome: p.nome,
      categoria: p.categoria || null,
      quantidade: Math.max(1, p.nivel_ideal - p.nivel_atual),
      unidade: p.gramatura || 'un',
    })))
  }

  if (loading) return <div className="empty"><Loader size={28} className="spin" /></div>

  return (
    <div>
      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Total Gasto (concluídas)</div>
          <div className="kpi-val" style={{ fontSize: totalGasto > 99999 ? 18 : 24 }}>{fmtR$(totalGasto)}</div>
          <div className="kpi-sub">{listas.filter(l => l.status === 'concluido').length} listas concluídas</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: economia !== null && economia >= 0 ? 'var(--success)' : 'var(--warning)' }} />
          <div className="kpi-lbl">Economia Gerada</div>
          <div className="kpi-val" style={{ color: economia !== null && economia >= 0 ? 'var(--success)' : 'var(--muted)' }}>
            {economia !== null ? fmtR$(Math.abs(economia)) : '—'}
          </div>
          <div className="kpi-sub">{economia !== null && economia >= 0 ? 'abaixo do estimado' : 'acima do estimado'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: ativas > 0 ? 'var(--warning)' : 'var(--muted)' }} />
          <div className="kpi-lbl">Listas Ativas</div>
          <div className="kpi-val" style={{ color: ativas > 0 ? 'var(--warning)' : 'var(--muted)' }}>{ativas}</div>
          <div className="kpi-sub">rascunho / em andamento</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Fornecedores Ativos</div>
          <div className="kpi-val">{nFornec}</div>
          <div className="kpi-sub">nos últimos registros</div>
        </div>
      </div>

      {/* Grid: Top Produtos + Top Fornecedores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Top Produtos */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt"><TrendingUp size={13} style={{ display:'inline', marginRight:4 }}/>Top Produtos Comprados</span>
          </div>
          {topItens.length === 0 ? (
            <div className="empty" style={{ padding: '24px 0', fontSize: 12 }}>Nenhum dado ainda</div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {topItens.map((item, i) => (
                <div key={item.nome} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 14px', borderBottom: i < topItens.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width:22, height:22, borderRadius:6, background:'var(--bordo-bg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'var(--bordo)', flexShrink:0 }}>
                    {i+1}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.nome}</div>
                    <MiniBar value={item.count} max={maxItem} color="var(--bordo)" />
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:12, fontWeight:700 }}>{item.count}×</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>qtd {item.qtdTotal}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Fornecedores */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt"><Building2 size={13} style={{ display:'inline', marginRight:4 }}/>Top Fornecedores</span>
          </div>
          {topFornec.length === 0 ? (
            <div className="empty" style={{ padding: '24px 0', fontSize: 12 }}>Nenhum dado ainda</div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {topFornec.map((forn, i) => (
                <div key={forn.nome} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom: i < topFornec.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:'var(--bordo-bg)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--bordo)', flexShrink:0 }}>
                    <Building2 size={13}/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{forn.nome}</div>
                    <MiniBar value={forn.total} max={maxFornec} color="var(--blue,#3B82F6)" />
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:11, fontWeight:700 }}>{fmtR$(forn.total)}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{forn.count} itens</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alertas de Reposição */}
      {todosAlerta.length > 0 && (
        <div className="card">
          <div className="card-hd">
            <span className="card-tt" style={{ display:'flex', alignItems:'center', gap:6 }}>
              <AlertTriangle size={13} style={{ color:'var(--warning)' }} />
              Alertas de Reposição — {todosAlerta.length} produto(s) crítico(s)
            </span>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn bo bsm" onClick={() => setShowCriticos(o => !o)}>
                {showCriticos ? 'Ocultar' : 'Exibir'} lista
              </button>
              <button
                className="btn bp bsm"
                disabled={selecionados.size === 0}
                onClick={criarListaAutomatica}
                style={{ display:'flex', alignItems:'center', gap:5 }}>
                <Plus size={11}/> Criar lista com selecionados ({selecionados.size})
              </button>
            </div>
          </div>

          {showCriticos && (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th style={{ width:36 }}></th>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th>Nível atual</th>
                    <th>Mínimo</th>
                    <th>Ideal</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {ruptura.map(p => (
                    <tr key={p.id} style={{ background:'#FEF2F2' }}>
                      <td>
                        <input type="checkbox" checked={selecionados.has(p.id)}
                          onChange={e => setSelecionados(prev => { const n = new Set(prev); e.target.checked ? n.add(p.id) : n.delete(p.id); return n })} />
                      </td>
                      <td><strong style={{ fontSize:12 }}>{p.nome}</strong><br/><span style={{ fontSize:10, color:'var(--muted)' }}>{p.gramatura}</span></td>
                      <td><span style={{ fontSize:10, padding:'2px 7px', borderRadius:12, background:'var(--bordo-bg)', color:'var(--bordo)', fontWeight:600 }}>{p.categoria}</span></td>
                      <td style={{ fontSize:12, fontWeight:800, color:'var(--danger)' }}>0</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{p.nivel_minimo}</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{p.nivel_ideal}</td>
                      <td><span style={{ fontSize:10, padding:'2px 8px', borderRadius:12, background:'#FEE2E2', color:'var(--danger)', fontWeight:700 }}>🔴 RUPTURA</span></td>
                    </tr>
                  ))}
                  {criticos.map(p => (
                    <tr key={p.id} style={{ background:'#FFFBEB' }}>
                      <td>
                        <input type="checkbox" checked={selecionados.has(p.id)}
                          onChange={e => setSelecionados(prev => { const n = new Set(prev); e.target.checked ? n.add(p.id) : n.delete(p.id); return n })} />
                      </td>
                      <td><strong style={{ fontSize:12 }}>{p.nome}</strong><br/><span style={{ fontSize:10, color:'var(--muted)' }}>{p.gramatura}</span></td>
                      <td><span style={{ fontSize:10, padding:'2px 7px', borderRadius:12, background:'var(--bordo-bg)', color:'var(--bordo)', fontWeight:600 }}>{p.categoria}</span></td>
                      <td style={{ fontSize:12, fontWeight:800, color:'var(--warning)' }}>{p.nivel_atual}</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{p.nivel_minimo}</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{p.nivel_ideal}</td>
                      <td><span style={{ fontSize:10, padding:'2px 8px', borderRadius:12, background:'#FEF3C7', color:'#92400E', fontWeight:700 }}>⚠️ CRÍTICO</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', fontSize:11, color:'var(--muted)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>Selecione os produtos e crie uma lista de reposição automática</span>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn bo bsm" onClick={() => setSelecionados(new Set(todosAlerta.map(p => p.id)))}>Marcar todos</button>
              <button className="btn bo bsm" onClick={() => setSelecionados(new Set())}>Desmarcar</button>
            </div>
          </div>
        </div>
      )}

      {todosAlerta.length === 0 && (
        <div className="card" style={{ padding:'24px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:'#D1FAE5', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Check size={20} style={{ color:'var(--success)' }}/>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>Estoque sem alertas críticos</div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Todos os produtos estão acima do nível mínimo.</div>
            </div>
          </div>
        </div>
      )}

      {/* Botão refresh */}
      <div style={{ display:'flex', justifyContent:'center', marginTop:16 }}>
        <button className="btn bo bsm" onClick={load}><RefreshCw size={11}/> Atualizar dados</button>
      </div>
    </div>
  )
}

// ── Linha de lista na tabela ─────────────────────────────────

function ListaRow({ lista, onClick, onDelete }: {
  lista: ComprasLista
  onClick: () => void
  onDelete: () => void
}) {
  const [itensCount, setItensCount] = useState<{ total: number; comprados: number } | null>(null)

  useEffect(() => {
    fetchComprasListaItens(lista.id)
      .then(itens => setItensCount({ total: itens.length, comprados: itens.filter(i => i.status === 'comprado').length }))
      .catch(() => setItensCount({ total: 0, comprados: 0 }))
  }, [lista.id])

  return (
    <tr style={{ cursor: 'pointer' }} onClick={onClick}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bordo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bordo)', flexShrink: 0 }}>
            <ClipboardList size={14} />
          </div>
          <div>
            <strong style={{ fontSize: 12 }}>{lista.titulo}</strong>
            {lista.created_by && <div style={{ fontSize: 10, color: 'var(--muted)' }}>por {lista.created_by}</div>}
          </div>
        </div>
      </td>
      <td style={{ fontSize: 11, color: 'var(--muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Calendar size={10} /> {fmtData(lista.data_compra)}
        </div>
      </td>
      <td><ListaBadge status={lista.status} /></td>
      <td style={{ minWidth: 140 }}>
        {itensCount
          ? <ProgressBar comprados={itensCount.comprados} total={itensCount.total} />
          : <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}><Loader size={10} className="spin" /> carregando</div>
        }
      </td>
      <td style={{ fontSize: 12, fontWeight: 600 }}>{fmtR$(lista.total_estimado)}</td>
      <td style={{ fontSize: 12, color: lista.total_real > 0 ? 'var(--text)' : 'var(--muted)', fontWeight: lista.total_real > 0 ? 700 : 400 }}>
        {lista.total_real > 0 ? fmtR$(lista.total_real) : '—'}
      </td>
      <td onClick={e => e.stopPropagation()}>
        <div className="ab" style={{ gap: 4 }}>
          <button className="ib" onClick={onClick} title="Abrir lista">
            <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <button className="ib rd" onClick={onDelete} title="Excluir lista">
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Página Principal ─────────────────────────────────────────

export default function ComprasPage() {
  const { user } = useAuth()
  const { loja } = useLoja()

  const [listas, setListas] = useState<ComprasLista[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'nova' | 'detalhe'>('lista')
  const [listaAtiva, setListaAtiva] = useState<ComprasLista | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | ListaStatus>('todos')
  const [confirmDelete, setConfirmDelete] = useState<ComprasLista | null>(null)
  const [mainTab, setMainTab] = useState<'listas' | 'dashboard'>('listas')
  const [itensIniciais, setItensIniciais] = useState<{ produto_nome: string; categoria: string | null; quantidade: number; unidade: string }[] | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    try { setListas(await fetchComprasListas(loja)) } catch {}
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const abrirLista = (l: ComprasLista) => { setListaAtiva(l); setView('detalhe') }

  const handleNova = (l: ComprasLista) => {
    setListas(prev => [l, ...prev])
    setListaAtiva(l)
    setItensIniciais(undefined)
    setView('detalhe')
  }

  const handleAtualizar = (l: ComprasLista) => {
    setListas(prev => prev.map(x => x.id === l.id ? l : x))
    setListaAtiva(l)
  }

  const confirmarDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteComprasLista(confirmDelete.id)
      setListas(prev => prev.filter(l => l.id !== confirmDelete.id))
      setConfirmDelete(null)
    } catch {}
  }

  const abrirNovaComItens = (itens: { produto_nome: string; categoria: string | null; quantidade: number; unidade: string }[]) => {
    setItensIniciais(itens)
    setView('nova')
  }

  const filtradas = listas
    .filter(l => l.titulo.toLowerCase().includes(busca.toLowerCase()))
    .filter(l => filtroStatus === 'todos' || l.status === filtroStatus)

  // ── Vista Detalhe ──
  if (view === 'detalhe' && listaAtiva) {
    return (
      <ListaDetalhe
        lista={listaAtiva}
        onVoltar={() => { setView('lista'); load() }}
        onAtualizar={handleAtualizar}
      />
    )
  }

  // ── Vista Nova ──
  if (view === 'nova') {
    return (
      <div>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>
          {itensIniciais?.length ? 'Lista de Reposição Automática' : 'Nova Lista de Compras'}
        </h2>
        <NovaListaForm
          loja={loja}
          onSalvo={handleNova}
          onCancelar={() => { setItensIniciais(undefined); setView('lista') }}
          itensIniciais={itensIniciais}
        />
      </div>
    )
  }

  // ── Vista Lista (com tabs) ──
  const totalEst  = listas.reduce((s, l) => s + l.total_estimado, 0)
  const abertas   = listas.filter(l => l.status === 'rascunho' || l.status === 'em_andamento').length
  const concluidas = listas.filter(l => l.status === 'concluido').length

  return (
    <div>
      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Total de Listas</div>
          <div className="kpi-val">{listas.length}</div>
          <div className="kpi-sub">{loja}</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Em Aberto</div>
          <div className="kpi-val" style={{ color: abertas > 0 ? 'var(--warning)' : 'var(--muted)' }}>{abertas}</div>
          <div className="kpi-sub">rascunho / andamento</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--success)' }} />
          <div className="kpi-lbl">Concluídas</div>
          <div className="kpi-val" style={{ color: 'var(--success)' }}>{concluidas}</div>
          <div className="kpi-sub">listas finalizadas</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Valor Estimado Total</div>
          <div className="kpi-val" style={{ fontSize: totalEst > 9999 ? 18 : 24 }}>{fmtR$(totalEst)}</div>
          <div className="kpi-sub">todas as listas</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, marginBottom:16, borderBottom:'2px solid var(--border)' }}>
        {([['listas', '📋 Listas de Compras'], ['dashboard', '📊 Dashboard & Alertas']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setMainTab(id)}
            style={{
              padding:'8px 18px', border:'none', background:'none', cursor:'pointer', fontSize:13,
              fontWeight: mainTab===id ? 800 : 500,
              color: mainTab===id ? 'var(--bordo)' : 'var(--muted)',
              borderBottom: mainTab===id ? '2px solid var(--bordo)' : '2px solid transparent',
              marginBottom:-2,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Dashboard */}
      {mainTab === 'dashboard' && (
        <DashboardTab loja={loja} listas={listas} onCriarLista={abrirNovaComItens} />
      )}

      {/* Tab: Listas */}
      {mainTab === 'listas' && (
        <div className="card">
          <div className="card-hd">
            <span className="card-tt"><ClipboardList size={14} style={{ display: 'inline', marginRight: 4 }} />Listas de Compras</span>
            <button className="btn bp bsm" onClick={() => setView('nova')}><Plus size={11} /> Nova Lista</button>
          </div>

          {/* Filtros */}
          <div style={{ padding: '10px 15px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="sw-wrap" style={{ flex: 1, minWidth: 200 }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
              <input className="srch" placeholder="Buscar lista..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <select className="flt" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)}>
              <option value="todos">Todos os status</option>
              {(Object.keys(STATUS_LISTA) as ListaStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LISTA[s].label}</option>
              ))}
            </select>
            {(busca || filtroStatus !== 'todos') && (
              <button className="btn bo bsm" onClick={() => { setBusca(''); setFiltroStatus('todos') }}>Limpar</button>
            )}
          </div>

          {/* Conteúdo */}
          {loading ? (
            <div className="empty"><Loader size={24} className="spin" /></div>
          ) : filtradas.length === 0 ? (
            <div className="empty" style={{ padding: '48px 0' }}>
              <ShoppingCart size={40} style={{ opacity: .3 }} />
              <div style={{ marginTop: 10, fontWeight: 600 }}>
                {listas.length === 0 ? 'Nenhuma lista criada ainda' : 'Nenhuma lista encontrada'}
              </div>
              {listas.length === 0 && (
                <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={() => setView('nova')}>
                  <Plus size={11} /> Criar primeira lista
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Lista</th>
                      <th>Data</th>
                      <th>Status</th>
                      <th>Progresso</th>
                      <th>Est. Total</th>
                      <th>Real Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map(l => (
                      <ListaRow key={l.id} lista={l} onClick={() => abrirLista(l)} onDelete={() => setConfirmDelete(l)} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '8px 15px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
                {filtradas.length} de {listas.length} listas exibidas
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal confirmação exclusão */}
      {confirmDelete && (
        <div className="ov open" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">Excluir Lista</span>
              <button className="mx" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="mbd">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={18} style={{ color: 'var(--danger)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{confirmDelete.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Todos os itens serão removidos. Esta ação não pode ser desfeita.
                  </div>
                </div>
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={confirmarDelete}>
                <Trash2 size={11} /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

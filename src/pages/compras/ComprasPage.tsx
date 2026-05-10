import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, Trash2, ChevronLeft, Loader, CheckCircle2,
  Circle, XCircle, ShoppingCart, ClipboardList, Calendar,
  Package, ChevronDown, Edit3, Check, X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchComprasListas, insertComprasLista, updateComprasLista, deleteComprasLista,
  fetchComprasListaItens, insertComprasListaItem, updateComprasListaItem, deleteComprasListaItem,
} from '../../lib/db'
import type { ComprasLista, ComprasListaItem, ListaStatus, ListaItemStatus } from '../../types/database'

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

const fmtR$ = (v: number | null | undefined) =>
  v == null ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`

const fmtData = (d: string | null) => {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
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

// ── Progresso dos itens ──────────────────────────────────────

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

// ── Formulário Nova Lista ────────────────────────────────────

function NovaListaForm({ loja, onSalvo, onCancelar }: {
  loja: string
  onSalvo: (lista: ComprasLista) => void
  onCancelar: () => void
}) {
  const { user } = useAuth()
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

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
      onSalvo(lista)
    } catch (e) { console.error(e); setErr('Erro ao salvar') }
    setSaving(false)
  }

  return (
    <div className="card" style={{ maxWidth: 560, padding: 28 }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800 }}>📋 Nova Lista de Compras</h3>

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
          <input
            className="inp" style={{ minWidth: 160, fontSize: 12 }}
            value={form.produto_nome}
            onChange={e => setForm(f => ({ ...f, produto_nome: e.target.value }))}
          />
        </td>
        <td>
          <select className="sel" style={{ fontSize: 12 }} value={form.categoria ?? ''} onChange={e => setForm(f => ({ ...f, categoria: e.target.value || null }))}>
            <option value="">—</option>
            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
        </td>
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              className="inp" type="number" min={0} step={0.001}
              style={{ width: 70, fontSize: 12 }}
              value={form.quantidade}
              onChange={e => setForm(f => ({ ...f, quantidade: parseFloat(e.target.value) || 0 }))}
            />
            <select className="sel" style={{ fontSize: 12, width: 60 }} value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}>
              {UNIDADES.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </td>
        <td>
          <input
            className="inp" type="number" min={0} step={0.01}
            style={{ width: 90, fontSize: 12 }}
            placeholder="Estimado"
            value={form.preco_estimado ?? ''}
            onChange={e => setForm(f => ({ ...f, preco_estimado: parseFloat(e.target.value) || null }))}
          />
        </td>
        <td>
          <input
            className="inp" type="number" min={0} step={0.01}
            style={{ width: 90, fontSize: 12 }}
            placeholder="Real"
            value={form.preco_real ?? ''}
            onChange={e => setForm(f => ({ ...f, preco_real: parseFloat(e.target.value) || null }))}
          />
        </td>
        <td>
          <input
            className="inp" style={{ width: 120, fontSize: 12 }}
            list="forn-list"
            value={form.fornecedor_nome ?? ''}
            onChange={e => setForm(f => ({ ...f, fornecedor_nome: e.target.value || null }))}
            placeholder="Fornecedor"
          />
          <datalist id="forn-list">
            {fornecedores.map(f => <option key={f} value={f} />)}
          </datalist>
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
        <button
          onClick={ciclarStatus}
          title={`Status: ${s.label} — clique para mudar`}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: s.color, display: 'flex', alignItems: 'center', padding: 4 }}
        >
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
          : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
        }
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
          <button
            className="btn bo bsm"
            onClick={() => setOpen(true)}
            style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }}
          >
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
        <input
          className="inp" style={{ minWidth: 160, fontSize: 12 }}
          value={form.produto_nome}
          onChange={e => setForm(f => ({ ...f, produto_nome: e.target.value }))}
          placeholder="Nome do produto *"
          autoFocus
          onKeyDown={e => e.key === 'Enter' && adicionar()}
        />
      </td>
      <td>
        <select className="sel" style={{ fontSize: 12 }} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
          <option value="">Categoria</option>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            className="inp" type="number" min={0} step={0.001}
            style={{ width: 70, fontSize: 12 }}
            value={form.quantidade}
            onChange={e => setForm(f => ({ ...f, quantidade: e.target.value as unknown as number }))}
          />
          <select className="sel" style={{ fontSize: 12, width: 60 }} value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}>
            {UNIDADES.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </td>
      <td>
        <input
          className="inp" type="number" min={0} step={0.01}
          style={{ width: 90, fontSize: 12 }}
          placeholder="R$ est."
          value={form.preco_estimado}
          onChange={e => setForm(f => ({ ...f, preco_estimado: e.target.value }))}
        />
      </td>
      <td />
      <td>
        <input
          className="inp" style={{ width: 120, fontSize: 12 }}
          value={form.fornecedor_nome}
          onChange={e => setForm(f => ({ ...f, fornecedor_nome: e.target.value }))}
          placeholder="Fornecedor"
        />
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

  const load = useCallback(async () => {
    setLoading(true)
    try { setItens(await fetchComprasListaItens(lista.id)) } catch {}
    setLoading(false)
  }, [lista.id])

  useEffect(() => { load() }, [load])

  // Recalcula totais e atualiza header
  const recalcularTotais = useCallback(async (itensAtuais: ComprasListaItem[]) => {
    const est = itensAtuais.reduce((s, i) => s + (i.preco_estimado ?? 0) * i.quantidade, 0)
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

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <button className="btn bo bsm" onClick={onVoltar}><ChevronLeft size={12} /> Listas</button>
        <div style={{ flex: 1 }}>
          {editandoTitulo ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="inp" style={{ fontSize: 18, fontWeight: 800, maxWidth: 400 }}
                value={novoTitulo}
                onChange={e => setNovoTitulo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && salvarTitulo()}
                autoFocus
              />
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
            {lista.created_by && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>por {lista.created_by}</span>
            )}
          </div>
        </div>

        {/* Mudar status */}
        <div style={{ position: 'relative' }}>
          <select
            className="sel"
            value={lista.status}
            onChange={e => mudarStatus(e.target.value as ListaStatus)}
            disabled={mudandoStatus}
            style={{ fontSize: 12, fontWeight: 700 }}
          >
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
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Pendentes</div>
          <div className="kpi-val" style={{ color: pendentes > 0 ? 'var(--warning)' : 'var(--muted)' }}>{pendentes}</div>
          <div className="kpi-sub">itens a comprar</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--muted)' }} />
          <div className="kpi-lbl">Cancelados</div>
          <div className="kpi-val" style={{ color: 'var(--muted)' }}>{cancelados}</div>
          <div className="kpi-sub">itens cancelados</div>
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
                  <ItemRow
                    key={item.id}
                    item={item}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    fornecedores={fornecedoresUsados}
                  />
                ))}
                {/* Linha de adicionar — só exibe se sem filtro ativo */}
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

// ── Página Principal ─────────────────────────────────────────

export default function ComprasPage() {
  const { user } = useAuth()
  const loja = user?.loja && user.loja !== 'Todas' ? user.loja : 'AMORE COSTA DOURADA'

  const [listas, setListas] = useState<ComprasLista[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'nova' | 'detalhe'>('lista')
  const [listaAtiva, setListaAtiva] = useState<ComprasLista | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | ListaStatus>('todos')
  const [confirmDelete, setConfirmDelete] = useState<ComprasLista | null>(null)

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
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>Nova Lista de Compras</h2>
        <NovaListaForm loja={loja} onSalvo={handleNova} onCancelar={() => setView('lista')} />
      </div>
    )
  }

  // ── Vista Lista ──
  const totalEst = listas.reduce((s, l) => s + l.total_estimado, 0)
  const abertas  = listas.filter(l => l.status === 'rascunho' || l.status === 'em_andamento').length
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

      {/* Tabela de listas */}
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
                    <ListaRow
                      key={l.id}
                      lista={l}
                      onClick={() => abrirLista(l)}
                      onDelete={() => setConfirmDelete(l)}
                    />
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

import { useState, useEffect, useCallback, useRef } from 'react'
import { useDebounce } from '../../hooks/useDebounce'
import {
  Plus, Search, Trash2, ChevronLeft, Loader, CheckCircle2,
  Circle, XCircle, ShoppingCart, ClipboardList, Calendar,
  Package, ChevronDown, Edit3, Check, X, Download,
  AlertTriangle, Building2, TrendingUp, RefreshCw, Clock,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchComprasListas, insertComprasLista, updateComprasLista, deleteComprasLista,
  fetchComprasListaItens, insertComprasListaItem, updateComprasListaItem, deleteComprasListaItem,
  fetchItensComprasDashboard, fetchEstoqueProdutos, insertEstoqueMovimentacao,
  atualizarCustoMedioPorNome, atualizarUltimoPrecoCompraPorNome, fetchFornecedores,
  registrarEAnalisarCompra,
} from '../../lib/db'
import type { ComprasLista, ComprasListaItem, ListaStatus, ListaItemStatus, EstoqueProduto, Fornecedor } from '../../types/database'

// ── Constantes ───────────────────────────────────────────────

const CATEGORIAS = [
  'Açaí', 'Bebidas', 'Carnes', 'Condimentos', 'Descartáveis', 'Embalagens',
  'Frutas', 'Grãos', 'Higiene', 'Laticínios', 'Legumes', 'Limpeza',
  'Proteínas', 'Sorvetes', 'Temperos', 'Outros',
]

const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'fd', 'sc', 'lt', 'dz']

// ── Cotação Formal — config empresa ──────────────────────────
const EMPRESA_KEY = 'amore_empresa_cfg_v1'
type EmpresaConfig = { nome: string; cnpj: string; telefone: string; responsavel: string; unidade: string }
const EMPRESA_DEFAULT: EmpresaConfig = { nome: 'Amore Food', cnpj: '', telefone: '', responsavel: '', unidade: '' }
type ItemCotFormal = {
  produto_nome: string; marca: string; qtd: string; unidade: string
  descricao: string; marcas_similares: string; preco_unit: string
}

// ── Conferência de Recebimento ───────────────────────────────

export type ConfStatus = 'correto' | 'avariado' | 'faltando' | 'fora_padrao' | 'ruptura_parcial' | 'ruptura_total'

const CONF_STATUS: Record<ConfStatus, { label: string; emoji: string; color: string; bg: string; entraEstoque: boolean }> = {
  correto:        { label: 'Correto',        emoji: '✅', color: '#15803D', bg: '#D1FAE5', entraEstoque: true  },
  avariado:       { label: 'Avariado',       emoji: '⚠️', color: '#B45309', bg: '#FEF3C7', entraEstoque: false },
  faltando:       { label: 'Faltando',       emoji: '📭', color: '#6B7280', bg: '#F3F4F6', entraEstoque: false },
  fora_padrao:    { label: 'Fora do padrão', emoji: '❌', color: '#DC2626', bg: '#FEE2E2', entraEstoque: false },
  ruptura_parcial:{ label: 'Ruptura parcial',emoji: '🔶', color: '#EA580C', bg: '#FFEDD5', entraEstoque: true  },
  ruptura_total:  { label: 'Ruptura total',  emoji: '🔴', color: '#9F1239', bg: '#FFE4E6', entraEstoque: false },
}

type ConferenciaItem = {
  item_id: string
  produto_nome: string
  quantidade_pedida: number
  quantidade_recebida: number
  unidade: string
  status_conf: ConfStatus
  data_validade: string
  numero_lote: string
  obs: string
}

// ── Status de Listas ─────────────────────────────────────────

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
  const { user } = useAuth()
  const [itens, setItens] = useState<ComprasListaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<'todos' | ListaItemStatus>('todos')
  const [filtroCateg, setFiltroCateg] = useState('')
  const [editandoTitulo, setEditandoTitulo] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState(lista.titulo)
  const [mudandoStatus, setMudandoStatus] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)

  // Agente: toast de alerta de preço
  const [alertaPreco, setAlertaPreco] = useState<{ produto: string; variacao: number; nivel: string } | null>(null)

  // Item 10 – Aprovação
  const [aprovacao, setAprovacao] = useState<'pendente' | 'aprovado' | 'reprovado'>(
    lista.status === 'concluido' ? 'aprovado' : lista.status === 'cancelado' ? 'reprovado' : 'pendente'
  )
  const [motivoReprovacao, setMotivoReprovacao] = useState('')
  const [showMotivoInput, setShowMotivoInput] = useState(false)

  // Item 3 – Recebimento
  const [showRecebimento, setShowRecebimento] = useState(false)
  const [recNome, setRecNome] = useState('')
  const [recData, setRecData] = useState(new Date().toISOString().split('T')[0])
  const [recHorario, setRecHorario] = useState(() => new Date().toTimeString().slice(0, 5))
  // Campos extras do recebimento
  const [recNf, setRecNf] = useState('')
  const [recDivergencias, setRecDivergencias] = useState('')
  const [recObsGeral, setRecObsGeral] = useState('')
  const [recAtualizarPrecos, setRecAtualizarPrecos] = useState(true)
  // Conferência por item
  const [recConferencia, setRecConferencia] = useState<ConferenciaItem[]>([])

  // Cotação Formal
  const [showCotacaoFormal, setShowCotacaoFormal] = useState(false)
  const [empresaCfg, setEmpresaCfg] = useState<EmpresaConfig>(() => {
    try { return { ...EMPRESA_DEFAULT, ...JSON.parse(localStorage.getItem(EMPRESA_KEY) || '{}') } } catch { return EMPRESA_DEFAULT }
  })
  const [fornCotFormal, setFornCotFormal] = useState({ nome: '', cnpj: '', telefone: '', email: '', vendedor: '' })
  const [itensCotFormal, setItensCotFormal] = useState<ItemCotFormal[]>([])
  const [cotCondicoes, setCotCondicoes] = useState({ prazo_entrega: '', forma_pgto: '', validade: '', obs: '' })

  // Histórico de cotações enviadas (localStorage por lista)
  const histKey = `cotacao-hist-${lista.id}`
  const [historicoCotacoes, setHistoricoCotacoes] = useState<{ tipo: 'whatsapp' | 'email'; data: string; qtd: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem(histKey) || '[]') } catch { return [] }
  })
  const [showHistorico, setShowHistorico] = useState(false)
  const historicoRef = useRef<HTMLDivElement>(null)

  // Disparar Cotação — modal multi-fornecedor
  const [showDispararCot, setShowDispararCot] = useState(false)
  const [fornecedoresBD, setFornecedoresBD] = useState<Fornecedor[]>([])
  const [fornsSelecionados, setFornsSelecionados] = useState<Set<string>>(new Set())
  const [loadingFornBD, setLoadingFornBD] = useState(false)

  // Fechar histórico ao clicar fora (click-outside)
  useEffect(() => {
    if (!showHistorico) return
    const handler = (e: MouseEvent) => {
      if (historicoRef.current && !historicoRef.current.contains(e.target as Node)) {
        setShowHistorico(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showHistorico])

  // pendentesCount calculado junto com os demais (ver abaixo), efeito movido após declaração

  const registrarCotacao = (tipo: 'whatsapp' | 'email', qtd: number) => {
    const novo = { tipo, data: new Date().toISOString(), qtd }
    const atualizado = [novo, ...historicoCotacoes].slice(0, 20)
    setHistoricoCotacoes(atualizado)
    localStorage.setItem(histKey, JSON.stringify(atualizado))
  }

  // Formata telefone para WA: remove tudo exceto dígitos, adiciona 55 se precisar
  const fmtFoneWA = (fone: string) => {
    const digits = fone.replace(/\D/g, '')
    if (digits.startsWith('55') && digits.length >= 12) return digits
    if (digits.length >= 10) return '55' + digits
    return digits
  }

  const abrirDispararCotacao = async () => {
    setShowDispararCot(true)
    setFornsSelecionados(new Set())
    setLoadingFornBD(true)
    try {
      const lista_forn = await fetchFornecedores(lista.loja)
      setFornecedoresBD(lista_forn.filter(f => f.ativo !== false))
    } catch { setFornecedoresBD([]) }
    setLoadingFornBD(false)
  }

  const txtCotacaoWA = (itensPend: ComprasListaItem[]) => {
    const data = lista.data_compra ? fmtData(lista.data_compra) : new Date().toLocaleDateString('pt-BR')
    const linhas = itensPend.map((it, i) =>
      `${i + 1}. ${it.produto_nome} – ${it.quantidade} ${it.unidade || 'un'}${it.preco_estimado ? ` (est. ${fmtR$(it.preco_estimado)})` : ''}`
    ).join('\n')
    return `🛒 *COTAÇÃO — ${lista.titulo}*\nData: ${data}\n\nPrezado fornecedor, solicito cotação dos itens abaixo:\n\n${linhas}\n\nResponda com:\n• Produto | Marca | Preço unit. | Prazo | Forma pgto\n\n📞 Amore Gestão`
  }

  const txtCotacaoEmail = (itensPend: ComprasListaItem[]) => {
    const data = lista.data_compra ? fmtData(lista.data_compra) : new Date().toLocaleDateString('pt-BR')
    const linhas = itensPend.map((it, i) =>
      `${i + 1}. ${it.produto_nome} – ${it.quantidade} ${it.unidade || 'un'}${it.preco_estimado ? ` (est. R$ ${it.preco_estimado.toFixed(2).replace('.', ',')})` : ''}`
    ).join('\n')
    return `Prezado fornecedor,\n\nSolicito cotação dos itens abaixo para a lista "${lista.titulo}" — Data: ${data}\n\n${linhas}\n\nPor favor, responda com:\n• Produto | Marca | Preço unitário | Prazo de entrega | Forma de pagamento\n\nAtenciosamente,\nAmore Gestão`
  }

  const dispararWA = (forn: Fornecedor, itensPend: ComprasListaItem[]) => {
    const fone = forn.whatsapp || forn.telefone || forn.contato_telefone || ''
    const txt = txtCotacaoWA(itensPend)
    const numFone = fmtFoneWA(fone)
    window.open(`https://wa.me/${numFone}?text=${encodeURIComponent(txt)}`, '_blank')
    registrarCotacao('whatsapp', itensPend.length)
  }

  const dispararEmail = (forn: Fornecedor, itensPend: ComprasListaItem[]) => {
    const email = forn.email || forn.contato_email || ''
    const assunto = encodeURIComponent(`Solicitação de Cotação — ${lista.titulo}`)
    const corpo = encodeURIComponent(txtCotacaoEmail(itensPend))
    window.open(`mailto:${encodeURIComponent(email)}?subject=${assunto}&body=${corpo}`, '_blank')
    registrarCotacao('email', itensPend.length)
  }

  const dispararParaTodos = () => {
    const itensPend = itens.filter(i => i.status === 'pendente')
    fornecedoresBD
      .filter(f => fornsSelecionados.has(f.id))
      .forEach(f => {
        const temWA = !!(f.whatsapp || f.telefone || f.contato_telefone)
        if (temWA) dispararWA(f, itensPend)
      })
  }

  const abrirModalResposta = () => {
    const itensPendentes = itens.filter(i => i.status === 'pendente')
    setFormResposta({
      fornecedor: '', prazo: '', rota: '', forma_pgto: '', obs: '',
      itens: itensPendentes.map(it => ({
        produto_nome: it.produto_nome, marca: '', preco_unit: '', preco_total: '',
      })),
    })
    setShowResposta(true)
  }

  const salvarResposta = async () => {
    if (!formResposta.fornecedor.trim()) return
    const nova: RespostaFornecedor = {
      id: Date.now().toString(),
      data: new Date().toISOString(),
      ...formResposta,
    }
    const atualizadas = [nova, ...respostas].slice(0, 10)
    setRespostas(atualizadas)
    localStorage.setItem(respostasKey, JSON.stringify(atualizadas))

    // Aplicar preços do fornecedor nos itens da lista
    const atualizacoes = formResposta.itens
      .filter(ri => ri.preco_unit)
      .map(ri => {
        const item = itens.find(i => i.produto_nome === ri.produto_nome)
        if (!item) return Promise.resolve()
        return updateComprasListaItem(item.id, {
          preco_real: parseFloat(ri.preco_unit) || null,
          fornecedor_nome: formResposta.fornecedor,
        }).then(updated => {
          setItens(prev => prev.map(i => i.id === updated.id ? updated : i))
        }).catch(() => {})
      })
    await Promise.all(atualizacoes)
    setShowResposta(false)
  }
  const [recToast, setRecToast] = useState(false)
  const [recEstoqueQtd, setRecEstoqueQtd] = useState(0)

  // ── Resposta do Fornecedor (Cotação Inteligente) ──────────────
  type RespostaFornecedor = {
    id: string; fornecedor: string; prazo: string; rota: string
    forma_pgto: string; obs: string; data: string
    itens: { produto_nome: string; marca: string; preco_unit: string; preco_total: string }[]
  }
  const respostasKey = `cotacao-respostas-${lista.id}`
  const [respostas, setRespostas] = useState<RespostaFornecedor[]>(() => {
    try { return JSON.parse(localStorage.getItem(respostasKey) || '[]') } catch { return [] }
  })
  const [showResposta, setShowResposta] = useState(false)
  const [showComparativo, setShowComparativo] = useState(false)
  const [formResposta, setFormResposta] = useState<Omit<RespostaFornecedor, 'id' | 'data'>>({
    fornecedor: '', prazo: '', rota: '', forma_pgto: '', obs: '', itens: [],
  })

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
      // ── Agente Analítico: registrar compra para auditoria automática ──
      if (updated.status === 'comprado' && updated.preco_real != null && updated.preco_real > 0) {
        registrarEAnalisarCompra({
          produto_nome:    updated.produto_nome,
          categoria:       updated.categoria,
          fornecedor_nome: updated.fornecedor_nome,
          comprador_nome:  user?.name ?? null,
          quantidade:      updated.quantidade,
          unidade:         updated.unidade,
          preco_atual:     updated.preco_real,
          loja:            lista.loja,
          data_compra:     lista.data_compra ?? new Date().toISOString().slice(0, 10),
          lista_id:        lista.id,
          item_id:         updated.id,
        }).then(res => {
          if (res?.auditoria && res.auditoria.nivel_alerta !== 'normal') {
            setAlertaPreco({
              produto:  res.auditoria.produto_nome,
              variacao: res.auditoria.variacao_pct ?? 0,
              nivel:    res.auditoria.nivel_alerta,
            })
            setTimeout(() => setAlertaPreco(null), 7000)
          }
        }).catch(console.error)
      }
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

  // Cotação Formal — abrir modal pré-preenchido
  const abrirCotacaoFormal = () => {
    setItensCotFormal(
      itens.filter(i => i.status === 'pendente').map(it => ({
        produto_nome: it.produto_nome,
        marca: '',
        qtd: String(it.quantidade),
        unidade: it.unidade || 'un',
        descricao: '',
        marcas_similares: '',
        preco_unit: it.preco_estimado ? it.preco_estimado.toFixed(2) : '',
      }))
    )
    setFornCotFormal({ nome: '', cnpj: '', telefone: '', email: '', vendedor: '' })
    setCotCondicoes({ prazo_entrega: '', forma_pgto: '', validade: '', obs: '' })
    setShowCotacaoFormal(true)
  }

  // Item 10 – Aprovação
  const aprovarCompra = async () => {
    try {
      const obs = (lista.observacoes || '') + '\n[APROVADO por ' + new Date().toLocaleString('pt-BR') + ']'
      const atualizado = await updateComprasLista(lista.id, { status: 'em_andamento', observacoes: obs })
      onAtualizar(atualizado)
      setAprovacao('aprovado')
    } catch (e) { console.error(e) }
  }

  const reprovarCompra = async () => {
    if (!motivoReprovacao.trim()) return
    try {
      const obs = '[REPROVADO: ' + motivoReprovacao.trim() + ']'
      const atualizado = await updateComprasLista(lista.id, { status: 'cancelado', observacoes: obs })
      onAtualizar(atualizado)
      setAprovacao('reprovado')
      setShowMotivoInput(false)
      setMotivoReprovacao('')
    } catch (e) { console.error(e) }
  }

  // ── Inicializar conferência ao abrir o modal ────────────────
  const initConferencia = () => {
    const itensComprados = itens.filter(i => i.status === 'comprado')
    setRecConferencia(itensComprados.map(i => ({
      item_id: i.id,
      produto_nome: i.produto_nome,
      quantidade_pedida: i.quantidade,
      quantidade_recebida: i.quantidade,
      unidade: i.unidade || 'un',
      status_conf: 'correto' as ConfStatus,
      data_validade: '',
      numero_lote: '',
      obs: '',
    })))
    setRecHorario(new Date().toTimeString().slice(0, 5))
    setRecData(new Date().toISOString().split('T')[0])
  }

  // Item 3 – Confirmar Recebimento + Entrada automática no Estoque com custo médio
  const confirmarRecebimento = async () => {
    try {
      // ── Resumo da conferência ──────────────────────────────────
      const nfStr     = recNf.trim() ? ` | NF: ${recNf.trim()}` : ''
      const horStr    = recHorario ? ` ${recHorario}` : ''
      const divStr    = recDivergencias.trim() ? `\nDivergências: ${recDivergencias.trim()}` : ''
      const obsStr    = recObsGeral.trim() ? `\nObs: ${recObsGeral.trim()}` : ''

      const confLines = recConferencia.map(c => {
        const s = CONF_STATUS[c.status_conf]
        const loteInfo = c.numero_lote ? ` · Lote: ${c.numero_lote}` : ''
        const valInfo  = c.data_validade ? ` · Val: ${fmtData(c.data_validade)}` : ''
        const qtdInfo  = c.quantidade_recebida !== c.quantidade_pedida
          ? ` (rec. ${c.quantidade_recebida}/${c.quantidade_pedida} ${c.unidade})`
          : ` (${c.quantidade_pedida} ${c.unidade})`
        return `  ${s.emoji} ${c.produto_nome}${qtdInfo}${loteInfo}${valInfo}`
      }).join('\n')

      const totalConfOk   = recConferencia.filter(c => CONF_STATUS[c.status_conf].entraEstoque).length
      const totalFaltando = recConferencia.filter(c => !CONF_STATUS[c.status_conf].entraEstoque).length
      const tipoLabel     = totalFaltando === 0 ? 'Total' : totalConfOk === 0 ? 'Não recebido' : 'Parcial'

      const obsAtual = (lista.observacoes || '') +
        `\n[RECEBIMENTO: ${tipoLabel} | por: ${recNome} | ${recData}${horStr}${nfStr}\nConferência:\n${confLines}${divStr}${obsStr}]`

      if (lista.status !== 'concluido') await mudarStatus('concluido')
      await updateComprasLista(lista.id, { observacoes: obsAtual })

      // ── Itens que entram no estoque (correto + ruptura_parcial) ──
      const itensParaEstoque = recConferencia.filter(c => CONF_STATUS[c.status_conf].entraEstoque)
      const nfMotivo = recNf.trim() ? ` | NF: ${recNf.trim()}` : ''

      const entradas = itensParaEstoque.map(conf => {
        const loteInfo  = conf.numero_lote    ? ` | Lote: ${conf.numero_lote}`                : ''
        const valInfo   = conf.data_validade  ? ` | Val: ${fmtData(conf.data_validade)}`      : ''
        return insertEstoqueMovimentacao({
          loja: lista.loja || 'Todas as Lojas',
          produto_id: null,
          produto_nome: conf.produto_nome,
          tipo: 'entrada',
          quantidade: conf.quantidade_recebida,
          unidade: conf.unidade,
          motivo: `Entrada via Compras: ${lista.titulo}${nfMotivo}${loteInfo}${valInfo} | Conf. por: ${recNome}`,
          created_by: recNome,
        }).catch(() => null)
      })
      await Promise.all(entradas)

      // ── Custo médio ponderado ──────────────────────────────────
      if (recAtualizarPrecos) {
        await Promise.all(itensParaEstoque.map(conf => {
          const item  = itens.find(i => i.id === conf.item_id)
          const preco = item?.preco_real ?? item?.preco_estimado
          if (preco && preco > 0) {
            return atualizarCustoMedioPorNome(
              conf.produto_nome,
              lista.loja || 'Todas as Lojas',
              conf.quantidade_recebida,
              preco,
              conf.data_validade || null,
              conf.numero_lote   || null,
            ).catch(() => null)
          }
          return Promise.resolve()
        }))

        // ── Atualiza último preço de compra no catálogo de produtos ──
        await Promise.all(itensParaEstoque.map(conf => {
          const item  = itens.find(i => i.id === conf.item_id)
          const preco = item?.preco_real ?? item?.preco_estimado
          if (preco && preco > 0) {
            return atualizarUltimoPrecoCompraPorNome(
              conf.produto_nome,
              lista.loja || 'Todas as Lojas',
              preco,
              recData,
            ).catch(() => null)
          }
          return Promise.resolve()
        }))
      }

      setRecEstoqueQtd(itensParaEstoque.length)
      setShowRecebimento(false)
      setRecToast(true)
      // reset
      setRecNf(''); setRecDivergencias(''); setRecObsGeral('')
      setRecNome(''); setRecData(new Date().toISOString().split('T')[0])
      setRecHorario(new Date().toTimeString().slice(0, 5))
      setRecConferencia([])
      setTimeout(() => { setRecToast(false); setRecEstoqueQtd(0) }, 4500)
    } catch (e) { console.error(e) }
  }

  const comprados = itens.filter(i => i.status === 'comprado').length
  const pendentes  = itens.filter(i => i.status === 'pendente').length
  const cancelados = itens.filter(i => i.status === 'cancelado').length
  const todosComprados = itens.length > 0 && itens.every(i => i.status === 'comprado' || i.status === 'cancelado')

  // Fechar email input / histórico quando não há mais pendentes
  useEffect(() => {
    if (pendentes === 0) {
      setShowHistorico(false)
    }
  }, [pendentes])

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
        <div style={{ display: 'flex', gap: 6, position: 'relative', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Cotação — botão principal + histórico */}
          {pendentes > 0 && (
            <div style={{ display: 'flex', gap: 4, position: 'relative', flexWrap: 'wrap' }}>
              <button className="btn bo bsm" onClick={abrirDispararCotacao}
                title="Selecionar fornecedores e disparar cotação via WhatsApp ou e-mail"
                style={{ color: '#16A34A', borderColor: '#16A34A', fontWeight: 700 }}>
                📨 Disparar Cotação
              </button>
              {historicoCotacoes.length > 0 && (
                <button className="btn bo bsm" onClick={() => setShowHistorico(o => !o)}
                  title="Histórico de cotações enviadas"
                  style={{ color: 'var(--muted)' }}>
                  <Clock size={12} /> {historicoCotacoes.length}
                </button>
              )}
              {/* Painel histórico */}
              {showHistorico && historicoCotacoes.length > 0 && (
                <div ref={historicoRef} style={{
                  position: 'absolute', right: 0, top: '110%', zIndex: 300,
                  background: 'var(--sidebar)', border: '1px solid var(--border)',
                  borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,.15)',
                  minWidth: 280, padding: '12px 14px',
                }}>
                  <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <span>📋 Histórico de cotações</span>
                    <button className="mx" onClick={() => setShowHistorico(false)} style={{ fontSize: 12 }}>✕</button>
                  </div>
                  {historicoCotacoes.map((h, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                      <span style={{ fontSize: 16 }}>{h.tipo === 'whatsapp' ? '📱' : '📧'}</span>
                      <div>
                        <div style={{ fontWeight: 700 }}>{h.tipo === 'whatsapp' ? 'WhatsApp' : 'Email'} — {h.qtd} item(ns)</div>
                        <div style={{ color: 'var(--muted)', fontSize: 10 }}>{new Date(h.data).toLocaleString('pt-BR')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resposta do Fornecedor — aparece sempre que há cotações no histórico */}
          {historicoCotacoes.length > 0 && (
            <button className="btn bo bsm" onClick={abrirModalResposta}
              title="Registrar resposta recebida do fornecedor"
              style={{ color: '#7C3AED', borderColor: '#7C3AED' }}>
              📥 Resposta Fornecedor
            </button>
          )}

          {/* Cotação Formal */}
          {pendentes > 0 && (
            <button className="btn bo bsm" onClick={abrirCotacaoFormal}
              title="Gerar pedido formal de cotação com dados da empresa e fornecedor"
              style={{ color: '#9333EA', borderColor: '#9333EA' }}>
              📄 Pedido Formal
            </button>
          )}

          {/* Comparativo de preços */}
          {respostas.length >= 2 && (
            <button className="btn bo bsm" onClick={() => setShowComparativo(true)}
              title={`Comparativo de ${respostas.length} fornecedores`}
              style={{ color: '#EA580C', borderColor: '#EA580C' }}>
              📊 Comparativo ({respostas.length})
            </button>
          )}

          {/* Item 3 – Confirmar Recebimento */}
          {(lista.status === 'concluido' || todosComprados) && (
            <button className="btn bo bsm" onClick={() => { initConferencia(); setShowRecebimento(true) }}
              style={{ color: '#2563EB', borderColor: '#2563EB' }}>
              📦 Conferir Recebimento
            </button>
          )}

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

      {/* Item 10 – Seção de Aprovação */}
      {aprovacao === 'pendente' && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>
            <AlertTriangle size={13} style={{ display: 'inline', marginRight: 4, color: 'var(--warning)' }} />
            Aprovação da Compra
          </span>
          <span className="badge bg-y" style={{ fontSize: 11 }}>Pendente de aprovação</span>
          {!showMotivoInput ? (
            <>
              <button className="btn bsm" onClick={aprovarCompra}
                style={{ background: 'var(--success)', color: '#fff', border: 'none' }}>
                ✅ Aprovar Compra
              </button>
              <button className="btn bo bsm" onClick={() => setShowMotivoInput(true)}
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                ❌ Reprovar
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
              <input className="inp" placeholder="Motivo da reprovação..." style={{ flex: 1, fontSize: 12 }}
                value={motivoReprovacao} onChange={e => setMotivoReprovacao(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && reprovarCompra()} autoFocus />
              <button className="btn bsm" onClick={reprovarCompra}
                style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}>
                Confirmar
              </button>
              <button className="ib" onClick={() => { setShowMotivoInput(false); setMotivoReprovacao('') }}><X size={14} /></button>
            </div>
          )}
        </div>
      )}
      {aprovacao === 'aprovado' && (
        <div className="card" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>Compra aprovada</span>
        </div>
      )}
      {aprovacao === 'reprovado' && (
        <div className="card" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <XCircle size={14} style={{ color: 'var(--danger)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Compra reprovada</span>
        </div>
      )}

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

      {/* Item 3 – Modal de Conferência de Recebimento (V6.0) */}
      {showRecebimento && (
        <div className="ov open" onClick={e => e.target === e.currentTarget && setShowRecebimento(false)}>
          <div className="modal" style={{ maxWidth: 780 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">📦 Conferência de Recebimento — {lista.titulo}</span>
              <button className="mx" onClick={() => setShowRecebimento(false)}><X size={14} /></button>
            </div>
            <div className="mbd" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '76vh', overflowY: 'auto' }}>

              {/* ── Linha cabeçalho: Responsável + Data + Hora + NF ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 1fr', gap: 10 }}>
                <div className="fg">
                  <label className="fl" style={{ fontSize: 12, fontWeight: 700 }}>Recebido por <span className="rq">*</span></label>
                  <input className="inp" placeholder="Nome do responsável" style={{ fontSize: 12 }}
                    value={recNome} onChange={e => setRecNome(e.target.value)} autoFocus />
                </div>
                <div className="fg">
                  <label className="fl" style={{ fontSize: 12, fontWeight: 700 }}>Data <span className="rq">*</span></label>
                  <input className="inp" type="date" style={{ fontSize: 12 }}
                    value={recData} onChange={e => setRecData(e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl" style={{ fontSize: 12, fontWeight: 700 }}>Horário</label>
                  <input className="inp" type="time" style={{ fontSize: 12 }}
                    value={recHorario} onChange={e => setRecHorario(e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl" style={{ fontSize: 12, fontWeight: 700 }}>NF / Pedido</label>
                  <input className="inp" placeholder="Ex: NF-00123" style={{ fontSize: 12 }}
                    value={recNf} onChange={e => setRecNf(e.target.value)} />
                </div>
              </div>

              {/* ── Tabela de conferência por item ── */}
              <div>
                <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--bordo)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  📋 Conferência por Item
                  {recConferencia.length > 0 && (
                    <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>
                      — {recConferencia.filter(c => CONF_STATUS[c.status_conf].entraEstoque).length} entram no estoque,{' '}
                      {recConferencia.filter(c => !CONF_STATUS[c.status_conf].entraEstoque).length} com problema
                    </span>
                  )}
                </div>

                {recConferencia.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                    Nenhum item marcado como "Comprado" nesta lista.
                    <div style={{ marginTop: 6, fontSize: 11 }}>Marque os itens como comprados antes de confirmar o recebimento.</div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--bordo)', color: '#fff' }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Produto</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, width: 60 }}>Pedido</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, width: 70 }}>Recebido</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, width: 160 }}>Status</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, width: 90 }}>N° Lote</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, width: 110 }}>Validade</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recConferencia.map((conf, idx) => {
                          const s = CONF_STATUS[conf.status_conf]
                          return (
                            <tr key={conf.item_id} style={{
                              borderBottom: '1px solid var(--border)',
                              background: s.entraEstoque
                                ? (idx % 2 === 0 ? 'transparent' : '#f9f9f9')
                                : s.bg + '66',
                            }}>
                              {/* Produto */}
                              <td style={{ padding: '5px 10px', fontWeight: 700, fontSize: 12 }}>
                                {conf.produto_nome}
                                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>
                                  {conf.unidade}
                                </span>
                              </td>
                              {/* Qtd pedida */}
                              <td style={{ padding: '5px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                                {conf.quantidade_pedida}
                              </td>
                              {/* Qtd recebida */}
                              <td style={{ padding: '5px 6px' }}>
                                <input
                                  type="number" min={0} step={0.001}
                                  style={{ width: '100%', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 5px', background: 'var(--surface,#fff)', color: 'var(--text)', textAlign: 'center' }}
                                  value={conf.quantidade_recebida}
                                  onChange={e => setRecConferencia(prev => prev.map((c, i) => i === idx
                                    ? { ...c, quantidade_recebida: parseFloat(e.target.value) || 0 }
                                    : c))}
                                />
                              </td>
                              {/* Status */}
                              <td style={{ padding: '5px 6px' }}>
                                <select
                                  style={{ width: '100%', fontSize: 11, border: `1.5px solid ${s.color}`, borderRadius: 5, padding: '3px 5px', background: s.bg, color: s.color, fontWeight: 700, cursor: 'pointer' }}
                                  value={conf.status_conf}
                                  onChange={e => setRecConferencia(prev => prev.map((c, i) => i === idx
                                    ? { ...c, status_conf: e.target.value as ConfStatus }
                                    : c))}
                                >
                                  {(Object.entries(CONF_STATUS) as [ConfStatus, typeof CONF_STATUS[ConfStatus]][]).map(([k, v]) => (
                                    <option key={k} value={k}>{v.emoji} {v.label}</option>
                                  ))}
                                </select>
                              </td>
                              {/* Lote */}
                              <td style={{ padding: '5px 6px' }}>
                                <input
                                  style={{ width: '100%', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 5px', background: 'var(--surface,#fff)', color: 'var(--text)' }}
                                  placeholder="Lote..."
                                  value={conf.numero_lote}
                                  onChange={e => setRecConferencia(prev => prev.map((c, i) => i === idx
                                    ? { ...c, numero_lote: e.target.value }
                                    : c))}
                                />
                              </td>
                              {/* Validade */}
                              <td style={{ padding: '5px 6px' }}>
                                <input
                                  type="date"
                                  style={{ width: '100%', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 5px', background: 'var(--surface,#fff)', color: 'var(--text)' }}
                                  value={conf.data_validade}
                                  onChange={e => setRecConferencia(prev => prev.map((c, i) => i === idx
                                    ? { ...c, data_validade: e.target.value }
                                    : c))}
                                />
                              </td>
                              {/* Obs */}
                              <td style={{ padding: '5px 6px' }}>
                                <input
                                  style={{ width: '100%', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 5px', background: 'var(--surface,#fff)', color: 'var(--text)' }}
                                  placeholder="Observação..."
                                  value={conf.obs}
                                  onChange={e => setRecConferencia(prev => prev.map((c, i) => i === idx
                                    ? { ...c, obs: e.target.value }
                                    : c))}
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Legenda de status */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {(Object.entries(CONF_STATUS) as [ConfStatus, typeof CONF_STATUS[ConfStatus]][]).map(([k, v]) => (
                    <span key={k} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: v.bg, color: v.color, fontWeight: 600 }}>
                      {v.emoji} {v.label}{v.entraEstoque ? ' ✓estoque' : ''}
                    </span>
                  ))}
                </div>
              </div>

              {/* ── Divergências gerais ── */}
              <div className="fg">
                <label className="fl" style={{ fontSize: 12, fontWeight: 700 }}>Divergências gerais</label>
                <textarea className="inp" rows={2} style={{ resize: 'vertical', fontSize: 12 }}
                  placeholder="Ex: NF com valor divergente, embalagem danificada no produto X..."
                  value={recDivergencias} onChange={e => setRecDivergencias(e.target.value)} />
              </div>

              {/* ── Observações gerais ── */}
              <div className="fg">
                <label className="fl" style={{ fontSize: 12, fontWeight: 700 }}>Observações gerais</label>
                <textarea className="inp" rows={2} style={{ resize: 'vertical', fontSize: 12 }}
                  placeholder="Outras informações relevantes sobre o recebimento..."
                  value={recObsGeral} onChange={e => setRecObsGeral(e.target.value)} />
              </div>

              {/* ── Custo médio ── */}
              <div style={{ padding: '10px 12px', background: 'var(--bordo-bg)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <input type="checkbox" id="recAtualizarPrecos" checked={recAtualizarPrecos}
                  onChange={e => setRecAtualizarPrecos(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer', marginTop: 2 }} />
                <label htmlFor="recAtualizarPrecos" style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Atualizar custo médio ponderado no estoque
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, marginTop: 2 }}>
                    Recalcula automaticamente: (qtd_atual × preço_atual + qtd_nova × preço_pago) ÷ (qtd_atual + qtd_nova).
                    Também salva lote e validade no produto.
                  </div>
                </label>
              </div>

              {/* ── Resumo ── */}
              {recConferencia.length > 0 && (() => {
                const ok   = recConferencia.filter(c => c.status_conf === 'correto').length
                const parc = recConferencia.filter(c => c.status_conf === 'ruptura_parcial').length
                const prob = recConferencia.filter(c => !CONF_STATUS[c.status_conf].entraEstoque).length
                return (
                  <div style={{ padding: '10px 14px', borderRadius: 8, background: prob > 0 ? '#FFFBEB' : '#F0FDF4', border: `1px solid ${prob > 0 ? '#FCD34D' : '#86EFAC'}`, fontSize: 12 }}>
                    <strong>Resumo:</strong>{' '}
                    {ok > 0 && <span style={{ color: '#15803D', marginRight: 8 }}>✅ {ok} correto(s)</span>}
                    {parc > 0 && <span style={{ color: '#EA580C', marginRight: 8 }}>🔶 {parc} ruptura parcial</span>}
                    {prob > 0 && <span style={{ color: '#DC2626' }}>⚠️ {prob} com problema(s)</span>}
                    {' — '}
                    <strong>{recConferencia.filter(c => CONF_STATUS[c.status_conf].entraEstoque).length} de {recConferencia.length}</strong> itens entrarão no estoque.
                  </div>
                )
              })()}
            </div>

            <div className="mft" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn bo bsm" onClick={() => setShowRecebimento(false)}>Cancelar</button>
              <button className="btn bsm" onClick={confirmarRecebimento}
                disabled={!recNome.trim() || !recData || recConferencia.length === 0}
                style={{ background: 'var(--success)', color: '#fff', border: 'none' }}>
                <CheckCircle2 size={13} /> Confirmar Recebimento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de recebimento confirmado */}
      {recToast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--success)', color: '#fff', borderRadius: 10,
          padding: '10px 22px', fontSize: 13, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(0,0,0,.18)', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle2 size={15} />
          Recebimento confirmado!
          {recEstoqueQtd > 0 && ` ${recEstoqueQtd} item(ns) lançado(s) no estoque automaticamente.`}
        </div>
      )}

      {/* Toast Agente — alerta de variação de preço */}
      {alertaPreco && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: alertaPreco.nivel === 'alto' ? '#DC2626' : '#B45309',
          color: '#fff', borderRadius: 10, padding: '11px 22px', fontSize: 12, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(0,0,0,.25)', zIndex: 9998,
          display: 'flex', alignItems: 'center', gap: 8, maxWidth: 380, textAlign: 'center',
          cursor: 'pointer',
        }} onClick={() => document.dispatchEvent(new CustomEvent('amore-nav', { detail: 'compras-agente' }))}>
          <AlertTriangle size={15} />
          <div>
            <div>⚠️ Alerta de Preço — {alertaPreco.produto}</div>
            <div style={{ fontWeight: 400, fontSize: 11, marginTop: 2 }}>
              Variação de +{alertaPreco.variacao.toFixed(1)}% detectada · Clique para abrir o Agente
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Disparar Cotação ─────────────────────────────── */}
      {showDispararCot && (
        <div className="ov open" onClick={e => e.target === e.currentTarget && setShowDispararCot(false)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">📨 Disparar Cotação — {lista.titulo}</span>
              <button className="mx" onClick={() => setShowDispararCot(false)}>✕</button>
            </div>
            <div className="mbd" style={{ maxHeight: '78vh', overflowY: 'auto' }}>

              {/* Preview da mensagem */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--bordo)', marginBottom: 8 }}>📋 Mensagem que será enviada ({itens.filter(i => i.status === 'pendente').length} itens pendentes)</div>
                <pre style={{ background: 'var(--cream,#fdf8f0)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 11.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)', margin: 0 }}>
                  {txtCotacaoWA(itens.filter(i => i.status === 'pendente'))}
                </pre>
              </div>

              {/* Lista de fornecedores */}
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--bordo)', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🏭 Selecione os fornecedores</span>
                {!loadingFornBD && fornecedoresBD.length > 0 && (
                  <button className="btn bo bsm" style={{ fontSize: 11 }}
                    onClick={() => setFornsSelecionados(
                      fornsSelecionados.size === fornecedoresBD.length
                        ? new Set()
                        : new Set(fornecedoresBD.map(f => f.id))
                    )}>
                    {fornsSelecionados.size === fornecedoresBD.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                )}
              </div>

              {loadingFornBD && <div style={{ padding: 20, textAlign: 'center' }}><Loader size={18} className="spin" /></div>}

              {!loadingFornBD && fornecedoresBD.length === 0 && (
                <div style={{ padding: '16px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
                  <strong>Nenhum fornecedor cadastrado.</strong> Acesse <em>Compras &amp; Estoque → Fornecedores</em> para cadastrar seus fornecedores com telefone/WhatsApp.
                </div>
              )}

              {!loadingFornBD && fornecedoresBD.map(f => {
                const temWA  = !!(f.whatsapp || f.telefone || f.contato_telefone)
                const temMail = !!(f.email || f.contato_email)
                const isSel  = fornsSelecionados.has(f.id)
                const itensPend = itens.filter(i => i.status === 'pendente')
                return (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderBottom: '1px solid var(--border)', borderRadius: isSel ? 8 : 0,
                    background: isSel ? 'var(--cream,#fdf8f0)' : 'transparent',
                    transition: 'background .15s',
                  }}>
                    {/* Checkbox */}
                    <input type="checkbox" checked={isSel} style={{ width: 16, height: 16, accentColor: 'var(--bordo)', flexShrink: 0, cursor: 'pointer' }}
                      onChange={() => {
                        setFornsSelecionados(prev => {
                          const n = new Set(prev)
                          isSel ? n.delete(f.id) : n.add(f.id)
                          return n
                        })
                      }} />
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{f.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                        {(f.whatsapp || f.telefone) && <span>📱 {f.whatsapp || f.telefone}</span>}
                        {f.contato_nome && <span>👤 {f.contato_nome}</span>}
                        {(f.email || f.contato_email) && <span>📧 {f.email || f.contato_email}</span>}
                        {!temWA && !temMail && <span style={{ color: '#EF4444' }}>⚠ Sem contato cadastrado</span>}
                      </div>
                    </div>
                    {/* Botões individuais */}
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      <button
                        className="btn bo bsm"
                        disabled={!temWA || itensPend.length === 0}
                        onClick={() => { dispararWA(f, itensPend); setFornsSelecionados(prev => new Set([...prev, f.id])) }}
                        title={temWA ? `Enviar WhatsApp para ${f.whatsapp || f.telefone}` : 'Sem WhatsApp cadastrado'}
                        style={{ color: temWA ? '#16A34A' : 'var(--muted)', borderColor: temWA ? '#16A34A' : 'var(--border)', fontSize: 11, padding: '4px 8px' }}>
                        📱 WA
                      </button>
                      <button
                        className="btn bo bsm"
                        disabled={!temMail || itensPend.length === 0}
                        onClick={() => { dispararEmail(f, itensPend); setFornsSelecionados(prev => new Set([...prev, f.id])) }}
                        title={temMail ? `Enviar e-mail para ${f.email || f.contato_email}` : 'Sem e-mail cadastrado'}
                        style={{ color: temMail ? '#2563EB' : 'var(--muted)', borderColor: temMail ? '#2563EB' : 'var(--border)', fontSize: 11, padding: '4px 8px' }}>
                        📧 Email
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mft" style={{ justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {fornsSelecionados.size > 0 ? `${fornsSelecionados.size} fornecedor(es) selecionado(s)` : 'Nenhum selecionado'}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn bo bsm" onClick={() => setShowDispararCot(false)}>Fechar</button>
                <button className="btn bsm"
                  disabled={fornsSelecionados.size === 0 || itens.filter(i => i.status === 'pendente').length === 0}
                  onClick={dispararParaTodos}
                  style={{ background: '#16A34A', color: '#fff', border: 'none', fontWeight: 700 }}>
                  📱 Disparar WA para todos ({fornsSelecionados.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Resposta do Fornecedor ──────────────────────── */}
      {showResposta && (
        <div className="ov open" onClick={e => e.target === e.currentTarget && setShowResposta(false)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">📥 Registrar Resposta do Fornecedor</span>
              <button className="mx" onClick={() => setShowResposta(false)}>✕</button>
            </div>
            <div className="mbd" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {/* Dados do fornecedor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="fg" style={{ gridColumn: '1/-1' }}>
                  <label className="fl">Nome do Fornecedor <span className="rq">*</span></label>
                  <input className="inp" value={formResposta.fornecedor} autoFocus
                    onChange={e => setFormResposta(f => ({ ...f, fornecedor: e.target.value }))}
                    placeholder="Ex: Distribuidora São João" />
                </div>
                <div className="fg">
                  <label className="fl">Prazo de Entrega</label>
                  <input className="inp" value={formResposta.prazo}
                    onChange={e => setFormResposta(f => ({ ...f, prazo: e.target.value }))}
                    placeholder="Ex: 2 dias úteis" />
                </div>
                <div className="fg">
                  <label className="fl">Rota de Entrega</label>
                  <input className="inp" value={formResposta.rota}
                    onChange={e => setFormResposta(f => ({ ...f, rota: e.target.value }))}
                    placeholder="Ex: Terças e quintas" />
                </div>
                <div className="fg">
                  <label className="fl">Forma de Pagamento</label>
                  <input className="inp" value={formResposta.forma_pgto}
                    onChange={e => setFormResposta(f => ({ ...f, forma_pgto: e.target.value }))}
                    placeholder="Ex: Boleto 30 dias, PIX à vista" />
                </div>
                <div className="fg">
                  <label className="fl">Observações</label>
                  <input className="inp" value={formResposta.obs}
                    onChange={e => setFormResposta(f => ({ ...f, obs: e.target.value }))}
                    placeholder="Descontos, condições especiais..." />
                </div>
              </div>

              {/* Tabela de itens com preços */}
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: 'var(--bordo)' }}>
                📋 Preços por Item (preencha o que o fornecedor cotou)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bordo)', color: '#fff' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Produto</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, width: 130 }}>Marca</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, width: 100 }}>Preço Unit.</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, width: 100 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formResposta.itens.map((ri, idx) => {
                      const itemOriginal = itens.find(i => i.produto_nome === ri.produto_nome)
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--surface2, #fafafa)' }}>
                          <td style={{ padding: '5px 10px', fontWeight: 600, fontSize: 12 }}>
                            {ri.produto_nome}
                            {itemOriginal && <span style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 4 }}>({itemOriginal.quantidade} {itemOriginal.unidade})</span>}
                          </td>
                          <td style={{ padding: '5px 6px' }}>
                            <input style={{ width: '100%', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', background: 'var(--surface, #fff)', color: 'var(--text)' }}
                              value={ri.marca} placeholder="Marca..."
                              onChange={e => setFormResposta(f => ({
                                ...f,
                                itens: f.itens.map((it, i) => i === idx ? { ...it, marca: e.target.value } : it),
                              }))} />
                          </td>
                          <td style={{ padding: '5px 6px' }}>
                            <input type="number" min={0} step={0.01} style={{ width: '100%', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', background: 'var(--surface, #fff)', color: 'var(--text)', textAlign: 'right' }}
                              value={ri.preco_unit} placeholder="0,00"
                              onChange={e => {
                                const pu = e.target.value
                                const qtd = itemOriginal?.quantidade || 1
                                const total = (parseFloat(pu) * qtd).toFixed(2)
                                setFormResposta(f => ({
                                  ...f,
                                  itens: f.itens.map((it, i) => i === idx ? { ...it, preco_unit: pu, preco_total: isNaN(parseFloat(pu)) ? '' : total } : it),
                                }))
                              }} />
                          </td>
                          <td style={{ padding: '5px 6px', fontWeight: 700, textAlign: 'right', color: ri.preco_total ? 'var(--success)' : 'var(--muted)', fontSize: 12 }}>
                            {ri.preco_total ? `R$ ${parseFloat(ri.preco_total).toFixed(2).replace('.', ',')}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bordo-bg)', fontWeight: 800 }}>
                      <td colSpan={3} style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12 }}>Total Geral:</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 13, color: 'var(--bordo)' }}>
                        {(() => {
                          const total = formResposta.itens.reduce((s, it) => s + (parseFloat(it.preco_total) || 0), 0)
                          return total > 0 ? `R$ ${total.toFixed(2).replace('.', ',')}` : '—'
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
                💡 Os preços serão aplicados automaticamente nos itens da lista ao salvar.
              </p>
            </div>
            <div className="mft" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn bo bsm" onClick={() => setShowResposta(false)}>Cancelar</button>
              <button className="btn bsm" onClick={salvarResposta}
                disabled={!formResposta.fornecedor.trim()}
                style={{ background: '#7C3AED', color: '#fff', border: 'none' }}>
                ✅ Salvar Resposta e Aplicar Preços
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Cotação Formal / Pedido de Compra ────────────── */}
      {showCotacaoFormal && (
        <div className="ov open" onClick={e => e.target === e.currentTarget && setShowCotacaoFormal(false)}>
          <div className="modal" style={{ maxWidth: 820 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">📄 Pedido Formal de Cotação — {lista.titulo}</span>
              <button className="mx" onClick={() => setShowCotacaoFormal(false)}>✕</button>
            </div>
            <div className="mbd" style={{ maxHeight: '78vh', overflowY: 'auto' }}>

              {/* Dados da Empresa */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--bordo)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  🏢 Dados da Empresa (Comprador)
                  <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--muted)' }}>— salvo automaticamente</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>Nome da empresa</label>
                    <input className="inp" style={{ fontSize: 12 }} value={empresaCfg.nome}
                      onChange={e => { const v = e.target.value; setEmpresaCfg(c => { const n = { ...c, nome: v }; localStorage.setItem(EMPRESA_KEY, JSON.stringify(n)); return n }) }} />
                  </div>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>CNPJ</label>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="00.000.000/0001-00" value={empresaCfg.cnpj}
                      onChange={e => { const v = e.target.value; setEmpresaCfg(c => { const n = { ...c, cnpj: v }; localStorage.setItem(EMPRESA_KEY, JSON.stringify(n)); return n }) }} />
                  </div>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>Telefone</label>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="(00) 00000-0000" value={empresaCfg.telefone}
                      onChange={e => { const v = e.target.value; setEmpresaCfg(c => { const n = { ...c, telefone: v }; localStorage.setItem(EMPRESA_KEY, JSON.stringify(n)); return n }) }} />
                  </div>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>Responsável</label>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="Nome do comprador" value={empresaCfg.responsavel}
                      onChange={e => { const v = e.target.value; setEmpresaCfg(c => { const n = { ...c, responsavel: v }; localStorage.setItem(EMPRESA_KEY, JSON.stringify(n)); return n }) }} />
                  </div>
                  <div className="fg" style={{ gridColumn: '2/-1' }}>
                    <label className="fl" style={{ fontSize: 11 }}>Endereço / Unidade</label>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="Endereço completo ou nome da unidade" value={empresaCfg.unidade}
                      onChange={e => { const v = e.target.value; setEmpresaCfg(c => { const n = { ...c, unidade: v }; localStorage.setItem(EMPRESA_KEY, JSON.stringify(n)); return n }) }} />
                  </div>
                </div>
              </div>

              {/* Dados do Fornecedor */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--bordo)', marginBottom: 10 }}>🏭 Dados do Fornecedor</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>Nome do fornecedor</label>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="Razão social ou fantasia" value={fornCotFormal.nome}
                      onChange={e => setFornCotFormal(f => ({ ...f, nome: e.target.value }))} />
                  </div>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>CNPJ</label>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="00.000.000/0001-00" value={fornCotFormal.cnpj}
                      onChange={e => setFornCotFormal(f => ({ ...f, cnpj: e.target.value }))} />
                  </div>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>Telefone / WhatsApp</label>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="(00) 00000-0000" value={fornCotFormal.telefone}
                      onChange={e => setFornCotFormal(f => ({ ...f, telefone: e.target.value }))} />
                  </div>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>E-mail</label>
                    <input className="inp" type="email" style={{ fontSize: 12 }} value={fornCotFormal.email}
                      onChange={e => setFornCotFormal(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>Vendedor / Contato</label>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="Nome do representante" value={fornCotFormal.vendedor}
                      onChange={e => setFornCotFormal(f => ({ ...f, vendedor: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Itens solicitados */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--bordo)', marginBottom: 8 }}>📋 Itens Solicitados</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bordo)', color: '#fff' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Produto</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', width: 90 }}>Marca</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', width: 60 }}>Qtd</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', width: 55 }}>Un</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Descrição / Especificação</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Marcas similares aceitas</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', width: 90 }}>Preço est.</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', width: 90 }}>Total est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itensCotFormal.length === 0 ? (
                        <tr><td colSpan={8} style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Nenhum item pendente na lista</td></tr>
                      ) : itensCotFormal.map((it, idx) => {
                        const total = it.preco_unit && it.qtd ? (parseFloat(it.preco_unit) * parseFloat(it.qtd)).toFixed(2) : ''
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : '#fafafa' }}>
                            <td style={{ padding: '4px 8px', fontWeight: 700 }}>{it.produto_nome}</td>
                            <td style={{ padding: '4px 6px' }}>
                              <input style={{ width: '100%', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface,#fff)', color: 'var(--text)' }}
                                value={it.marca} placeholder="—"
                                onChange={e => setItensCotFormal(prev => prev.map((x, i) => i === idx ? { ...x, marca: e.target.value } : x))} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <input type="number" min={0} style={{ width: '100%', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface,#fff)', color: 'var(--text)', textAlign: 'right' }}
                                value={it.qtd}
                                onChange={e => setItensCotFormal(prev => prev.map((x, i) => i === idx ? { ...x, qtd: e.target.value } : x))} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <select style={{ width: '100%', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface,#fff)', color: 'var(--text)' }}
                                value={it.unidade}
                                onChange={e => setItensCotFormal(prev => prev.map((x, i) => i === idx ? { ...x, unidade: e.target.value } : x))}>
                                {UNIDADES.map(u => <option key={u}>{u}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <input style={{ width: '100%', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface,#fff)', color: 'var(--text)' }}
                                value={it.descricao} placeholder="Especificação técnica..."
                                onChange={e => setItensCotFormal(prev => prev.map((x, i) => i === idx ? { ...x, descricao: e.target.value } : x))} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <input style={{ width: '100%', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface,#fff)', color: 'var(--text)' }}
                                value={it.marcas_similares} placeholder="Ex: Marca A, Marca B"
                                onChange={e => setItensCotFormal(prev => prev.map((x, i) => i === idx ? { ...x, marcas_similares: e.target.value } : x))} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <input type="number" min={0} step={0.01} style={{ width: '100%', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px', background: 'var(--surface,#fff)', color: 'var(--text)', textAlign: 'right' }}
                                value={it.preco_unit} placeholder="0,00"
                                onChange={e => setItensCotFormal(prev => prev.map((x, i) => i === idx ? { ...x, preco_unit: e.target.value } : x))} />
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: total ? 'var(--success)' : 'var(--muted)', fontSize: 11 }}>
                              {total ? `R$ ${parseFloat(total).toFixed(2).replace('.', ',')}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                      {/* Total geral estimado */}
                      {itensCotFormal.length > 0 && (
                        <tr style={{ background: 'var(--bordo-bg)', fontWeight: 800 }}>
                          <td colSpan={7} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 12 }}>Total Estimado:</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 13, color: 'var(--bordo)' }}>
                            {(() => {
                              const tot = itensCotFormal.reduce((s, it) => s + (parseFloat(it.preco_unit) * parseFloat(it.qtd) || 0), 0)
                              return tot > 0 ? `R$ ${tot.toFixed(2).replace('.', ',')}` : '—'
                            })()}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Condições Gerais */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--bordo)', marginBottom: 10 }}>📝 Condições Gerais</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>Prazo de entrega necessário</label>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="Ex: até 2 dias úteis" value={cotCondicoes.prazo_entrega}
                      onChange={e => setCotCondicoes(c => ({ ...c, prazo_entrega: e.target.value }))} />
                  </div>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>Forma de pagamento</label>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="Ex: Boleto 28 dias, PIX" value={cotCondicoes.forma_pgto}
                      onChange={e => setCotCondicoes(c => ({ ...c, forma_pgto: e.target.value }))} />
                  </div>
                  <div className="fg">
                    <label className="fl" style={{ fontSize: 11 }}>Validade desta cotação</label>
                    <input className="inp" type="date" style={{ fontSize: 12 }} value={cotCondicoes.validade}
                      onChange={e => setCotCondicoes(c => ({ ...c, validade: e.target.value }))} />
                  </div>
                  <div className="fg" style={{ gridColumn: '1/-1' }}>
                    <label className="fl" style={{ fontSize: 11 }}>Observações / Instruções ao fornecedor</label>
                    <textarea className="inp" rows={2} style={{ resize: 'vertical', fontSize: 12 }} placeholder="Informações adicionais..."
                      value={cotCondicoes.obs} onChange={e => setCotCondicoes(c => ({ ...c, obs: e.target.value }))} />
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                💡 Os dados da empresa são salvos automaticamente para próximos pedidos. Use "Imprimir" para gerar PDF.
              </p>
            </div>
            <div className="mft" style={{ justifyContent: 'space-between' }}>
              <button className="btn bo bsm" onClick={() => setShowCotacaoFormal(false)}>Fechar</button>
              <button className="btn bp" onClick={() => window.print()}>
                🖨️ Imprimir / Salvar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Comparativo de Fornecedores ──────────────────── */}
      {showComparativo && respostas.length >= 1 && (
        <div className="ov open" onClick={e => e.target === e.currentTarget && setShowComparativo(false)}>
          <div className="modal" style={{ maxWidth: 780 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">📊 Comparativo de Fornecedores — {lista.titulo}</span>
              <button className="mx" onClick={() => setShowComparativo(false)}>✕</button>
            </div>
            <div className="mbd" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              {/* Tabela comparativa */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bordo)', color: '#fff' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Produto</th>
                      {respostas.map(r => (
                        <th key={r.id} style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.fornecedor}
                          <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{new Date(r.data).toLocaleDateString('pt-BR')}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Linhas por produto */}
                    {(() => {
                      const todosProdutos = [...new Set(respostas.flatMap(r => r.itens.map(i => i.produto_nome)))]
                      return todosProdutos.map((prod, idx) => {
                        const precos = respostas.map(r => {
                          const it = r.itens.find(i => i.produto_nome === prod)
                          return it?.preco_unit ? parseFloat(it.preco_unit) : null
                        })
                        const minPreco = Math.min(...precos.filter(p => p !== null) as number[])
                        return (
                          <tr key={prod} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : '#fafafa' }}>
                            <td style={{ padding: '6px 12px', fontWeight: 600 }}>{prod}</td>
                            {respostas.map((r, ri) => {
                              const it = r.itens.find(i => i.produto_nome === prod)
                              const preco = it?.preco_unit ? parseFloat(it.preco_unit) : null
                              const isMenor = preco !== null && preco === minPreco && precos.filter(p => p !== null).length > 1
                              return (
                                <td key={ri} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: isMenor ? 800 : 400, color: isMenor ? 'var(--success)' : 'var(--text)' }}>
                                  {preco !== null ? (
                                    <>
                                      {isMenor && '✓ '}
                                      R$ {preco.toFixed(2).replace('.', ',')}
                                      {it?.marca && <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>{it.marca}</div>}
                                    </>
                                  ) : '—'}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })
                    })()}
                    {/* Linha de totais */}
                    <tr style={{ background: 'var(--bordo-bg)', fontWeight: 800 }}>
                      <td style={{ padding: '8px 12px', fontSize: 12 }}>💰 Total Geral</td>
                      {respostas.map(r => {
                        const total = r.itens.reduce((s, it) => s + (parseFloat(it.preco_total) || 0), 0)
                        return (
                          <td key={r.id} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, color: 'var(--bordo)' }}>
                            {total > 0 ? `R$ ${total.toFixed(2).replace('.', ',')}` : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Cards por fornecedor com botão Selecionar Vencedor */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(respostas.length, 3)}, 1fr)`, gap: 12, marginTop: 16 }}>
                {respostas.map(r => {
                  const totalForn = r.itens.reduce((s, it) => s + (parseFloat(it.preco_total) || 0), 0)
                  // menor total entre todos os fornecedores
                  const todosTotal = respostas.map(rf => rf.itens.reduce((s, it) => s + (parseFloat(it.preco_total) || 0), 0))
                  const minTotal = Math.min(...todosTotal.filter(t => t > 0))
                  const isVencedor = totalForn > 0 && totalForn === minTotal && todosTotal.filter(t => t > 0).length > 1
                  return (
                    <div key={r.id} className="card" style={{ padding: '12px 14px', fontSize: 11, border: isVencedor ? '2px solid var(--success)' : undefined }}>
                      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: isVencedor ? 'var(--success)' : 'var(--bordo)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isVencedor && '🏆 '}{r.fornecedor}
                      </div>
                      {r.prazo && <div><strong>Prazo:</strong> {r.prazo}</div>}
                      {r.rota && <div><strong>Rota:</strong> {r.rota}</div>}
                      {r.forma_pgto && <div><strong>Pgto:</strong> {r.forma_pgto}</div>}
                      {totalForn > 0 && <div style={{ marginTop: 6, fontWeight: 700 }}>Total: R$ {totalForn.toFixed(2).replace('.', ',')}</div>}
                      {r.obs && <div style={{ marginTop: 6, color: 'var(--muted)' }}>{r.obs}</div>}
                      <button
                        className="btn bsm"
                        style={{ marginTop: 10, width: '100%', background: isVencedor ? 'var(--success)' : 'var(--bordo)', color: '#fff', border: 'none', fontWeight: 700 }}
                        onClick={async () => {
                          // Aplica preços deste fornecedor em todos os itens da lista
                          const updates = r.itens.filter(ri => ri.preco_unit)
                          let count = 0
                          for (const ri of updates) {
                            const item = itens.find(i => i.produto_nome === ri.produto_nome)
                            if (!item) continue
                            await updateComprasListaItem(item.id, {
                              preco_real: parseFloat(ri.preco_unit) || null,
                              fornecedor_nome: r.fornecedor,
                            }).then(updated => {
                              setItens(prev => prev.map(i => i.id === updated.id ? updated : i))
                              count++
                            }).catch(() => {})
                          }
                          setShowComparativo(false)
                          alert(`✅ ${r.fornecedor} selecionado! Preços aplicados em ${count} item(ns).`)
                        }}>
                        ✅ Selecionar como Fornecedor
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mft" style={{ justifyContent: 'flex-end' }}>
              <button className="btn bp" onClick={() => setShowComparativo(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
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
  const { loja } = useLoja()

  const [listas, setListas] = useState<ComprasLista[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'nova' | 'detalhe'>('lista')
  const [listaAtiva, setListaAtiva] = useState<ComprasLista | null>(null)
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebounce(busca, 280)
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
    .filter(l => l.titulo.toLowerCase().includes(buscaDebounced.toLowerCase()))
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

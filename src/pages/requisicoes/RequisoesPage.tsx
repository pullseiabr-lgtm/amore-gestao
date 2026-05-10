import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, Trash2, ChevronLeft, Loader, Check, X,
  Edit3, Package, Calendar, TrendingDown, Send,
  ClipboardList, CheckCircle2, XCircle, Clock, ShoppingCart,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchRequisicoes, insertRequisicao, updateRequisicao, deleteRequisicao,
  fetchRequisicaoItens, insertRequisicaoItem, updateRequisicaoItem, deleteRequisicaoItem,
  fetchRequisicaoCotacoes, insertRequisicaoCotacao, updateRequisicaoCotacao,
  fetchCotacaoItens, upsertCotacaoItens,
  fetchFornecedores,
} from '../../lib/db'
import type { Requisicao, RequisicaoItem, RequisicaoCotacao, RequisicaoCotacaoItem, ReqStatus, CotacaoStatus } from '../../types/database'

// ── Constantes ───────────────────────────────────────────────

const CATEGORIAS = [
  'Açaí', 'Bebidas', 'Carnes', 'Condimentos', 'Descartáveis', 'Embalagens',
  'Frutas', 'Grãos', 'Higiene', 'Laticínios', 'Legumes', 'Limpeza',
  'Proteínas', 'Sorvetes', 'Temperos', 'Outros',
]

const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'fd', 'sc', 'lt', 'dz']

const STATUS_REQ: Record<ReqStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  rascunho:   { label: 'Rascunho',    color: '#92400E', bg: '#FEF3C7', icon: <Edit3 size={11} /> },
  enviada:    { label: 'Enviada',     color: '#1D4ED8', bg: '#DBEAFE', icon: <Send size={11} /> },
  em_cotacao: { label: 'Em Cotação',  color: '#7C3AED', bg: '#EDE9FE', icon: <TrendingDown size={11} /> },
  aprovada:   { label: 'Aprovada',    color: '#059669', bg: '#D1FAE5', icon: <CheckCircle2 size={11} /> },
  concluida:  { label: 'Concluída',   color: '#065F46', bg: '#A7F3D0', icon: <CheckCircle2 size={11} /> },
  cancelada:  { label: 'Cancelada',   color: '#DC2626', bg: '#FEE2E2', icon: <XCircle size={11} /> },
}

const STATUS_COT: Record<CotacaoStatus, { label: string; color: string; bg: string }> = {
  aguardando: { label: 'Aguardando', color: '#92400E', bg: '#FEF3C7' },
  respondida: { label: 'Respondida', color: '#1D4ED8', bg: '#DBEAFE' },
  aprovada:   { label: 'Aprovada',   color: '#059669', bg: '#D1FAE5' },
  rejeitada:  { label: 'Rejeitada',  color: '#DC2626', bg: '#FEE2E2' },
}

const fmtR$ = (v: number | null | undefined) =>
  v == null || v === 0 ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`

const fmtData = (d: string | null) => {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

// ── Badge ────────────────────────────────────────────────────

function ReqBadge({ status }: { status: ReqStatus }) {
  const s = STATUS_REQ[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
      background: s.bg, color: s.color,
    }}>{s.icon} {s.label}</span>
  )
}

function CotBadge({ status }: { status: CotacaoStatus }) {
  const s = STATUS_COT[status]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  )
}

// ── Nova Requisição ──────────────────────────────────────────

function NovaRequisicaoForm({ loja, onSalvo, onCancelar }: {
  loja: string
  onSalvo: (r: Requisicao) => void
  onCancelar: () => void
}) {
  const { user } = useAuth()
  const [titulo, setTitulo] = useState('')
  const [dataNec, setDataNec] = useState('')
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const salvar = async () => {
    if (!titulo.trim()) { setErr('Título obrigatório'); return }
    setSaving(true)
    try {
      const req = await insertRequisicao({
        loja, titulo: titulo.trim(),
        data_necessidade: dataNec || null,
        status: 'rascunho',
        total_estimado: 0, total_final: 0,
        observacoes: obs.trim() || null,
        created_by: user?.name || null,
      })
      onSalvo(req)
    } catch (e) { console.error(e); setErr('Erro ao salvar') }
    setSaving(false)
  }

  return (
    <div className="card" style={{ maxWidth: 540, padding: 28 }}>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800 }}>
        <ClipboardList size={16} style={{ display: 'inline', marginRight: 6 }} />
        Nova Requisição de Compra
      </h3>

      <div className="fg" style={{ marginBottom: 14 }}>
        <label className="fl">Título / Descrição <span className="rq">*</span></label>
        <input
          className={`inp${err ? ' err' : ''}`}
          value={titulo}
          onChange={e => { setTitulo(e.target.value); setErr('') }}
          placeholder="Ex: Reposição açaí semana 20/05"
          autoFocus
        />
        {err && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{err}</span>}
      </div>

      <div className="fg" style={{ marginBottom: 14 }}>
        <label className="fl">Data necessária</label>
        <input className="inp" type="date" value={dataNec} onChange={e => setDataNec(e.target.value)} />
      </div>

      <div className="fg" style={{ marginBottom: 20 }}>
        <label className="fl">Observações</label>
        <textarea className="inp" rows={2} value={obs} onChange={e => setObs(e.target.value)}
          placeholder="Urgência, observações especiais..." style={{ resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn bo" onClick={onCancelar}>Cancelar</button>
        <button className="btn bp" onClick={salvar} disabled={saving}>
          {saving ? <><Loader size={12} className="spin" /> Criando...</> : <><Plus size={12} /> Criar Requisição</>}
        </button>
      </div>
    </div>
  )
}

// ── Linha de item ─────────────────────────────────────────────

function ItemRow({ item, onUpdate, onDelete }: {
  item: RequisicaoItem
  onUpdate: (id: string, patch: Partial<RequisicaoItem>) => void
  onDelete: (id: string) => void
}) {
  const [ed, setEd] = useState(false)
  const [f, setF] = useState({ ...item })

  const salvar = () => {
    onUpdate(item.id, {
      produto_nome: f.produto_nome, categoria: f.categoria,
      quantidade: f.quantidade, unidade: f.unidade,
      preco_referencia: f.preco_referencia, observacoes: f.observacoes,
    })
    setEd(false)
  }

  if (ed) return (
    <tr style={{ background: 'var(--bordo-bg)' }}>
      <td><input className="inp" style={{ minWidth: 140, fontSize: 12 }} value={f.produto_nome} onChange={e => setF(p => ({ ...p, produto_nome: e.target.value }))} /></td>
      <td><select className="sel" style={{ fontSize: 12 }} value={f.categoria ?? ''} onChange={e => setF(p => ({ ...p, categoria: e.target.value || null }))}>
        <option value="">—</option>
        {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
      </select></td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <input className="inp" type="number" min={0} style={{ width: 64, fontSize: 12 }} value={f.quantidade} onChange={e => setF(p => ({ ...p, quantidade: parseFloat(e.target.value) || 0 }))} />
          <select className="sel" style={{ width: 56, fontSize: 12 }} value={f.unidade} onChange={e => setF(p => ({ ...p, unidade: e.target.value }))}>
            {UNIDADES.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </td>
      <td><input className="inp" type="number" min={0} step={0.01} style={{ width: 88, fontSize: 12 }} placeholder="R$ ref." value={f.preco_referencia ?? ''} onChange={e => setF(p => ({ ...p, preco_referencia: parseFloat(e.target.value) || null }))} /></td>
      <td style={{ color: 'var(--muted)', fontSize: 11 }}>—</td>
      <td><div style={{ display: 'flex', gap: 4 }}>
        <button className="ib" onClick={salvar} style={{ color: 'var(--success)' }}><Check size={13} /></button>
        <button className="ib" onClick={() => { setF({ ...item }); setEd(false) }}><X size={13} /></button>
      </div></td>
    </tr>
  )

  return (
    <tr>
      <td><strong style={{ fontSize: 12 }}>{item.produto_nome}</strong>{item.observacoes && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{item.observacoes}</div>}</td>
      <td>{item.categoria ? <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: 'var(--bordo-bg)', color: 'var(--bordo)', fontWeight: 600 }}>{item.categoria}</span> : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}</td>
      <td style={{ fontSize: 12, fontWeight: 600 }}>{item.quantidade} {item.unidade}</td>
      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtR$(item.preco_referencia)}</td>
      <td style={{ fontSize: 12, fontWeight: item.preco_cotado ? 700 : 400, color: item.preco_cotado ? 'var(--success)' : 'var(--muted)' }}>{fmtR$(item.preco_cotado)}</td>
      <td><div className="ab" style={{ gap: 4 }}>
        <button className="ib" onClick={() => setEd(true)}><Edit3 size={12} /></button>
        <button className="ib rd" onClick={() => onDelete(item.id)}><Trash2 size={12} /></button>
      </div></td>
    </tr>
  )
}

// ── Add item rápido ──────────────────────────────────────────

function AddItemRow({ reqId, onAdd }: { reqId: string; onAdd: (i: RequisicaoItem) => void }) {
  const E = { produto_nome: '', categoria: '', quantidade: 1, unidade: 'un', preco_referencia: '' }
  const [f, setF] = useState(E)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const add = async () => {
    if (!f.produto_nome.trim()) return
    setSaving(true)
    try {
      const item = await insertRequisicaoItem({
        requisicao_id: reqId,
        produto_nome: f.produto_nome.trim().toUpperCase(),
        categoria: f.categoria || null,
        quantidade: Number(f.quantidade) || 1,
        unidade: f.unidade,
        preco_referencia: f.preco_referencia ? Number(f.preco_referencia) : null,
        preco_cotado: null, preco_final: null,
        fornecedor_nome: null,
        status: 'pendente', observacoes: null,
      })
      onAdd(item)
      setF(E)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  if (!open) return (
    <tr><td colSpan={6} style={{ padding: '8px 12px' }}>
      <button className="btn bo bsm" onClick={() => setOpen(true)} style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }}>
        <Plus size={11} /> Adicionar item
      </button>
    </td></tr>
  )

  return (
    <tr style={{ background: 'var(--bordo-bg)' }}>
      <td><input className="inp" style={{ minWidth: 140, fontSize: 12 }} value={f.produto_nome} onChange={e => setF(p => ({ ...p, produto_nome: e.target.value }))} placeholder="Produto *" autoFocus onKeyDown={e => e.key === 'Enter' && add()} /></td>
      <td><select className="sel" style={{ fontSize: 12 }} value={f.categoria} onChange={e => setF(p => ({ ...p, categoria: e.target.value }))}>
        <option value="">Categoria</option>
        {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
      </select></td>
      <td><div style={{ display: 'flex', gap: 4 }}>
        <input className="inp" type="number" style={{ width: 64, fontSize: 12 }} value={f.quantidade} onChange={e => setF(p => ({ ...p, quantidade: e.target.value as unknown as number }))} />
        <select className="sel" style={{ width: 56, fontSize: 12 }} value={f.unidade} onChange={e => setF(p => ({ ...p, unidade: e.target.value }))}>
          {UNIDADES.map(u => <option key={u}>{u}</option>)}
        </select>
      </div></td>
      <td><input className="inp" type="number" style={{ width: 88, fontSize: 12 }} placeholder="R$ ref." value={f.preco_referencia} onChange={e => setF(p => ({ ...p, preco_referencia: e.target.value }))} /></td>
      <td />
      <td><div style={{ display: 'flex', gap: 4 }}>
        <button className="ib" onClick={add} disabled={saving} style={{ color: 'var(--success)' }}>{saving ? <Loader size={12} className="spin" /> : <Check size={13} />}</button>
        <button className="ib" onClick={() => { setF(E); setOpen(false) }}><X size={13} /></button>
      </div></td>
    </tr>
  )
}

// ── Mapa de Cotação ──────────────────────────────────────────

function MapaCotacao({ requisicao, itens, cotacoes, onCotacoesChange }: {
  requisicao: Requisicao
  itens: RequisicaoItem[]
  cotacoes: RequisicaoCotacao[]
  onCotacoesChange: () => void
}) {
  const [novoForn, setNovoForn] = useState('')
  const [cotItens, setCotItens] = useState<Record<string, RequisicaoCotacaoItem[]>>({})
  const [fornecedores, setFornecedores] = useState<string[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetchFornecedores().then(fs => setFornecedores(fs.map(f => f.nome))).catch(() => {})
    cotacoes.forEach(cot => {
      fetchCotacaoItens(cot.id).then(is => setCotItens(prev => ({ ...prev, [cot.id]: is }))).catch(() => {})
    })
  }, [cotacoes])

  const addFornecedor = async () => {
    if (!novoForn.trim()) return
    try {
      await insertRequisicaoCotacao({
        requisicao_id: requisicao.id,
        fornecedor_nome: novoForn.trim().toUpperCase(),
        status: 'aguardando', total: null, prazo_entrega: null, observacoes: null,
      })
      setNovoForn('')
      onCotacoesChange()
    } catch (e) { console.error(e) }
  }

  const updatePreco = (cotId: string, itemId: string, preco: string) => {
    setCotItens(prev => {
      const lista = prev[cotId] ?? []
      const existe = lista.find(i => i.item_id === itemId)
      if (existe) return { ...prev, [cotId]: lista.map(i => i.item_id === itemId ? { ...i, preco_unitario: parseFloat(preco) || null } : i) }
      return { ...prev, [cotId]: [...lista, { cotacao_id: cotId, item_id: itemId, preco_unitario: parseFloat(preco) || null, disponivel: true, observacoes: null } as RequisicaoCotacaoItem] }
    })
  }

  const salvarCotacao = async (cot: RequisicaoCotacao) => {
    setSaving(cot.id)
    try {
      const lista = (cotItens[cot.id] ?? []).filter(i => i.item_id)
      if (lista.length > 0) await upsertCotacaoItens(lista.map(i => ({ cotacao_id: cot.id, item_id: i.item_id, preco_unitario: i.preco_unitario, disponivel: i.disponivel, observacoes: i.observacoes })))
      const total = lista.reduce((s, i) => {
        const item = itens.find(it => it.id === i.item_id)
        return s + (i.preco_unitario ?? 0) * (item?.quantidade ?? 1)
      }, 0)
      await updateRequisicaoCotacao(cot.id, { status: 'respondida', total })
      onCotacoesChange()
    } catch (e) { console.error(e) }
    setSaving(null)
  }

  const aprovarCotacao = async (cot: RequisicaoCotacao) => {
    setSaving(cot.id)
    try {
      // Marca esta como aprovada, outras como rejeitadas
      await Promise.all(cotacoes.map(c =>
        updateRequisicaoCotacao(c.id, { status: c.id === cot.id ? 'aprovada' : 'rejeitada' })
      ))
      // Atualiza itens com preços e fornecedor vencedor
      const lista = cotItens[cot.id] ?? []
      await Promise.all(itens.map(item => {
        const ci = lista.find(i => i.item_id === item.id)
        return updateRequisicaoItem(item.id, {
          preco_cotado: ci?.preco_unitario ?? null,
          preco_final: ci?.preco_unitario ?? null,
          fornecedor_nome: cot.fornecedor_nome,
          status: ci?.preco_unitario ? 'aprovado' : 'pendente',
        })
      }))
      const totalFinal = lista.reduce((s, i) => {
        const item = itens.find(it => it.id === i.item_id)
        return s + (i.preco_unitario ?? 0) * (item?.quantidade ?? 1)
      }, 0)
      await updateRequisicao(requisicao.id, { status: 'aprovada', total_final: totalFinal })
      onCotacoesChange()
    } catch (e) { console.error(e) }
    setSaving(null)
  }

  // Calcula menor preço por item
  const menorPreco = (itemId: string): number | null => {
    const precos = cotacoes
      .map(cot => cotItens[cot.id]?.find(i => i.item_id === itemId)?.preco_unitario)
      .filter((p): p is number => p != null && p > 0)
    return precos.length ? Math.min(...precos) : null
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-hd">
        <span className="card-tt"><TrendingDown size={14} style={{ display: 'inline', marginRight: 4 }} />Mapa de Cotação</span>
      </div>

      {/* Adicionar fornecedor */}
      <div style={{ padding: '10px 15px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input
          className="inp" style={{ flex: 1, maxWidth: 300 }}
          value={novoForn}
          onChange={e => setNovoForn(e.target.value)}
          placeholder="Nome do fornecedor..."
          list="forn-mapa"
          onKeyDown={e => e.key === 'Enter' && addFornecedor()}
        />
        <datalist id="forn-mapa">{fornecedores.map(f => <option key={f} value={f} />)}</datalist>
        <button className="btn bp bsm" onClick={addFornecedor}><Plus size={11} /> Adicionar Fornecedor</button>
      </div>

      {cotacoes.length === 0 ? (
        <div className="empty" style={{ padding: '32px 0' }}>
          <TrendingDown size={32} style={{ opacity: .3 }} />
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>Adicione fornecedores para comparar preços</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ background: 'var(--bordo-bg)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--bordo)', width: 200, borderBottom: '1px solid var(--border)' }}>
                  Produto
                </th>
                {cotacoes.map(cot => (
                  <th key={cot.id} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, borderBottom: '1px solid var(--border)', minWidth: 160 }}>
                    <div>{cot.fornecedor_nome}</div>
                    <div style={{ marginTop: 4 }}><CotBadge status={cot.status} /></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map(item => {
                const menor = menorPreco(item.id)
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{item.produto_nome}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{item.quantidade} {item.unidade}</div>
                    </td>
                    {cotacoes.map(cot => {
                      const ci = (cotItens[cot.id] ?? []).find(i => i.item_id === item.id)
                      const preco = ci?.preco_unitario ?? null
                      const isMelhor = preco != null && menor != null && preco === menor
                      const total = preco != null ? preco * item.quantidade : null
                      return (
                        <td key={cot.id} style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {cot.status === 'aguardando' ? (
                            <input
                              className="inp" type="number" min={0} step={0.01}
                              style={{ width: 90, fontSize: 12, textAlign: 'center' }}
                              placeholder="R$ unit."
                              value={preco ?? ''}
                              onChange={e => updatePreco(cot.id, item.id, e.target.value)}
                            />
                          ) : (
                            <div style={{
                              fontWeight: isMelhor ? 800 : 400,
                              color: isMelhor ? 'var(--success)' : 'var(--text)',
                              fontSize: 13,
                            }}>
                              {preco != null ? `R$ ${preco.toFixed(2).replace('.', ',')}` : <span style={{ color: 'var(--muted)' }}>—</span>}
                              {total != null && <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>Total: R$ {total.toFixed(2).replace('.', ',')}</div>}
                              {isMelhor && <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>✓ Menor preço</div>}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* Linha de total */}
              <tr style={{ background: 'var(--bordo-bg)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800 }}>TOTAL GERAL</td>
                {cotacoes.map(cot => {
                  const lista = cotItens[cot.id] ?? []
                  const total = lista.reduce((s, i) => {
                    const item = itens.find(it => it.id === i.item_id)
                    return s + (i.preco_unitario ?? 0) * (item?.quantidade ?? 1)
                  }, 0)
                  return (
                    <td key={cot.id} style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--bordo)' }}>
                        {total > 0 ? `R$ ${total.toFixed(2).replace('.', ',')}` : '—'}
                      </div>
                      {cot.status === 'aguardando' && (
                        <button className="btn bp bsm" style={{ marginTop: 6, fontSize: 10 }} onClick={() => salvarCotacao(cot)} disabled={saving === cot.id}>
                          {saving === cot.id ? <Loader size={10} className="spin" /> : <><Check size={10} /> Salvar</>}
                        </button>
                      )}
                      {cot.status === 'respondida' && requisicao.status !== 'aprovada' && (
                        <button
                          className="btn bsm"
                          style={{ marginTop: 6, fontSize: 10, background: 'var(--success)', color: '#fff' }}
                          onClick={() => aprovarCotacao(cot)}
                          disabled={saving === cot.id}
                        >
                          {saving === cot.id ? <Loader size={10} className="spin" /> : '✓ Aprovar'}
                        </button>
                      )}
                      {cot.status === 'aprovada' && (
                        <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700, marginTop: 4 }}>✓ APROVADA</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Detalhe da Requisição ────────────────────────────────────

function RequisicaoDetalhe({ req, onVoltar, onAtualizar }: {
  req: Requisicao
  onVoltar: () => void
  onAtualizar: (r: Requisicao) => void
}) {
  const [itens, setItens] = useState<RequisicaoItem[]>([])
  const [cotacoes, setCotacoes] = useState<RequisicaoCotacao[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'itens' | 'cotacao'>('itens')
  const [editandoTitulo, setEditandoTitulo] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState(req.titulo)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [is, cs] = await Promise.all([fetchRequisicaoItens(req.id), fetchRequisicaoCotacoes(req.id)])
      setItens(is)
      setCotacoes(cs)
    } catch {}
    setLoading(false)
  }, [req.id])

  useEffect(() => { load() }, [load])

  const recalcTotais = useCallback(async (is: RequisicaoItem[]) => {
    const est = is.reduce((s, i) => s + (i.preco_referencia ?? 0) * i.quantidade, 0)
    const upd = await updateRequisicao(req.id, { total_estimado: est })
    onAtualizar(upd)
  }, [req.id, onAtualizar])

  const handleUpdate = async (id: string, patch: Partial<RequisicaoItem>) => {
    const upd = await updateRequisicaoItem(id, patch)
    const novos = itens.map(i => i.id === id ? upd : i)
    setItens(novos)
    await recalcTotais(novos)
  }

  const handleDelete = async (id: string) => {
    await deleteRequisicaoItem(id)
    const novos = itens.filter(i => i.id !== id)
    setItens(novos)
    await recalcTotais(novos)
  }

  const handleAdd = async (item: RequisicaoItem) => {
    const novos = [...itens, item]
    setItens(novos)
    await recalcTotais(novos)
  }

  const salvarTitulo = async () => {
    if (!novoTitulo.trim()) return
    const upd = await updateRequisicao(req.id, { titulo: novoTitulo.trim() })
    onAtualizar(upd)
    setEditandoTitulo(false)
  }

  const mudarStatus = async (status: ReqStatus) => {
    const upd = await updateRequisicao(req.id, { status })
    onAtualizar(upd)
  }

  const enviarParaCotacao = async () => {
    if (itens.length === 0) return
    const upd = await updateRequisicao(req.id, { status: 'enviada' })
    onAtualizar(upd)
    setTab('cotacao')
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <button className="btn bo bsm" onClick={onVoltar}><ChevronLeft size={12} /> Requisições</button>
        <div style={{ flex: 1 }}>
          {editandoTitulo ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="inp" style={{ fontSize: 18, fontWeight: 800, maxWidth: 400 }}
                value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && salvarTitulo()} autoFocus />
              <button className="ib" onClick={salvarTitulo} style={{ color: 'var(--success)' }}><Check size={14} /></button>
              <button className="ib" onClick={() => { setNovoTitulo(req.titulo); setEditandoTitulo(false) }}><X size={14} /></button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginRight: 4 }}>#{req.numero}</span>
                {req.titulo}
              </h2>
              <button className="ib" onClick={() => setEditandoTitulo(true)}><Edit3 size={13} /></button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <ReqBadge status={req.status} />
            {req.data_necessidade && (
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} /> Necessário em: {fmtData(req.data_necessidade)}
              </span>
            )}
            {req.created_by && <span style={{ fontSize: 11, color: 'var(--muted)' }}>por {req.created_by}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {req.status === 'rascunho' && itens.length > 0 && (
            <button className="btn bp bsm" onClick={enviarParaCotacao}><Send size={11} /> Enviar para Cotação</button>
          )}
          <select className="sel" value={req.status} onChange={e => mudarStatus(e.target.value as ReqStatus)} style={{ fontSize: 12 }}>
            {(Object.keys(STATUS_REQ) as ReqStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_REQ[s].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Itens Solicitados</div>
          <div className="kpi-val">{itens.length}</div>
          <div className="kpi-sub">produtos na requisição</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Total Estimado</div>
          <div className="kpi-val" style={{ fontSize: 20 }}>{fmtR$(req.total_estimado)}</div>
          <div className="kpi-sub">baseado em preços de referência</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--success)' }} />
          <div className="kpi-lbl">Total Final</div>
          <div className="kpi-val" style={{ fontSize: 20, color: req.total_final > 0 ? 'var(--text)' : 'var(--muted)' }}>
            {req.total_final > 0 ? fmtR$(req.total_final) : '—'}
          </div>
          <div className="kpi-sub">cotação aprovada</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Fornecedores</div>
          <div className="kpi-val">{cotacoes.length}</div>
          <div className="kpi-sub">no mapa de cotação</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
        {[
          { id: 'itens', label: 'Itens Solicitados', icon: <Package size={13} /> },
          { id: 'cotacao', label: 'Mapa de Cotação', icon: <TrendingDown size={13} /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', border: 'none', cursor: 'pointer', borderRadius: '8px 8px 0 0',
              background: tab === t.id ? '#fff' : 'var(--bordo-bg)',
              color: tab === t.id ? 'var(--bordo)' : 'var(--text)',
              fontWeight: tab === t.id ? 800 : 400, fontSize: 13,
              borderBottom: tab === t.id ? '2px solid var(--bordo)' : '2px solid transparent',
            }}
          >{t.icon} {t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="empty"><Loader size={22} className="spin" /></div>
      ) : tab === 'itens' ? (
        <div className="card">
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Produto</th><th>Categoria</th><th>Qtd</th>
                  <th>Preço Ref.</th><th>Preço Cotado</th><th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)' }}>Nenhum item ainda</td></tr>
                )}
                {itens.map(item => (
                  <ItemRow key={item.id} item={item} onUpdate={handleUpdate} onDelete={handleDelete} />
                ))}
                <AddItemRow reqId={req.id} onAdd={handleAdd} />
              </tbody>
            </table>
          </div>
          {itens.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', fontSize: 12, color: 'var(--muted)' }}>
              Estimado: <strong style={{ marginLeft: 4 }}>{fmtR$(req.total_estimado)}</strong>
            </div>
          )}
        </div>
      ) : (
        <MapaCotacao
          requisicao={req}
          itens={itens}
          cotacoes={cotacoes}
          onCotacoesChange={() => { load(); onAtualizar({ ...req }); }}
        />
      )}
    </div>
  )
}

// ── Página Principal ─────────────────────────────────────────

export default function RequisoesPage() {
  const { user } = useAuth()
  const loja = user?.loja && user.loja !== 'Todas' ? user.loja : 'AMORE COSTA DOURADA'

  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'nova' | 'detalhe'>('lista')
  const [ativa, setAtiva] = useState<Requisicao | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | ReqStatus>('todos')
  const [confirmDelete, setConfirmDelete] = useState<Requisicao | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRequisicoes(await fetchRequisicoes(loja)) } catch {}
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const filtradas = requisicoes
    .filter(r => r.titulo.toLowerCase().includes(busca.toLowerCase()))
    .filter(r => filtroStatus === 'todos' || r.status === filtroStatus)

  const handleNova = (r: Requisicao) => { setRequisicoes(prev => [r, ...prev]); setAtiva(r); setView('detalhe') }
  const handleAtualizar = (r: Requisicao) => { setRequisicoes(prev => prev.map(x => x.id === r.id ? r : x)); setAtiva(r) }

  const confirmarDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteRequisicao(confirmDelete.id)
      setRequisicoes(prev => prev.filter(r => r.id !== confirmDelete.id))
      setConfirmDelete(null)
    } catch {}
  }

  if (view === 'detalhe' && ativa) return (
    <RequisicaoDetalhe req={ativa} onVoltar={() => { setView('lista'); load() }} onAtualizar={handleAtualizar} />
  )

  if (view === 'nova') return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>Nova Requisição de Compra</h2>
      <NovaRequisicaoForm loja={loja} onSalvo={handleNova} onCancelar={() => setView('lista')} />
    </div>
  )

  // KPIs
  const abertas   = requisicoes.filter(r => ['rascunho','enviada','em_cotacao'].includes(r.status)).length
  const aprovadas = requisicoes.filter(r => r.status === 'aprovada').length
  const totalFinal = requisicoes.filter(r => r.total_final > 0).reduce((s, r) => s + r.total_final, 0)
  const economia   = requisicoes.reduce((s, r) => s + Math.max(0, r.total_estimado - r.total_final), 0)

  return (
    <div>
      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Total de Requisições</div>
          <div className="kpi-val">{requisicoes.length}</div>
          <div className="kpi-sub">{loja}</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Em Aberto</div>
          <div className="kpi-val" style={{ color: abertas > 0 ? 'var(--warning)' : 'var(--muted)' }}>{abertas}</div>
          <div className="kpi-sub">rascunho / enviada / cotação</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--success)' }} />
          <div className="kpi-lbl">Total em Compras</div>
          <div className="kpi-val" style={{ fontSize: totalFinal > 9999 ? 18 : 24 }}>{fmtR$(totalFinal)}</div>
          <div className="kpi-sub">{aprovadas} aprovadas</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Economia Gerada</div>
          <div className="kpi-val" style={{ fontSize: 20, color: economia > 0 ? 'var(--success)' : 'var(--muted)' }}>
            {economia > 0 ? fmtR$(economia) : '—'}
          </div>
          <div className="kpi-sub">vs. preço de referência</div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        <div className="card-hd">
          <span className="card-tt"><ClipboardList size={14} style={{ display: 'inline', marginRight: 4 }} />Requisições de Compra</span>
          <button className="btn bp bsm" onClick={() => setView('nova')}><Plus size={11} /> Nova Requisição</button>
        </div>

        <div style={{ padding: '10px 15px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="sw-wrap" style={{ flex: 1, minWidth: 200 }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input className="srch" placeholder="Buscar requisição..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <select className="flt" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)}>
            <option value="todos">Todos os status</option>
            {(Object.keys(STATUS_REQ) as ReqStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_REQ[s].label}</option>
            ))}
          </select>
          {(busca || filtroStatus !== 'todos') && (
            <button className="btn bo bsm" onClick={() => { setBusca(''); setFiltroStatus('todos') }}>Limpar</button>
          )}
        </div>

        {loading ? (
          <div className="empty"><Loader size={24} className="spin" /></div>
        ) : filtradas.length === 0 ? (
          <div className="empty" style={{ padding: '48px 0' }}>
            <ShoppingCart size={40} style={{ opacity: .3 }} />
            <div style={{ marginTop: 10, fontWeight: 600 }}>
              {requisicoes.length === 0 ? 'Nenhuma requisição criada' : 'Nenhuma requisição encontrada'}
            </div>
            {requisicoes.length === 0 && (
              <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={() => setView('nova')}>
                <Plus size={11} /> Criar primeira requisição
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Requisição</th><th>Data Necessária</th>
                    <th>Itens</th><th>Estimado</th><th>Final</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(r => (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => { setAtiva(r); setView('detalhe') }}>
                      <td style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>#{r.numero}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bordo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bordo)', flexShrink: 0 }}>
                            <ClipboardList size={14} />
                          </div>
                          <div>
                            <strong style={{ fontSize: 12 }}>{r.titulo}</strong>
                            {r.created_by && <div style={{ fontSize: 10, color: 'var(--muted)' }}>por {r.created_by}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={10} /> {fmtData(r.data_necessidade)}
                        </div>
                      </td>
                      <td style={{ fontSize: 12, textAlign: 'center' }}>—</td>
                      <td style={{ fontSize: 12 }}>{fmtR$(r.total_estimado)}</td>
                      <td style={{ fontSize: 12, fontWeight: r.total_final > 0 ? 700 : 400, color: r.total_final > 0 ? 'var(--success)' : 'var(--muted)' }}>
                        {r.total_final > 0 ? fmtR$(r.total_final) : '—'}
                      </td>
                      <td><ReqBadge status={r.status} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="ab" style={{ gap: 4 }}>
                          <button className="ib" onClick={() => { setAtiva(r); setView('detalhe') }}><ChevronRight size={12} /></button>
                          <button className="ib rd" onClick={() => setConfirmDelete(r)}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 15px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
              {filtradas.length} de {requisicoes.length} requisições exibidas
            </div>
          </>
        )}
      </div>

      {/* Modal exclusão */}
      {confirmDelete && (
        <div className="ov open" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Excluir Requisição</span><button className="mx" onClick={() => setConfirmDelete(null)}>✕</button></div>
            <div className="mbd">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={18} style={{ color: 'var(--danger)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>#{confirmDelete.numero} {confirmDelete.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Todos os itens e cotações serão removidos.</div>
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

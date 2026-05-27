import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  CheckCircle, Circle, Plus, Trash2, Edit3, Check, X,
  ChefHat, ClipboardList, Package, AlertTriangle, Camera,
  Save, RefreshCw, Star, Clock, DollarSign, User,
  BarChart2, TrendingUp, TrendingDown, Flame,
} from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchCozinhaChecklists, insertCozinhaChecklist, updateCozinhaChecklist, deleteCozinhaChecklist,
  fetchCozinhaProducao,   insertCozinhaProducao,   updateCozinhaProducao,   deleteCozinhaProducao,
  fetchCozinhaDesperdicio, insertCozinhaDesperdicio, deleteCozinhaDesperdicio,
  fetchCozinhaFichas,    insertCozinhaFicha,       updateCozinhaFicha,      deleteCozinhaFicha,
  fetchCozinhaSolicitacoes, insertCozinhaSolicitacao, updateCozinhaSolicitacao, deleteCozinhaSolicitacao,
} from '../../lib/db'

// ── Tipos locais ─────────────────────────────────────────────

type Setor = 'cozinha' | 'salao' | 'limpeza' | 'estoque' | 'abertura' | 'fechamento'

interface CheckItem { id: string; txt: string; ok: boolean; foto?: string; obrigatorio: boolean }
interface Checklist { id: string; titulo: string; loja: string; setor: Setor; itens: CheckItem[] }

interface ProducaoItem {
  id: string; prato: string; qtd: string; loja: string
  solicitante: string; executor: string; hora: string
  status: 'pendente' | 'em_preparo' | 'concluido'
  prioridade: 'urgente' | 'normal' | 'programado'
  hora_inicio: string | null
  hora_fim: string | null
  praca: string | null
  obs: string
  created_at?: string
}

interface DespItem {
  id: string; data: string; item: string; qtd: string; unidade: string
  motivo: string; categoria: string; responsavel: string; loja: string; custo: string
}

interface FichaTecnica {
  id: string; nome: string; foto: string
  ingredientes: { desc: string; qtd: string; unidade: string; custo: string }[]
  rendimento: string; tempo_preparo: string; modo_preparo: string
  custo_total: string; margem: string; preco_venda: string
}

interface SolicitacaoItem {
  id: string
  tipo: 'produto' | 'equipamento' | 'utensilio' | 'manutencao' | 'compra_emergencial'
  item: string
  quantidade: string
  urgencia: 'baixa' | 'media' | 'alta' | 'critica'
  responsavel: string
  setor: string
  status: 'solicitado' | 'em_cotacao' | 'aprovado' | 'em_compra' | 'recebido' | 'cancelado'
  obs: string
  data: string
  loja: string
}

// ── Constantes ───────────────────────────────────────────────

const MOTIVOS_DESPERDICIO = [
  'Vencimento', 'Armazenamento Inadequado', 'Produção Excessiva',
  'Erro Operacional', 'Avaria', 'Contaminação', 'Devolução',
]

const CATEGORIAS_DESP = [
  'Perda por Validade', 'Armazenamento Inadequado', 'Produção Excessiva',
  'Erro Operacional', 'Avaria/Dano', 'Contaminação', 'Devolução ao Fornecedor',
]

const SETORES: { value: Setor; label: string }[] = [
  { value: 'cozinha', label: 'Cozinha' },
  { value: 'salao', label: 'Salão' },
  { value: 'limpeza', label: 'Limpeza' },
  { value: 'estoque', label: 'Estoque' },
  { value: 'abertura', label: 'Abertura' },
  { value: 'fechamento', label: 'Fechamento' },
]

const STATUS_PROD = {
  pendente:   { lbl: 'Pendente',   cls: 'bg-y' },
  em_preparo: { lbl: 'Em preparo', cls: 'bg-b' },
  concluido:  { lbl: 'Concluído',  cls: 'bg-g' },
}
const PRIORIDADE_PROD = {
  urgente:    { lbl: '🔴 Urgente',    cor: '#ef4444', order: 0 },
  normal:     { lbl: '🟡 Normal',     cor: '#f59e0b', order: 1 },
  programado: { lbl: '🔵 Programado', cor: '#6366f1', order: 2 },
}
const PRACAS = ['Cozinha Quente', 'Cozinha Fria', 'Confeitaria', 'Açaí', 'Bar', 'Geral']

function elapsedMin(createdAt?: string): number {
  if (!createdAt) return 0
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
}

type Tab = 'checklist' | 'producao' | 'desperdicio' | 'ficha' | 'solicitacoes' | 'performance'

// ── Componente Principal ─────────────────────────────────────

export default function CozinhaPage() {
  const { loja, lojas } = useLoja()
  const lojaReal = loja === 'Todas as Lojas'
    ? lojas.find(l => l !== 'Todas as Lojas') ?? 'Amore CD'
    : loja

  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<Tab>('checklist')
  const [checks, setChecks]         = useState<Checklist[]>([])
  const [producao, setProducao]     = useState<ProducaoItem[]>([])
  const [desperdicio, setDesperdicio] = useState<DespItem[]>([])
  const [fichas, setFichas]         = useState<FichaTecnica[]>([])
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoItem[]>([])

  const lojaQ = loja !== 'Todas as Lojas' ? loja : undefined

  // ── Carregamento inicial ─────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [ch, pr, de, fi, so] = await Promise.all([
        fetchCozinhaChecklists(lojaQ),
        fetchCozinhaProducao(lojaQ),
        fetchCozinhaDesperdicio(lojaQ),
        fetchCozinhaFichas(),
        fetchCozinhaSolicitacoes(lojaQ),
      ])
      setChecks((ch as unknown as Checklist[]) ?? [])
      setProducao((pr as unknown as ProducaoItem[]) ?? [])
      setDesperdicio((de as unknown as DespItem[]) ?? [])
      setFichas((fi as unknown as FichaTecnica[]) ?? [])
      setSolicitacoes((so as unknown as SolicitacaoItem[]) ?? [])
    } catch (e) { console.error('[cozinha] reload error:', e) }
    finally { setLoading(false) }
  }, [lojaQ])

  useEffect(() => { void reload() }, [reload])

  // ── Handlers Checklist ───────────────────────────────────
  const handleAddChecklist = useCallback(async (titulo: string, lojaArg: string, setor: string) => {
    const novo = await insertCozinhaChecklist({ titulo, loja: lojaArg, setor, itens: [] })
    setChecks(prev => [...prev, novo as unknown as Checklist])
  }, [])

  const handleDeleteChecklist = useCallback(async (id: string) => {
    setChecks(prev => prev.filter(c => c.id !== id))
    deleteCozinhaChecklist(id).catch(console.error)
  }, [])

  const handleUpdateItens = useCallback(async (id: string, itens: CheckItem[]) => {
    setChecks(prev => prev.map(c => c.id !== id ? c : { ...c, itens }))
    updateCozinhaChecklist(id, { itens: itens as unknown[] } as never).catch(console.error)
  }, [])

  // ── Handlers Produção ─────────────────────────────────────
  const handleAddProducao = useCallback(async (p: Omit<ProducaoItem, 'id'>) => {
    const novo = await insertCozinhaProducao(p as never)
    setProducao(prev => [novo as unknown as ProducaoItem, ...prev])
  }, [])

  const handleUpdateProducao = useCallback(async (id: string, p: Partial<ProducaoItem>) => {
    setProducao(prev => prev.map(x => x.id !== id ? x : { ...x, ...p }))
    updateCozinhaProducao(id, p as never).catch(console.error)
  }, [])

  const handleDeleteProducao = useCallback(async (id: string) => {
    setProducao(prev => prev.filter(x => x.id !== id))
    deleteCozinhaProducao(id).catch(console.error)
  }, [])

  // ── Handlers Desperdício ──────────────────────────────────
  const handleAddDesperdicio = useCallback(async (d: Omit<DespItem, 'id'>) => {
    const novo = await insertCozinhaDesperdicio(d as never)
    setDesperdicio(prev => [novo as unknown as DespItem, ...prev])
  }, [])

  const handleDeleteDesperdicio = useCallback(async (id: string) => {
    setDesperdicio(prev => prev.filter(x => x.id !== id))
    deleteCozinhaDesperdicio(id).catch(console.error)
  }, [])

  // ── Handlers Fichas ───────────────────────────────────────
  const handleAddFicha = useCallback(async (f: Omit<FichaTecnica, 'id'>) => {
    const novo = await insertCozinhaFicha(f as never)
    setFichas(prev => [novo as unknown as FichaTecnica, ...prev])
  }, [])

  const handleUpdateFicha = useCallback(async (id: string, f: Partial<FichaTecnica>) => {
    setFichas(prev => prev.map(x => x.id !== id ? x : { ...x, ...f }))
    updateCozinhaFicha(id, f as never).catch(console.error)
  }, [])

  const handleDeleteFicha = useCallback(async (id: string) => {
    setFichas(prev => prev.filter(x => x.id !== id))
    deleteCozinhaFicha(id).catch(console.error)
  }, [])

  // ── Handlers Solicitações ─────────────────────────────────
  const handleAddSolicitacao = useCallback(async (s: Omit<SolicitacaoItem, 'id'>) => {
    const novo = await insertCozinhaSolicitacao(s as never)
    setSolicitacoes(prev => [novo as unknown as SolicitacaoItem, ...prev])
  }, [])

  const handleUpdateSolicitacao = useCallback(async (id: string, s: Partial<SolicitacaoItem>) => {
    setSolicitacoes(prev => prev.map(x => x.id !== id ? x : { ...x, ...s }))
    updateCozinhaSolicitacao(id, s as never).catch(console.error)
  }, [])

  const handleDeleteSolicitacao = useCallback(async (id: string) => {
    setSolicitacoes(prev => prev.filter(x => x.id !== id))
    deleteCozinhaSolicitacao(id).catch(console.error)
  }, [])

  // ── KPIs ──────────────────────────────────────────────────
  const totalChecklists = checks.length
  const concluidos = checks.filter(cl => cl.itens.every(it => it.ok)).length
  const prodAndamento = producao.filter(p => p.status === 'em_preparo').length
  const totalDesp = desperdicio.reduce((s, d) => s + parseFloat(d.custo.replace(',', '.') || '0'), 0)
  const totalFichas = fichas.length

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, gap: 10, color: 'var(--muted)' }}>
      <RefreshCw size={18} className="spin" />
      <span style={{ fontSize: 14 }}>Carregando dados da cozinha…</span>
    </div>
  )

  return (
    <div>
      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        {[
          { lbl: 'Checklists Concluídos', val: `${concluidos}/${totalChecklists}`, sub: `${Math.round((concluidos / Math.max(1, totalChecklists)) * 100)}% concluídos`, col: 'var(--success)' },
          { lbl: 'Prod. em Andamento', val: String(prodAndamento), sub: 'itens em preparo', col: 'var(--blue)' },
          { lbl: 'Desperdício Mês', val: `R$ ${totalDesp.toFixed(2).replace('.', ',')}`, sub: 'impacto financeiro', col: 'var(--warning)' },
          { lbl: 'Fichas Técnicas', val: String(totalFichas), sub: 'receitas cadastradas', col: 'var(--teal,#14B8A6)' },
        ].map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-ac" style={{ background: k.col }} />
            <div className="kpi-lbl">{k.lbl}</div>
            <div className="kpi-val">{k.val}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {([
          ['checklist',   '✅ Checklists'],
          ['producao',    '🍳 Produção'],
          ['desperdicio', '🗑️ Desperdício'],
          ['ficha',       '📋 Ficha Técnica'],
          ['solicitacoes','📨 Solicitações'],
          ['performance', '📊 Performance'],
        ] as [Tab, string][]).map(([t, lbl]) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{lbl}</button>
        ))}
      </div>

      {tab === 'checklist' && (
        <ChecklistTab
          checks={checks}
          lojaDefault={lojaReal}
          onAddChecklist={handleAddChecklist}
          onDeleteChecklist={handleDeleteChecklist}
          onUpdateItens={handleUpdateItens}
        />
      )}
      {tab === 'producao' && (
        <ProducaoTab
          producao={producao}
          lojaDefault={lojaReal}
          onAdd={handleAddProducao}
          onUpdate={handleUpdateProducao}
          onDelete={handleDeleteProducao}
        />
      )}
      {tab === 'desperdicio' && (
        <DespedicioTab
          desperdicio={desperdicio}
          lojaDefault={lojaReal}
          onAdd={handleAddDesperdicio}
          onDelete={handleDeleteDesperdicio}
        />
      )}
      {tab === 'ficha' && (
        <FichaTab
          fichas={fichas}
          onAdd={handleAddFicha}
          onUpdate={handleUpdateFicha}
          onDelete={handleDeleteFicha}
        />
      )}
      {tab === 'solicitacoes' && (
        <SolicitacoesTab
          solicitacoes={solicitacoes}
          lojaDefault={lojaReal}
          onAdd={handleAddSolicitacao}
          onUpdate={handleUpdateSolicitacao}
          onDelete={handleDeleteSolicitacao}
        />
      )}
      {tab === 'performance' && (
        <PerformanceTab fichas={fichas} producao={producao} desperdicio={desperdicio} />
      )}
    </div>
  )
}

// ── Tab Checklist ─────────────────────────────────────────────

function ChecklistTab({
  checks,
  lojaDefault,
  onAddChecklist,
  onDeleteChecklist,
  onUpdateItens,
}: {
  checks: Checklist[]
  lojaDefault: string
  onAddChecklist: (titulo: string, loja: string, setor: string) => Promise<void>
  onDeleteChecklist: (id: string) => Promise<void>
  onUpdateItens: (id: string, itens: CheckItem[]) => Promise<void>
}) {
  const [showForm, setShowForm] = useState(false)
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [newItemTxt, setNewItemTxt] = useState('')
  const [responsavel, setResponsavel] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ titulo: '', loja: lojaDefault, setor: 'cozinha' as Setor })
  const [saving, setSaving] = useState(false)

  const addChecklist = async () => {
    if (!form.titulo.trim() || saving) return
    setSaving(true)
    try {
      await onAddChecklist(form.titulo.trim(), form.loja, form.setor)
      setForm({ titulo: '', loja: lojaDefault, setor: 'cozinha' })
      setShowForm(false)
    } finally { setSaving(false) }
  }

  const toggle = (clId: string, itId: string) => {
    const cl = checks.find(c => c.id === clId)
    if (!cl) return
    const newItens = cl.itens.map(it => it.id !== itId ? it : { ...it, ok: !it.ok })
    onUpdateItens(clId, newItens)
  }

  const addItem = (clId: string) => {
    if (!newItemTxt.trim()) return
    const cl = checks.find(c => c.id === clId)
    if (!cl) return
    const newItens = [...cl.itens, { id: `i_${Date.now()}`, txt: newItemTxt.trim(), ok: false, obrigatorio: false }]
    onUpdateItens(clId, newItens)
    setNewItemTxt('')
    setEditId(null)
  }

  const deleteItem = (clId: string, itId: string) => {
    const cl = checks.find(c => c.id === clId)
    if (!cl) return
    onUpdateItens(clId, cl.itens.filter(it => it.id !== itId))
  }

  const toggleObrigatorio = (clId: string, itId: string) => {
    const cl = checks.find(c => c.id === clId)
    if (!cl) return
    const newItens = cl.itens.map(it => it.id !== itId ? it : { ...it, obrigatorio: !it.obrigatorio })
    onUpdateItens(clId, newItens)
  }

  const editItemSave = (clId: string, itId: string, txt: string) => {
    const cl = checks.find(c => c.id === clId)
    if (!cl) return
    onUpdateItens(clId, cl.itens.map(it => it.id !== itId ? it : { ...it, txt }))
    setEditItemId(null)
  }

  const anexarFoto = (clId: string, itId: string) => {
    const cl = checks.find(c => c.id === clId)
    if (!cl) return
    onUpdateItens(clId, cl.itens.map(it => it.id !== itId ? it : { ...it, foto: '📷 Foto anexada' }))
  }

  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn bp bsm" onClick={() => setShowForm(o => !o)}>
          <Plus size={11} /> Novo Checklist
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Novo Checklist</div>
          <div className="g2" style={{ marginBottom: 12 }}>
            <div className="fg">
              <label className="fl">Título <span className="rq">*</span></label>
              <input className="inp" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Abertura Cozinha" />
            </div>
            <div className="fg">
              <label className="fl">Setor</label>
              <select className="sel" value={form.setor} onChange={e => setForm(f => ({ ...f, setor: e.target.value as Setor }))}>
                {SETORES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Loja</label>
              <input className="inp" value={form.loja} onChange={e => setForm(f => ({ ...f, loja: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn bo" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn bp" onClick={addChecklist} disabled={saving}>
              {saving ? <RefreshCw size={11} className="spin" /> : <Check size={11} />} Criar
            </button>
          </div>
        </div>
      )}

      {checks.length === 0 && (
        <div className="card" style={{ padding: '48px 0' }}>
          <div className="empty">
            <ClipboardList size={36} style={{ opacity: 0.3 }} />
            <div style={{ marginTop: 10, fontWeight: 600 }}>Nenhum checklist cadastrado</div>
            <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={() => setShowForm(true)}>
              <Plus size={11} /> Criar primeiro checklist
            </button>
          </div>
        </div>
      )}

      <div className="g11">
        {checks.map(cl => {
          const done = cl.itens.filter(i => i.ok).length
          const setor = SETORES.find(s => s.value === cl.setor)
          return (
            <div className="card" key={cl.id}>
              <div className="card-hd">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="card-tt">{cl.titulo}</span>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: 'var(--bordo-bg)', color: 'var(--bordo)', fontWeight: 700 }}>
                    {setor?.label ?? cl.setor}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{cl.loja}</span>
                  <span className={`badge ${done === cl.itens.length && cl.itens.length > 0 ? 'bg-g' : 'bg-y'}`}>{done}/{cl.itens.length}</span>
                  <button className="ib rd" onClick={() => onDeleteChecklist(cl.id)} title="Excluir checklist"><Trash2 size={12} /></button>
                </div>
              </div>

              {/* Campo Responsável */}
              <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={11} style={{ color: 'var(--muted)' }} />
                <input
                  className="inp" style={{ maxWidth: 200, padding: '3px 8px', fontSize: 11 }}
                  placeholder="Responsável pela verificação..."
                  value={responsavel[cl.id] || ''}
                  onChange={e => setResponsavel(r => ({ ...r, [cl.id]: e.target.value }))}
                />
              </div>

              <div className="card-bd" style={{ padding: 10 }}>
                {cl.itens.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ cursor: 'pointer' }} onClick={() => toggle(cl.id, it.id)}>
                      {it.ok
                        ? <CheckCircle size={16} color="var(--success)" />
                        : <Circle size={16} color="var(--muted)" />}
                    </div>

                    {editItemId === `${cl.id}_${it.id}` ? (
                      <EditItemInline
                        txt={it.txt}
                        onSave={txt => editItemSave(cl.id, it.id, txt)}
                        onCancel={() => setEditItemId(null)}
                      />
                    ) : (
                      <span
                        style={{ fontSize: 13, flex: 1, textDecoration: it.ok ? 'line-through' : 'none', color: it.ok ? 'var(--muted)' : 'var(--text)' }}
                        onClick={() => toggle(cl.id, it.id)}
                      >
                        {it.txt}
                        {it.obrigatorio && <span style={{ marginLeft: 5, fontSize: 9, color: 'var(--danger)', fontWeight: 700 }}>OBR</span>}
                        {it.foto && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--success)' }}>📷</span>}
                      </span>
                    )}

                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      <button className="ib" title={it.obrigatorio ? 'Desmarcar obrigatório' : 'Marcar obrigatório'}
                        style={{ color: it.obrigatorio ? 'var(--danger)' : 'var(--muted)' }}
                        onClick={() => toggleObrigatorio(cl.id, it.id)}>
                        <Star size={11} />
                      </button>
                      <button className="ib" title="Foto" onClick={() => anexarFoto(cl.id, it.id)}>
                        <Camera size={11} />
                      </button>
                      <button className="ib" title="Editar" onClick={() => setEditItemId(`${cl.id}_${it.id}`)}>
                        <Edit3 size={11} />
                      </button>
                      <button className="ib rd" title="Excluir" onClick={() => deleteItem(cl.id, it.id)}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Adicionar item */}
                {editId === cl.id ? (
                  <div style={{ display: 'flex', gap: 6, padding: '8px 4px', alignItems: 'center' }}>
                    <input
                      className="inp" style={{ flex: 1, fontSize: 12 }}
                      placeholder="Descreva o item..."
                      value={newItemTxt}
                      onChange={e => setNewItemTxt(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addItem(cl.id)}
                      autoFocus
                    />
                    <button className="ib" style={{ color: 'var(--success)' }} onClick={() => addItem(cl.id)}><Check size={13} /></button>
                    <button className="ib" onClick={() => { setEditId(null); setNewItemTxt('') }}><X size={13} /></button>
                  </div>
                ) : (
                  <button className="btn bo bsm" style={{ marginTop: 8, width: '100%', justifyContent: 'center', borderStyle: 'dashed', fontSize: 11 }}
                    onClick={() => { setEditId(cl.id); setNewItemTxt('') }}>
                    <Plus size={10} /> Adicionar item
                  </button>
                )}
              </div>

              {/* Assinatura */}
              {done === cl.itens.length && cl.itens.length > 0 && (
                <div style={{ padding: '8px 12px', background: '#D1FAE5', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={13} /> Checklist concluído — {responsavel[cl.id] ? `Responsável: ${responsavel[cl.id]}` : 'Assine abaixo'}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} />
    </div>
  )
}

function EditItemInline({ txt, onSave, onCancel }: { txt: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(txt)
  return (
    <div style={{ display: 'flex', gap: 5, flex: 1 }}>
      <input className="inp" style={{ flex: 1, fontSize: 12 }} value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel() }} autoFocus />
      <button className="ib" style={{ color: 'var(--success)' }} onClick={() => onSave(val)}><Check size={12} /></button>
      <button className="ib" onClick={onCancel}><X size={12} /></button>
    </div>
  )
}

// ── Tab Produção ──────────────────────────────────────────────

function ProducaoTab({
  producao, lojaDefault, onAdd, onUpdate, onDelete,
}: {
  producao: ProducaoItem[]
  lojaDefault: string
  onAdd: (p: Omit<ProducaoItem, 'id'>) => Promise<void>
  onUpdate: (id: string, p: Partial<ProducaoItem>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<ProducaoItem | null>(null)
  const [form, setForm] = useState<Omit<ProducaoItem, 'id'>>({
    prato: '', qtd: '', loja: lojaDefault, solicitante: '', executor: '',
    hora: new Date().toTimeString().slice(0, 5), status: 'pendente',
    prioridade: 'normal', hora_inicio: null, hora_fim: null, praca: null, obs: '',
  })
  const [saving, setSaving] = useState(false)
  const [, tick] = useState(0)

  // Atualiza o timer a cada 30s
  useEffect(() => {
    const iv = setInterval(() => tick(t => t + 1), 30000)
    return () => clearInterval(iv)
  }, [])

  const openNovo = () => {
    setEditItem(null)
    setForm({ prato: '', qtd: '', loja: lojaDefault, solicitante: '', executor: '', hora: new Date().toTimeString().slice(0, 5), status: 'pendente', prioridade: 'normal', hora_inicio: null, hora_fim: null, praca: null, obs: '' })
    setShowModal(true)
  }
  const openEdit = (item: ProducaoItem) => {
    setEditItem(item)
    setForm({ prato: item.prato, qtd: item.qtd, loja: item.loja, solicitante: item.solicitante, executor: item.executor, hora: item.hora, status: item.status, prioridade: item.prioridade || 'normal', hora_inicio: item.hora_inicio, hora_fim: item.hora_fim, praca: item.praca, obs: item.obs })
    setShowModal(true)
  }
  const salvar = async () => {
    if (!form.prato.trim() || saving) return
    setSaving(true)
    try {
      if (editItem) await onUpdate(editItem.id, form)
      else await onAdd(form)
      setShowModal(false)
    } finally { setSaving(false) }
  }
  const ciclarStatus = (id: string) => {
    const item = producao.find(p => p.id === id)
    if (!item) return
    const prox: Record<ProducaoItem['status'], ProducaoItem['status']> = { pendente: 'em_preparo', em_preparo: 'concluido', concluido: 'pendente' }
    const updates: Partial<ProducaoItem> = { status: prox[item.status] }
    if (prox[item.status] === 'em_preparo') updates.hora_inicio = new Date().toISOString()
    if (prox[item.status] === 'concluido')  updates.hora_fim = new Date().toISOString()
    onUpdate(id, updates)
  }

  // Ordenar: urgente primeiro, depois normal, depois programado, dentro de cada grupo por hora
  const sorted = [...producao].sort((a, b) => {
    const oa = PRIORIDADE_PROD[a.prioridade ?? 'normal'].order
    const ob = PRIORIDADE_PROD[b.prioridade ?? 'normal'].order
    if (oa !== ob) return oa - ob
    return (a.hora || '').localeCompare(b.hora || '')
  })

  const pendentes  = sorted.filter(p => p.status !== 'concluido')
  const concluidos = sorted.filter(p => p.status === 'concluido')
  const atrasados  = pendentes.filter(p => elapsedMin(p.created_at) > 45)
  const gargalo    = pendentes.filter(p => p.status === 'pendente').length > 5

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Alertas de gargalo */}
      {(atrasados.length > 0 || gargalo) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {gargalo && (
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13} /> <strong>Gargalo detectado</strong> — {pendentes.filter(p => p.status === 'pendente').length} itens pendentes na fila
            </div>
          )}
          {atrasados.length > 0 && (
            <div style={{ background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={13} /> <strong>{atrasados.length} pedido{atrasados.length > 1 ? 's' : ''} atrasado{atrasados.length > 1 ? 's' : ''}</strong> — em espera há mais de 45 min: {atrasados.map(p => p.prato).join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-hd">
          <span className="card-tt">🍳 Fila de Produção</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''} · {concluidos.length} concluído{concluidos.length !== 1 ? 's' : ''}</span>
            <button className="btn bp bsm" onClick={openNovo}><Plus size={11} /> Registrar</button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="empty" style={{ padding: '40px 0' }}>
            <ChefHat size={36} style={{ opacity: 0.3 }} />
            <div style={{ marginTop: 10, fontWeight: 600 }}>Fila de produção vazia</div>
            <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={openNovo}><Plus size={11} /> Primeiro item</button>
          </div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Prioridade</th><th>Prato / Item</th><th>Qtd</th>
                  <th>Praça</th><th>Executor</th><th>Hora</th><th>Tempo</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => {
                  const st  = STATUS_PROD[p.status]
                  const pr  = PRIORIDADE_PROD[p.prioridade ?? 'normal']
                  const min = elapsedMin(p.created_at)
                  const atrasado = min > 45 && p.status !== 'concluido'
                  return (
                    <tr key={p.id} style={{ background: atrasado ? '#fee2e210' : undefined }}>
                      <td>
                        <span style={{ fontSize: 11, color: pr.cor, fontWeight: 700 }}>{pr.lbl}</span>
                      </td>
                      <td>
                        <strong style={{ fontSize: 12 }}>{p.prato}</strong>
                        {p.obs && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.obs}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>{p.qtd}</td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{p.praca || '—'}</td>
                      <td style={{ fontSize: 11, fontWeight: 600 }}>{p.executor || '—'}</td>
                      <td style={{ fontSize: 11 }}>{p.hora}</td>
                      <td style={{ fontSize: 11 }}>
                        {p.status !== 'concluido' && min > 0 && (
                          <span style={{ color: atrasado ? '#ef4444' : 'var(--muted)', fontWeight: atrasado ? 700 : 400 }}>
                            {atrasado ? '⚠️ ' : ''}{min}min
                          </span>
                        )}
                        {p.status === 'concluido' && p.hora_inicio && p.hora_fim && (
                          <span style={{ color: '#16a34a', fontSize: 11 }}>
                            ✓ {Math.floor((new Date(p.hora_fim).getTime() - new Date(p.hora_inicio).getTime()) / 60000)}min
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${st.cls}`} style={{ cursor: 'pointer' }} onClick={() => ciclarStatus(p.id)} title="Clique para avançar status">
                          {st.lbl}
                        </span>
                      </td>
                      <td>
                        <div className="ab" style={{ gap: 4 }}>
                          <button className="ib" onClick={() => openEdit(p)}><Edit3 size={12} /></button>
                          <button className="ib rd" onClick={() => onDelete(p.id)}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="ov open" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">{editItem ? 'Editar Produção' : 'Registrar Produção'}</span>
              <button className="mx" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="mbd">
              <div className="g2">
                <div className="fg" style={{ gridColumn: '1/-1' }}>
                  <label className="fl">Prato / Item <span className="rq">*</span></label>
                  <input className="inp" value={form.prato} onChange={e => setForm(f => ({ ...f, prato: e.target.value }))} placeholder="Ex: Açaí base 300ml..." autoFocus />
                </div>
                <div className="fg">
                  <label className="fl">Prioridade</label>
                  <select className="sel" value={form.prioridade || 'normal'} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value as ProducaoItem['prioridade'] }))}>
                    <option value="urgente">🔴 Urgente</option>
                    <option value="normal">🟡 Normal</option>
                    <option value="programado">🔵 Programado</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Praça</label>
                  <select className="sel" value={form.praca || ''} onChange={e => setForm(f => ({ ...f, praca: e.target.value || null }))}>
                    <option value="">— Selecione —</option>
                    {PRACAS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Quantidade</label>
                  <input className="inp" value={form.qtd} onChange={e => setForm(f => ({ ...f, qtd: e.target.value }))} placeholder="Ex: 45 kg, 100 porções" />
                </div>
                <div className="fg">
                  <label className="fl">Loja</label>
                  <select className="sel" value={form.loja} onChange={e => setForm(f => ({ ...f, loja: e.target.value }))}>
                    {['Amore CD', 'Amore Paiva', 'Flow CD', 'Todas'].map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Solicitante</label>
                  <input className="inp" value={form.solicitante} onChange={e => setForm(f => ({ ...f, solicitante: e.target.value }))} placeholder="Nome do solicitante" />
                </div>
                <div className="fg">
                  <label className="fl">Executor</label>
                  <input className="inp" value={form.executor} onChange={e => setForm(f => ({ ...f, executor: e.target.value }))} placeholder="Nome do executor" />
                </div>
                <div className="fg">
                  <label className="fl">Horário</label>
                  <input className="inp" type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} />
                </div>
                <div className="fg">
                  <label className="fl">Status</label>
                  <select className="sel" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ProducaoItem['status'] }))}>
                    <option value="pendente">Pendente</option>
                    <option value="em_preparo">Em preparo</option>
                    <option value="concluido">Concluído</option>
                  </select>
                </div>
                <div className="fg" style={{ gridColumn: '1/-1' }}>
                  <label className="fl">Observações</label>
                  <input className="inp" value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Informações adicionais..." />
                </div>
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={saving}>
                {saving ? <RefreshCw size={12} className="spin" /> : <Check size={12} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Desperdício ───────────────────────────────────────────

function DespedicioTab({
  desperdicio,
  lojaDefault,
  onAdd,
  onDelete,
}: {
  desperdicio: DespItem[]
  lojaDefault: string
  onAdd: (d: Omit<DespItem, 'id'>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    item: '', qtd: '', unidade: 'kg', motivo: 'Vencimento', categoria: 'Perda por Validade',
    responsavel: '', loja: lojaDefault, custo: '',
  })

  const totalCusto = desperdicio.reduce((s, d) => s + parseFloat(d.custo.replace(',', '.') || '0'), 0)
  const byCategoria = CATEGORIAS_DESP.map(c => ({
    cat: c,
    count: desperdicio.filter(d => d.categoria === c).length,
    valor: desperdicio.filter(d => d.categoria === c).reduce((s, d) => s + parseFloat(d.custo.replace(',', '.') || '0'), 0),
  })).filter(c => c.count > 0)

  const salvar = async () => {
    if (!form.item.trim() || !form.qtd || saving) return
    setSaving(true)
    try {
      const now = new Date()
      const data = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`
      await onAdd({ data, ...form })
      setShowModal(false)
      setForm({ item: '', qtd: '', unidade: 'kg', motivo: 'Vencimento', categoria: 'Perda por Validade', responsavel: '', loja: lojaDefault, custo: '' })
    } finally { setSaving(false) }
  }

  return (
    <div>
      {/* Resumo por categoria */}
      {byCategoria.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {byCategoria.map(b => (
            <div key={b.cat} style={{ padding: '6px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}>
              <div style={{ fontWeight: 700, color: 'var(--danger)' }}>{b.cat}</div>
              <div style={{ color: 'var(--muted)' }}>{b.count}× · R$ {b.valor.toFixed(2).replace('.', ',')}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-hd">
          <span className="card-tt">🗑️ Registro de Desperdício</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>
              Total: R$ {totalCusto.toFixed(2).replace('.', ',')}
            </span>
            <button className="btn bp bsm" onClick={() => setShowModal(true)}><Plus size={11} /> Registrar</button>
          </div>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Item</th><th>Qtd</th><th>Categoria</th>
                <th>Motivo</th><th>Responsável</th><th>Loja</th><th>Custo</th><th></th>
              </tr>
            </thead>
            <tbody>
              {desperdicio.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>Nenhum desperdício registrado</td></tr>
              )}
              {desperdicio.map(d => (
                <tr key={d.id}>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{d.data}</td>
                  <td><strong style={{ fontSize: 12 }}>{d.item}</strong></td>
                  <td style={{ fontSize: 12 }}>{d.qtd} {d.unidade}</td>
                  <td>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: '#FEE2E2', color: 'var(--danger)', fontWeight: 600 }}>
                      {d.categoria}
                    </span>
                  </td>
                  <td style={{ fontSize: 11 }}>{d.motivo}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{d.responsavel || '—'}</td>
                  <td style={{ fontSize: 11 }}>{d.loja}</td>
                  <td style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 12 }}>R$ {d.custo}</td>
                  <td>
                    <button className="ib rd" onClick={() => onDelete(d.id)}><Trash2 size={11} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="ov open" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Registrar Desperdício</span><button className="mx" onClick={() => setShowModal(false)}>✕</button></div>
            <div className="mbd">
              <div className="g2">
                <div className="fg" style={{ gridColumn: '1/-1' }}>
                  <label className="fl">Item / Produto <span className="rq">*</span></label>
                  <input className="inp" value={form.item} onChange={e => setForm(f => ({ ...f, item: e.target.value }))} placeholder="Nome do produto" autoFocus />
                </div>
                <div className="fg">
                  <label className="fl">Quantidade <span className="rq">*</span></label>
                  <input className="inp" type="number" step="0.001" min={0} value={form.qtd} onChange={e => setForm(f => ({ ...f, qtd: e.target.value }))} />
                </div>
                <div className="fg">
                  <label className="fl">Unidade</label>
                  <select className="sel" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}>
                    {['kg', 'g', 'L', 'ml', 'un', 'pct', 'cx'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Categoria</label>
                  <select className="sel" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                    {CATEGORIAS_DESP.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Motivo específico</label>
                  <select className="sel" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}>
                    {MOTIVOS_DESPERDICIO.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Responsável</label>
                  <input className="inp" value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} placeholder="Nome do responsável" />
                </div>
                <div className="fg">
                  <label className="fl">Loja</label>
                  <select className="sel" value={form.loja} onChange={e => setForm(f => ({ ...f, loja: e.target.value }))}>
                    {['Amore CD', 'Amore Paiva', 'Flow CD'].map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Custo estimado (R$)</label>
                  <input className="inp" type="number" step="0.01" min={0} value={form.custo} onChange={e => setForm(f => ({ ...f, custo: e.target.value }))} placeholder="0,00" />
                </div>
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={saving}>
                {saving ? <RefreshCw size={12} className="spin" /> : <AlertTriangle size={12} />} Registrar Desperdício
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Ficha Técnica ─────────────────────────────────────────

function FichaTab({
  fichas,
  onAdd,
  onUpdate,
  onDelete,
}: {
  fichas: FichaTecnica[]
  onAdd: (f: Omit<FichaTecnica, 'id'>) => Promise<void>
  onUpdate: (id: string, f: Partial<FichaTecnica>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [selecionada, setSelecionada] = useState<FichaTecnica | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editFicha, setEditFicha] = useState<FichaTecnica | null>(null)
  const [saving, setSaving] = useState(false)

  const EMPTY_FICHA: Omit<FichaTecnica, 'id'> = {
    nome: '', foto: '',
    ingredientes: [{ desc: '', qtd: '', unidade: 'g', custo: '' }],
    rendimento: '1 porção', tempo_preparo: '', modo_preparo: '',
    custo_total: '', margem: '', preco_venda: '',
  }
  const [form, setForm] = useState<Omit<FichaTecnica, 'id'>>(EMPTY_FICHA)

  const openNova = () => {
    setEditFicha(null)
    setForm(EMPTY_FICHA)
    setShowForm(true)
  }

  const openEdit = (f: FichaTecnica) => {
    setEditFicha(f)
    setForm({ nome: f.nome, foto: f.foto, ingredientes: [...f.ingredientes], rendimento: f.rendimento, tempo_preparo: f.tempo_preparo, modo_preparo: f.modo_preparo, custo_total: f.custo_total, margem: f.margem, preco_venda: f.preco_venda })
    setShowForm(true)
  }

  const salvar = async () => {
    if (!form.nome.trim() || saving) return
    setSaving(true)
    try {
      const custo = form.ingredientes.reduce((s, i) => s + parseFloat(i.custo.replace(',', '.') || '0'), 0)
      const fichaFinal = {
        ...form,
        custo_total: custo.toFixed(2).replace('.', ','),
        preco_venda: form.preco_venda || (custo / (1 - parseFloat(form.margem || '60') / 100)).toFixed(2).replace('.', ','),
      }
      if (editFicha) {
        await onUpdate(editFicha.id, fichaFinal)
      } else {
        await onAdd(fichaFinal)
      }
      setShowForm(false)
      setSelecionada(null)
    } finally { setSaving(false) }
  }

  const addIngrediente = () => {
    setForm(f => ({ ...f, ingredientes: [...f.ingredientes, { desc: '', qtd: '', unidade: 'g', custo: '' }] }))
  }

  const removeIngrediente = (idx: number) => {
    setForm(f => ({ ...f, ingredientes: f.ingredientes.filter((_, i) => i !== idx) }))
  }

  const setIngrediente = (idx: number, field: string, val: string) => {
    setForm(f => ({ ...f, ingredientes: f.ingredientes.map((it, i) => i !== idx ? it : { ...it, [field]: val }) }))
  }

  const custoFicha = (f: FichaTecnica) => parseFloat(f.custo_total.replace(',', '.') || '0')
  const precoFicha = (f: FichaTecnica) => parseFloat(f.preco_venda.replace(',', '.') || '0')
  const margemCalc = (f: FichaTecnica) => {
    const c = custoFicha(f); const p = precoFicha(f)
    return p > 0 ? ((1 - c / p) * 100).toFixed(1) : '0'
  }

  if (selecionada && !showForm) {
    const ft = fichas.find(f => f.id === selecionada.id) ?? selecionada
    return (
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
          <button className="btn bo bsm" onClick={() => setSelecionada(null)}>← Fichas</button>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: 16, flex: 1 }}>{ft.nome}</h3>
          <button className="btn bo bsm" onClick={() => openEdit(ft)}><Edit3 size={11} /> Editar</button>
          <button className="btn bsm" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => { onDelete(ft.id); setSelecionada(null) }}><Trash2 size={11} /> Excluir</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card">
            <div className="card-hd"><span className="card-tt"><Package size={13} style={{ display: 'inline', marginRight: 4 }} />Ingredientes</span></div>
            <div className="tw">
              <table>
                <thead><tr><th>Ingrediente</th><th>Qtd</th><th>Unidade</th><th>Custo</th></tr></thead>
                <tbody>
                  {ft.ingredientes.map((it, i) => (
                    <tr key={i}>
                      <td><strong style={{ fontSize: 12 }}>{it.desc}</strong></td>
                      <td style={{ fontSize: 12 }}>{it.qtd}</td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{it.unidade}</td>
                      <td style={{ fontSize: 12, fontWeight: 700, color: 'var(--bordo)' }}>R$ {it.custo}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bordo-bg)' }}>
                    <td colSpan={3} style={{ fontWeight: 700, textAlign: 'right', fontSize: 12 }}>Custo Total:</td>
                    <td style={{ fontWeight: 800, color: 'var(--bordo)', fontSize: 13 }}>R$ {ft.custo_total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
              <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--bordo)' }} /><div className="kpi-lbl">Custo Total</div><div className="kpi-val" style={{ fontSize: 18 }}>R$ {ft.custo_total}</div></div>
              <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--success)' }} /><div className="kpi-lbl">Preço de Venda</div><div className="kpi-val" style={{ fontSize: 18, color: 'var(--success)' }}>R$ {ft.preco_venda}</div></div>
              <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--blue)' }} /><div className="kpi-lbl">Margem</div><div className="kpi-val" style={{ fontSize: 18, color: 'var(--blue)' }}>{margemCalc(ft)}%</div></div>
              <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--warning)' }} /><div className="kpi-lbl">Rendimento</div><div className="kpi-val" style={{ fontSize: 14 }}>{ft.rendimento}</div></div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <Clock size={14} style={{ color: 'var(--bordo)', flexShrink: 0, marginTop: 1 }} />
                <div><span style={{ fontWeight: 700, fontSize: 12 }}>Tempo de preparo:</span> <span style={{ fontSize: 12 }}>{ft.tempo_preparo} min</span></div>
              </div>
              {ft.modo_preparo && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Modo de preparo:</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-line', lineHeight: 1.7 }}>{ft.modo_preparo}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn bp bsm" onClick={openNova}><Plus size={11} /> Nova Ficha Técnica</button>
      </div>

      {fichas.length === 0 ? (
        <div className="card" style={{ padding: '48px 0' }}>
          <div className="empty">
            <ChefHat size={40} style={{ opacity: 0.3 }} />
            <div style={{ marginTop: 10, fontWeight: 600 }}>Nenhuma ficha técnica cadastrada</div>
            <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={openNova}><Plus size={11} /> Criar primeira ficha</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
          {fichas.map(f => (
            <div key={f.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setSelecionada(f)}>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{f.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span><Clock size={10} style={{ display: 'inline' }} /> {f.tempo_preparo} min</span>
                      <span><Package size={10} style={{ display: 'inline' }} /> {f.ingredientes.length} ingredientes</span>
                    </div>
                  </div>
                  <div onClick={e => { e.stopPropagation(); onDelete(f.id) }} style={{ cursor: 'pointer', color: 'var(--muted)' }}>
                    <Trash2 size={12} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 12 }}>
                  <div style={{ textAlign: 'center', padding: '5px 4px', background: '#FEE2E2', borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>Custo</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--danger)' }}>R${f.custo_total}</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '5px 4px', background: '#D1FAE5', borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>Venda</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--success)' }}>R${f.preco_venda}</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '5px 4px', background: '#DBEAFE', borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>Margem</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue)' }}>{margemCalc(f)}%</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Ficha */}
      {showForm && (
        <div className="ov open" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">{editFicha ? 'Editar Ficha Técnica' : 'Nova Ficha Técnica'}</span>
              <button className="mx" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="mbd" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="fg" style={{ marginBottom: 14 }}>
                <label className="fl">Nome do prato <span className="rq">*</span></label>
                <input className="inp" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Açaí 300ml Tradicional" autoFocus />
              </div>
              <div className="g2" style={{ marginBottom: 14 }}>
                <div className="fg">
                  <label className="fl"><Clock size={11} style={{ display: 'inline', marginRight: 3 }} />Tempo de preparo (min)</label>
                  <input className="inp" type="number" min={0} value={form.tempo_preparo} onChange={e => setForm(f => ({ ...f, tempo_preparo: e.target.value }))} />
                </div>
                <div className="fg">
                  <label className="fl"><Package size={11} style={{ display: 'inline', marginRight: 3 }} />Rendimento</label>
                  <input className="inp" value={form.rendimento} onChange={e => setForm(f => ({ ...f, rendimento: e.target.value }))} placeholder="Ex: 1 porção, 500ml" />
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>📦 Ingredientes</div>
              <div className="card" style={{ padding: 10, marginBottom: 14 }}>
                {form.ingredientes.map((it, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 90px 28px', gap: 5, marginBottom: 6, alignItems: 'center' }}>
                    <input className="inp" style={{ fontSize: 12 }} placeholder="Ingrediente" value={it.desc} onChange={e => setIngrediente(idx, 'desc', e.target.value)} />
                    <input className="inp" style={{ fontSize: 12 }} placeholder="Qtd" type="number" min={0} step={0.001} value={it.qtd} onChange={e => setIngrediente(idx, 'qtd', e.target.value)} />
                    <select className="sel" style={{ fontSize: 12 }} value={it.unidade} onChange={e => setIngrediente(idx, 'unidade', e.target.value)}>
                      {['g', 'kg', 'ml', 'L', 'un', 'colher', 'xícara'].map(u => <option key={u}>{u}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>R$</span>
                      <input className="inp" style={{ fontSize: 12 }} placeholder="0,00" type="number" min={0} step={0.01} value={it.custo} onChange={e => setIngrediente(idx, 'custo', e.target.value)} />
                    </div>
                    <button className="ib rd" onClick={() => removeIngrediente(idx)} disabled={form.ingredientes.length <= 1}><X size={11} /></button>
                  </div>
                ))}
                <button className="btn bo bsm" style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed', marginTop: 4 }} onClick={addIngrediente}>
                  <Plus size={10} /> Adicionar ingrediente
                </button>
              </div>
              <div className="fg" style={{ marginBottom: 14 }}>
                <label className="fl">Modo de preparo</label>
                <textarea className="inp" rows={4} style={{ resize: 'vertical' }} value={form.modo_preparo}
                  onChange={e => setForm(f => ({ ...f, modo_preparo: e.target.value }))}
                  placeholder="Descreva o passo a passo do preparo..." />
              </div>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}><DollarSign size={11} style={{ display: 'inline', marginRight: 3 }} />Precificação</div>
              <div className="g2">
                <div className="fg">
                  <label className="fl">Margem de lucro (%)</label>
                  <input className="inp" type="number" min={0} max={100} step={0.1} value={form.margem} onChange={e => setForm(f => ({ ...f, margem: e.target.value }))} placeholder="Ex: 70" />
                </div>
                <div className="fg">
                  <label className="fl">Preço de venda (R$)</label>
                  <input className="inp" type="number" min={0} step={0.01} value={form.preco_venda} onChange={e => setForm(f => ({ ...f, preco_venda: e.target.value }))} placeholder="Calculado pela margem se vazio" />
                </div>
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={saving}>
                {saving ? <RefreshCw size={12} className="spin" /> : <Save size={12} />} Salvar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Solicitações ──────────────────────────────────────────

const TIPO_SOL: Record<SolicitacaoItem['tipo'], string> = {
  produto: 'Produto',
  equipamento: 'Equipamento',
  utensilio: 'Utensílio',
  manutencao: 'Manutenção',
  compra_emergencial: 'Compra Emergencial',
}

const URGENCIA_SOL: Record<SolicitacaoItem['urgencia'], { lbl: string; cls: string }> = {
  baixa:   { lbl: 'Baixa',   cls: 'bg-g' },
  media:   { lbl: 'Média',   cls: 'bg-y' },
  alta:    { lbl: 'Alta',    cls: 'bg-o' },
  critica: { lbl: 'Crítica', cls: 'bg-r' },
}

const STATUS_SOL: Record<SolicitacaoItem['status'], { lbl: string; cls: string }> = {
  solicitado:  { lbl: 'Solicitado',  cls: 'bg-y' },
  em_cotacao:  { lbl: 'Em Cotação',  cls: 'bg-b' },
  aprovado:    { lbl: 'Aprovado',    cls: 'bg-g' },
  em_compra:   { lbl: 'Em Compra',   cls: 'bg-p' },
  recebido:    { lbl: 'Recebido',    cls: 'bg-gr' },
  cancelado:   { lbl: 'Cancelado',   cls: 'bg-r' },
}

const STATUS_SOL_FLOW: SolicitacaoItem['status'][] = [
  'solicitado', 'em_cotacao', 'aprovado', 'em_compra', 'recebido',
]

function SolicitacoesTab({
  solicitacoes,
  lojaDefault,
  onAdd,
  onUpdate,
  onDelete,
}: {
  solicitacoes: SolicitacaoItem[]
  lojaDefault: string
  onAdd: (s: Omit<SolicitacaoItem, 'id'>) => Promise<void>
  onUpdate: (id: string, s: Partial<SolicitacaoItem>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<SolicitacaoItem | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<SolicitacaoItem['tipo'] | ''>('')
  const [filtroUrgencia, setFiltroUrgencia] = useState<SolicitacaoItem['urgencia'] | ''>('')
  const [formErros, setFormErros] = useState<{ item?: string; responsavel?: string }>({})
  const [saving, setSaving] = useState(false)

  const EMPTY_FORM = {
    tipo: 'produto' as SolicitacaoItem['tipo'],
    item: '',
    quantidade: '',
    urgencia: 'media' as SolicitacaoItem['urgencia'],
    responsavel: '',
    setor: '',
    status: 'solicitado' as SolicitacaoItem['status'],
    obs: '',
  }
  const [form, setForm] = useState(EMPTY_FORM)

  const openNovo = () => {
    setEditItem(null)
    setForm(EMPTY_FORM)
    setFormErros({})
    setShowModal(true)
  }

  const openEdit = (s: SolicitacaoItem) => {
    setEditItem(s)
    setForm({ tipo: s.tipo, item: s.item, quantidade: s.quantidade, urgencia: s.urgencia, responsavel: s.responsavel, setor: s.setor, status: s.status, obs: s.obs })
    setFormErros({})
    setShowModal(true)
  }

  const salvar = async () => {
    const erros: { item?: string; responsavel?: string } = {}
    if (!form.item.trim()) erros.item = 'Informe o item solicitado'
    if (!form.responsavel.trim()) erros.responsavel = 'Informe o responsável'
    if (Object.keys(erros).length) { setFormErros(erros); return }
    if (saving) return
    setSaving(true)
    try {
      const now = new Date()
      const data = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`
      if (editItem) {
        await onUpdate(editItem.id, form)
      } else {
        await onAdd({ ...form, data, loja: lojaDefault })
      }
      setShowModal(false)
    } finally { setSaving(false) }
  }

  const avancarStatus = (id: string) => {
    const s = solicitacoes.find(x => x.id === id)
    if (!s) return
    const idx = STATUS_SOL_FLOW.indexOf(s.status)
    const proximo = idx >= 0 && idx < STATUS_SOL_FLOW.length - 1 ? STATUS_SOL_FLOW[idx + 1] : s.status
    if (proximo !== s.status) onUpdate(id, { status: proximo })
  }

  const lista = solicitacoes.filter(s =>
    (filtroTipo === '' || s.tipo === filtroTipo) &&
    (filtroUrgencia === '' || s.urgencia === filtroUrgencia)
  )

  const total = solicitacoes.length
  const pendentes = solicitacoes.filter(s => s.status === 'solicitado' || s.status === 'em_cotacao').length
  const aprovados = solicitacoes.filter(s => s.status === 'aprovado' || s.status === 'em_compra').length
  const recebidos = solicitacoes.filter(s => s.status === 'recebido').length

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        {[
          { lbl: 'Total de Solicitações', val: String(total), sub: 'registradas', col: 'var(--blue)' },
          { lbl: 'Pendentes', val: String(pendentes), sub: 'solicitado / em cotação', col: 'var(--warning)' },
          { lbl: 'Aprovadas', val: String(aprovados), sub: 'aprovado / em compra', col: 'var(--success)' },
          { lbl: 'Recebidas', val: String(recebidos), sub: 'concluídas', col: 'var(--teal,#14B8A6)' },
        ].map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-ac" style={{ background: k.col }} />
            <div className="kpi-lbl">{k.lbl}</div>
            <div className="kpi-val">{k.val}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-tt">📋 Solicitações Internas da Cozinha</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="sel" style={{ fontSize: 11, padding: '4px 8px', minWidth: 130 }}
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value as SolicitacaoItem['tipo'] | '')}>
              <option value="">Todos os tipos</option>
              {(Object.keys(TIPO_SOL) as SolicitacaoItem['tipo'][]).map(t => (
                <option key={t} value={t}>{TIPO_SOL[t]}</option>
              ))}
            </select>
            <select className="sel" style={{ fontSize: 11, padding: '4px 8px', minWidth: 120 }}
              value={filtroUrgencia}
              onChange={e => setFiltroUrgencia(e.target.value as SolicitacaoItem['urgencia'] | '')}>
              <option value="">Toda urgência</option>
              {(Object.keys(URGENCIA_SOL) as SolicitacaoItem['urgencia'][]).map(u => (
                <option key={u} value={u}>{URGENCIA_SOL[u].lbl}</option>
              ))}
            </select>
            <button className="btn bp bsm" onClick={openNovo}><Plus size={11} /> Nova Solicitação</button>
          </div>
        </div>

        {lista.length === 0 ? (
          <div className="empty" style={{ padding: '40px 0' }}>
            <ClipboardList size={36} style={{ opacity: 0.3 }} />
            <div style={{ marginTop: 10, fontWeight: 600 }}>Nenhuma solicitação encontrada</div>
            <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={openNovo}><Plus size={11} /> Criar primeira</button>
          </div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Data</th><th>Tipo</th><th>Item</th><th>Qtd</th>
                  <th>Urgência</th><th>Status</th><th>Responsável</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map(s => {
                  const urg = URGENCIA_SOL[s.urgencia]
                  const st = STATUS_SOL[s.status]
                  return (
                    <tr key={s.id}>
                      <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s.data}</td>
                      <td style={{ fontSize: 11 }}>
                        <span style={{ padding: '2px 7px', borderRadius: 12, background: 'var(--bordo-bg)', color: 'var(--bordo)', fontWeight: 600, fontSize: 10 }}>
                          {TIPO_SOL[s.tipo]}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontSize: 12 }}>{s.item}</strong>
                        {s.obs && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{s.obs}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>{s.quantidade || '—'}</td>
                      <td><span className={`badge ${urg.cls}`}>{urg.lbl}</span></td>
                      <td>
                        <span
                          className={`badge ${st.cls}`}
                          style={{ cursor: s.status !== 'recebido' && s.status !== 'cancelado' ? 'pointer' : 'default' }}
                          title={s.status !== 'recebido' && s.status !== 'cancelado' ? 'Clique para avançar status' : undefined}
                          onClick={() => { if (s.status !== 'recebido' && s.status !== 'cancelado') avancarStatus(s.id) }}
                        >
                          {st.lbl}
                        </span>
                      </td>
                      <td style={{ fontSize: 11 }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{s.responsavel || '—'}</span>
                          {s.setor && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{s.setor}</div>}
                        </div>
                      </td>
                      <td>
                        <div className="ab" style={{ gap: 4 }}>
                          <button className="ib" onClick={() => openEdit(s)} title="Editar"><Edit3 size={12} /></button>
                          <button className="ib rd" onClick={() => onDelete(s.id)} title="Excluir"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="ov open" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">{editItem ? 'Editar Solicitação' : 'Nova Solicitação'}</span>
              <button className="mx" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="mbd">
              <div className="g2">
                <div className="fg">
                  <label className="fl">Tipo <span className="rq">*</span></label>
                  <select className="sel" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as SolicitacaoItem['tipo'] }))}>
                    {(Object.keys(TIPO_SOL) as SolicitacaoItem['tipo'][]).map(t => (
                      <option key={t} value={t}>{TIPO_SOL[t]}</option>
                    ))}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Urgência</label>
                  <select className="sel" value={form.urgencia} onChange={e => setForm(f => ({ ...f, urgencia: e.target.value as SolicitacaoItem['urgencia'] }))}>
                    {(Object.keys(URGENCIA_SOL) as SolicitacaoItem['urgencia'][]).map(u => (
                      <option key={u} value={u}>{URGENCIA_SOL[u].lbl}</option>
                    ))}
                  </select>
                </div>
                <div className="fg" style={{ gridColumn: '1/-1' }}>
                  <label className="fl">Item / Descrição <span className="rq">*</span></label>
                  <input
                    className={`inp${formErros.item ? ' err' : ''}`}
                    value={form.item}
                    onChange={e => { setForm(f => ({ ...f, item: e.target.value })); setFormErros(v => ({ ...v, item: undefined })) }}
                    placeholder="Ex: Polpa de açaí, Liquidificador industrial..."
                    autoFocus
                  />
                  {formErros.item && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{formErros.item}</span>}
                </div>
                <div className="fg">
                  <label className="fl">Quantidade</label>
                  <input className="inp" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} placeholder="Ex: 50 kg, 2 un" />
                </div>
                <div className="fg">
                  <label className="fl">Responsável <span className="rq">*</span></label>
                  <input
                    className={`inp${formErros.responsavel ? ' err' : ''}`}
                    value={form.responsavel}
                    onChange={e => { setForm(f => ({ ...f, responsavel: e.target.value })); setFormErros(v => ({ ...v, responsavel: undefined })) }}
                    placeholder="Nome do solicitante"
                  />
                  {formErros.responsavel && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{formErros.responsavel}</span>}
                </div>
                <div className="fg">
                  <label className="fl">Setor</label>
                  <input className="inp" value={form.setor} onChange={e => setForm(f => ({ ...f, setor: e.target.value }))} placeholder="Ex: Cozinha, Estoque..." />
                </div>
                <div className="fg">
                  <label className="fl">Status</label>
                  <select className="sel" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as SolicitacaoItem['status'] }))}>
                    {(Object.keys(STATUS_SOL) as SolicitacaoItem['status'][]).map(s => (
                      <option key={s} value={s}>{STATUS_SOL[s].lbl}</option>
                    ))}
                  </select>
                </div>
                <div className="fg" style={{ gridColumn: '1/-1' }}>
                  <label className="fl">Observações</label>
                  <textarea className="inp txa" rows={2} value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Justificativa ou detalhes adicionais..." />
                </div>
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={saving}>
                {saving ? <RefreshCw size={12} className="spin" /> : <Check size={12} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Performance dos Pratos ────────────────────────────────

type Classificacao = 'campea' | 'atencao' | 'baixa' | 'desperdicio'

const CLASS_CONFIG: Record<Classificacao, { label: string; emoji: string; cor: string; bg: string }> = {
  campea:      { label: 'Campeão',          emoji: '🏆', cor: '#16a34a', bg: '#dcfce7' },
  atencao:     { label: 'Atenção',          emoji: '⚠️',  cor: '#d97706', bg: '#fef3c7' },
  baixa:       { label: 'Baixa Saída',      emoji: '📉', cor: '#6366f1', bg: '#ede9fe' },
  desperdicio: { label: 'Alto Desperdício', emoji: '🗑️', cor: '#ef4444', bg: '#fee2e2' },
}

function PerformanceTab({
  fichas, producao, desperdicio,
}: {
  fichas: FichaTecnica[]
  producao: ProducaoItem[]
  desperdicio: DespItem[]
}) {
  const performance = useMemo(() => {
    if (fichas.length === 0) return []
    return fichas.map(f => {
      const nome = f.nome.toLowerCase()
      const vezesProduzido = producao.filter(p =>
        p.prato.toLowerCase().includes(nome) || nome.includes(p.prato.toLowerCase())
      ).length
      const despTotal = desperdicio
        .filter(d => d.item.toLowerCase().includes(nome) || nome.includes(d.item.toLowerCase()))
        .reduce((s, d) => s + parseFloat(d.qtd || '0'), 0)
      const custo  = parseFloat(f.custo_total || '0')
      const margem = parseFloat(f.margem || '0')
      let classificacao: Classificacao = 'atencao'
      if (despTotal > 5)                                              classificacao = 'desperdicio'
      else if (vezesProduzido === 0)                                  classificacao = 'baixa'
      else if (vezesProduzido >= 3 && despTotal < 2 && margem > 30)  classificacao = 'campea'
      return { nome: f.nome, vezesProduzido, despTotal, custo, margem, tempoPrep: f.tempo_preparo || '—', classificacao }
    }).sort((a, b) => {
      const order: Classificacao[] = ['campea', 'atencao', 'desperdicio', 'baixa']
      return order.indexOf(a.classificacao) - order.indexOf(b.classificacao)
    })
  }, [fichas, producao, desperdicio])

  const counts = {
    campea:      performance.filter(p => p.classificacao === 'campea').length,
    atencao:     performance.filter(p => p.classificacao === 'atencao').length,
    baixa:       performance.filter(p => p.classificacao === 'baixa').length,
    desperdicio: performance.filter(p => p.classificacao === 'desperdicio').length,
  }

  if (fichas.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 14 }}>
        <BarChart2 size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Nenhuma Ficha Técnica cadastrada</div>
        <div style={{ fontSize: 13 }}>Cadastre fichas técnicas na aba <strong>Ficha Técnica</strong> para ativar a análise.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {(Object.entries(CLASS_CONFIG) as [Classificacao, typeof CLASS_CONFIG[Classificacao]][]).map(([k, c]) => (
          <div key={k} style={{ background: c.bg, border: `1px solid ${c.cor}40`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22 }}>{c.emoji}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: c.cor }}>{counts[k as Classificacao]}</div>
            <div style={{ fontSize: 11, color: c.cor, fontWeight: 600 }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {performance.map((p, i) => {
          const cfg = CLASS_CONFIG[p.classificacao]
          return (
            <div key={i} style={{ background: 'var(--card)', border: `1px solid ${cfg.cor}30`, borderLeft: `4px solid ${cfg.cor}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14, flex: 1, marginRight: 8 }}>{p.nome}</div>
                <span style={{ background: cfg.bg, color: cfg.cor, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {cfg.emoji} {cfg.label}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
                  <Flame size={11} style={{ color: '#f59e0b' }} /> Produzido {p.vezesProduzido}×
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
                  <Clock size={11} style={{ color: '#6366f1' }} /> {p.tempoPrep}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
                  <DollarSign size={11} style={{ color: '#16a34a' }} /> R${p.custo.toFixed(2)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
                  {p.margem >= 40
                    ? <TrendingUp size={11} style={{ color: '#16a34a' }} />
                    : <TrendingDown size={11} style={{ color: '#ef4444' }} />
                  }
                  Margem {p.margem.toFixed(0)}%
                </div>
              </div>
              {p.despTotal > 0 && (
                <div style={{ marginTop: 8, background: '#fee2e220', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={10} /> Desperdício: {p.despTotal.toFixed(1)} un.
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
        Classif.: 3+ produções + margem &gt;30% + desperdício &lt;2 = 🏆 Campeão
      </div>
    </div>
  )
}

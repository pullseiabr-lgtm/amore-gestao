import { useState, useRef } from 'react'
import {
  CheckCircle, Circle, Plus, Trash2, Edit3, Check, X,
  ChefHat, ClipboardList, Package, AlertTriangle, Camera,
  Save, RefreshCw, Star, Clock, DollarSign, User,
} from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────

type Setor = 'cozinha' | 'salao' | 'limpeza' | 'estoque' | 'abertura' | 'fechamento'

interface CheckItem { id: string; txt: string; ok: boolean; foto?: string; obrigatorio: boolean }
interface Checklist { id: string; titulo: string; loja: string; setor: Setor; itens: CheckItem[] }

interface ProducaoItem {
  id: string; prato: string; qtd: string; loja: string
  solicitante: string; executor: string; hora: string
  status: 'pendente' | 'em_preparo' | 'concluido'
  obs: string
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

// ── Dados iniciais ───────────────────────────────────────────

const INIT_CHECKLISTS: Checklist[] = [
  { id: 'c1', titulo: 'Abertura Cozinha', loja: 'Amore CD', setor: 'abertura', itens: [
    { id: 'i1', txt: 'Verificar temperatura câmara fria', ok: true, obrigatorio: true },
    { id: 'i2', txt: 'Higienizar bancadas', ok: true, obrigatorio: true },
    { id: 'i3', txt: 'Checar estoque açaí base', ok: false, obrigatorio: false },
    { id: 'i4', txt: 'Preparar toppings do dia', ok: false, obrigatorio: false },
  ]},
  { id: 'c2', titulo: 'Fechamento Cozinha', loja: 'Amore Paiva', setor: 'fechamento', itens: [
    { id: 'i5', txt: 'Desligar equipamentos', ok: false, obrigatorio: true },
    { id: 'i6', txt: 'Armazenar sobras corretamente', ok: false, obrigatorio: true },
    { id: 'i7', txt: 'Limpeza geral', ok: false, obrigatorio: false },
  ]},
]

const INIT_PRODUCAO: ProducaoItem[] = [
  { id: 'p1', prato: 'Açaí base porcionado', qtd: '45 kg', loja: 'Amore CD', solicitante: 'Gerente', executor: 'Carlos', hora: '07:30', status: 'concluido', obs: '' },
  { id: 'p2', prato: 'Creme de açaí especial', qtd: '20 kg', loja: 'Amore Paiva', solicitante: 'Gerente', executor: 'Ana', hora: '08:00', status: 'em_preparo', obs: '' },
  { id: 'p3', prato: 'Mix de granola caseira', qtd: '15 kg', loja: 'Todas', solicitante: 'Cozinha', executor: 'Pedro', hora: '09:00', status: 'pendente', obs: '' },
]

const INIT_DESPERDICIO: DespItem[] = [
  { id: 'd1', data: '22/07', item: 'Polpa de morango', qtd: '2', unidade: 'kg', motivo: 'Vencimento', categoria: 'Perda por Validade', responsavel: 'Carlos', loja: 'Amore CD', custo: '22,40' },
  { id: 'd2', data: '21/07', item: 'Creme de leite', qtd: '0,5', unidade: 'kg', motivo: 'Contaminação', categoria: 'Contaminação', responsavel: 'Ana', loja: 'Amore CD', custo: '3,95' },
  { id: 'd3', data: '20/07', item: 'Granola', qtd: '1', unidade: 'kg', motivo: 'Armazenamento inadequado', categoria: 'Armazenamento Inadequado', responsavel: 'Pedro', loja: 'Amore Paiva', custo: '12,00' },
]

const INIT_FICHAS: FichaTecnica[] = [
  {
    id: 'f1', nome: 'Açaí 300ml Tradicional', foto: '',
    ingredientes: [
      { desc: 'Polpa de açaí', qtd: '200', unidade: 'g', custo: '3,20' },
      { desc: 'Banana', qtd: '50', unidade: 'g', custo: '0,40' },
      { desc: 'Granola', qtd: '30', unidade: 'g', custo: '0,60' },
    ],
    rendimento: '1 porção', tempo_preparo: '5', modo_preparo: '1. Bater polpa com banana no liquidificador\n2. Servir em tigela gelada\n3. Adicionar granola por cima',
    custo_total: '4,20', margem: '70', preco_venda: '14,00',
  },
]

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

type Tab = 'checklist' | 'producao' | 'desperdicio' | 'ficha'

// ── Componente Principal ─────────────────────────────────────

export default function CozinhaPage() {
  const [tab, setTab] = useState<Tab>('checklist')
  const [checks, setChecks] = useState<Checklist[]>(INIT_CHECKLISTS)
  const [producao, setProducao] = useState<ProducaoItem[]>(INIT_PRODUCAO)
  const [desperdicio, setDesperdicio] = useState<DespItem[]>(INIT_DESPERDICIO)
  const [fichas, setFichas] = useState<FichaTecnica[]>(INIT_FICHAS)

  // Toggle item checklist
  const toggle = (clId: string, itId: string) => {
    setChecks(prev => prev.map(cl => cl.id !== clId ? cl : {
      ...cl, itens: cl.itens.map(it => it.id !== itId ? it : { ...it, ok: !it.ok })
    }))
  }

  // KPIs
  const totalChecklists = checks.length
  const concluidos = checks.filter(cl => cl.itens.every(it => it.ok)).length
  const prodAndamento = producao.filter(p => p.status === 'em_preparo').length
  const totalDesp = desperdicio.reduce((s, d) => s + parseFloat(d.custo.replace(',', '.') || '0'), 0)
  const totalFichas = fichas.length

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
          ['checklist', '✅ Checklists'],
          ['producao', '🍧 Produção'],
          ['desperdicio', '🗑️ Desperdício'],
          ['ficha', '📋 Ficha Técnica'],
        ] as [Tab, string][]).map(([t, lbl]) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{lbl}</button>
        ))}
      </div>

      {tab === 'checklist' && (
        <ChecklistTab checks={checks} onChange={setChecks} onToggle={toggle} />
      )}
      {tab === 'producao' && (
        <ProducaoTab producao={producao} onChange={setProducao} />
      )}
      {tab === 'desperdicio' && (
        <DespedicioTab desperdicio={desperdicio} onChange={setDesperdicio} />
      )}
      {tab === 'ficha' && (
        <FichaTab fichas={fichas} onChange={setFichas} />
      )}
    </div>
  )
}

// ── Tab Checklist ─────────────────────────────────────────────

function ChecklistTab({ checks, onChange, onToggle }: {
  checks: Checklist[]
  onChange: (c: Checklist[]) => void
  onToggle: (clId: string, itId: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [newItemTxt, setNewItemTxt] = useState('')
  const [responsavel, setResponsavel] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ titulo: '', loja: 'Amore CD', setor: 'cozinha' as Setor })

  const addChecklist = () => {
    if (!form.titulo.trim()) return
    const novo: Checklist = {
      id: `cl_${Date.now()}`, titulo: form.titulo.trim(),
      loja: form.loja, setor: form.setor, itens: [],
    }
    onChange([...checks, novo])
    setForm({ titulo: '', loja: 'Amore CD', setor: 'cozinha' })
    setShowForm(false)
  }

  const deleteChecklist = (id: string) => {
    onChange(checks.filter(cl => cl.id !== id))
  }

  const addItem = (clId: string) => {
    if (!newItemTxt.trim()) return
    onChange(checks.map(cl => cl.id !== clId ? cl : {
      ...cl, itens: [...cl.itens, { id: `i_${Date.now()}`, txt: newItemTxt.trim(), ok: false, obrigatorio: false }],
    }))
    setNewItemTxt('')
    setEditId(null)
  }

  const deleteItem = (clId: string, itId: string) => {
    onChange(checks.map(cl => cl.id !== clId ? cl : {
      ...cl, itens: cl.itens.filter(it => it.id !== itId),
    }))
  }

  const toggleObrigatorio = (clId: string, itId: string) => {
    onChange(checks.map(cl => cl.id !== clId ? cl : {
      ...cl, itens: cl.itens.map(it => it.id !== itId ? it : { ...it, obrigatorio: !it.obrigatorio }),
    }))
  }

  const editItemSave = (clId: string, itId: string, txt: string) => {
    onChange(checks.map(cl => cl.id !== clId ? cl : {
      ...cl, itens: cl.itens.map(it => it.id !== itId ? it : { ...it, txt }),
    }))
    setEditItemId(null)
  }

  const fileRef = useRef<HTMLInputElement>(null)

  const anexarFoto = (clId: string, itId: string) => {
    // Simula captura de foto — em produção faria upload para Supabase Storage
    onChange(checks.map(cl => cl.id !== clId ? cl : {
      ...cl, itens: cl.itens.map(it => it.id !== itId ? it : { ...it, foto: '📷 Foto anexada' }),
    }))
  }

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
            <button className="btn bp" onClick={addChecklist}><Check size={11} /> Criar</button>
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
                  <button className="ib rd" onClick={() => deleteChecklist(cl.id)} title="Excluir checklist"><Trash2 size={12} /></button>
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
                    <div style={{ cursor: 'pointer' }} onClick={() => onToggle(cl.id, it.id)}>
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
                        onClick={() => onToggle(cl.id, it.id)}
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

function ProducaoTab({ producao, onChange }: { producao: ProducaoItem[]; onChange: (p: ProducaoItem[]) => void }) {
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<ProducaoItem | null>(null)
  const [form, setForm] = useState<Omit<ProducaoItem, 'id'>>({
    prato: '', qtd: '', loja: 'Amore CD', solicitante: '', executor: '',
    hora: new Date().toTimeString().slice(0, 5), status: 'pendente', obs: '',
  })
  const [saving, setSaving] = useState(false)

  const openNovo = () => {
    setEditItem(null)
    setForm({ prato: '', qtd: '', loja: 'Amore CD', solicitante: '', executor: '', hora: new Date().toTimeString().slice(0, 5), status: 'pendente', obs: '' })
    setShowModal(true)
  }

  const openEdit = (item: ProducaoItem) => {
    setEditItem(item)
    setForm({ prato: item.prato, qtd: item.qtd, loja: item.loja, solicitante: item.solicitante, executor: item.executor, hora: item.hora, status: item.status, obs: item.obs })
    setShowModal(true)
  }

  const salvar = async () => {
    if (!form.prato.trim()) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 400))
    if (editItem) {
      onChange(producao.map(p => p.id === editItem.id ? { ...p, ...form } : p))
    } else {
      onChange([...producao, { id: `p_${Date.now()}`, ...form }])
    }
    setSaving(false)
    setShowModal(false)
  }

  const ciclarStatus = (id: string) => {
    const prox: Record<ProducaoItem['status'], ProducaoItem['status']> = {
      pendente: 'em_preparo', em_preparo: 'concluido', concluido: 'pendente',
    }
    onChange(producao.map(p => p.id === id ? { ...p, status: prox[p.status] } : p))
  }

  const deletar = (id: string) => onChange(producao.filter(p => p.id !== id))

  return (
    <div>
      <div className="card">
        <div className="card-hd">
          <span className="card-tt">🍧 Produção do Dia</span>
          <button className="btn bp bsm" onClick={openNovo}><Plus size={11} /> Registrar</button>
        </div>

        {producao.length === 0 ? (
          <div className="empty" style={{ padding: '40px 0' }}>
            <ChefHat size={36} style={{ opacity: 0.3 }} />
            <div style={{ marginTop: 10, fontWeight: 600 }}>Nenhuma produção registrada hoje</div>
            <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={openNovo}><Plus size={11} /> Registrar primeira</button>
          </div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Prato / Item</th><th>Qtd</th><th>Loja</th>
                  <th>Solicitante</th><th>Executor</th><th>Hora</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {producao.map(p => {
                  const st = STATUS_PROD[p.status]
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong style={{ fontSize: 12 }}>{p.prato}</strong>
                        {p.obs && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.obs}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>{p.qtd}</td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{p.loja}</td>
                      <td style={{ fontSize: 11 }}>{p.solicitante || '—'}</td>
                      <td style={{ fontSize: 11, fontWeight: 600 }}>{p.executor || '—'}</td>
                      <td style={{ fontSize: 11 }}>{p.hora}</td>
                      <td>
                        <span className={`badge ${st.cls}`} style={{ cursor: 'pointer' }} onClick={() => ciclarStatus(p.id)} title="Clique para avançar status">
                          {st.lbl}
                        </span>
                      </td>
                      <td>
                        <div className="ab" style={{ gap: 4 }}>
                          <button className="ib" onClick={() => openEdit(p)} title="Editar"><Edit3 size={12} /></button>
                          <button className="ib rd" onClick={() => deletar(p.id)} title="Remover"><Trash2 size={12} /></button>
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
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">{editItem ? 'Editar Produção' : 'Registrar Produção'}</span>
              <button className="mx" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="mbd">
              <div className="g2">
                <div className="fg" style={{ gridColumn: '1/-1' }}>
                  <label className="fl">Prato / Item produzido <span className="rq">*</span></label>
                  <input className="inp" value={form.prato} onChange={e => setForm(f => ({ ...f, prato: e.target.value }))} placeholder="Ex: Açaí base 300ml, Granola caseira..." autoFocus />
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
                  <label className="fl">Responsável pela solicitação</label>
                  <input className="inp" value={form.solicitante} onChange={e => setForm(f => ({ ...f, solicitante: e.target.value }))} placeholder="Nome do solicitante" />
                </div>
                <div className="fg">
                  <label className="fl">Responsável pela execução</label>
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

function DespedicioTab({ desperdicio, onChange }: { desperdicio: DespItem[]; onChange: (d: DespItem[]) => void }) {
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    item: '', qtd: '', unidade: 'kg', motivo: 'Vencimento', categoria: 'Perda por Validade',
    responsavel: '', loja: 'Amore CD', custo: '',
  })

  const totalCusto = desperdicio.reduce((s, d) => s + parseFloat(d.custo.replace(',', '.') || '0'), 0)
  const byCategoria = CATEGORIAS_DESP.map(c => ({
    cat: c,
    count: desperdicio.filter(d => d.categoria === c).length,
    valor: desperdicio.filter(d => d.categoria === c).reduce((s, d) => s + parseFloat(d.custo.replace(',', '.') || '0'), 0),
  })).filter(c => c.count > 0)

  const salvar = async () => {
    if (!form.item.trim() || !form.qtd) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 300))
    const now = new Date()
    const data = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`
    onChange([{ id: `d_${Date.now()}`, data, ...form }, ...desperdicio])
    setSaving(false)
    setShowModal(false)
    setForm({ item: '', qtd: '', unidade: 'kg', motivo: 'Vencimento', categoria: 'Perda por Validade', responsavel: '', loja: 'Amore CD', custo: '' })
  }

  const deletar = (id: string) => onChange(desperdicio.filter(d => d.id !== id))

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
                    <button className="ib rd" onClick={() => deletar(d.id)}><Trash2 size={11} /></button>
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

function FichaTab({ fichas, onChange }: { fichas: FichaTecnica[]; onChange: (f: FichaTecnica[]) => void }) {
  const [selecionada, setSelecionada] = useState<FichaTecnica | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editFicha, setEditFicha] = useState<FichaTecnica | null>(null)

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

  const salvar = () => {
    if (!form.nome.trim()) return
    // Calcula custo total automaticamente
    const custo = form.ingredientes.reduce((s, i) => s + parseFloat(i.custo.replace(',', '.') || '0'), 0)
    const fichaFinal = {
      ...form,
      custo_total: custo.toFixed(2).replace('.', ','),
      preco_venda: form.preco_venda || (custo / (1 - parseFloat(form.margem || '60') / 100)).toFixed(2).replace('.', ','),
    }
    if (editFicha) {
      onChange(fichas.map(f => f.id === editFicha.id ? { ...fichaFinal, id: editFicha.id } : f))
    } else {
      onChange([...fichas, { ...fichaFinal, id: `ft_${Date.now()}` }])
    }
    setShowForm(false)
    setSelecionada(null)
  }

  const deletar = (id: string) => {
    onChange(fichas.filter(f => f.id !== id))
    if (selecionada?.id === id) setSelecionada(null)
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
          <button className="btn bsm" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => deletar(ft.id)}><Trash2 size={11} /> Excluir</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Ingredientes */}
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

          {/* KPIs financeiros */}
          <div>
            <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
              <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--bordo)' }} /><div className="kpi-lbl">Custo Total</div><div className="kpi-val" style={{ fontSize: 18 }}>R$ {ft.custo_total}</div></div>
              <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--success)' }} /><div className="kpi-lbl">Preço de Venda</div><div className="kpi-val" style={{ fontSize: 18, color: 'var(--success)' }}>R$ {ft.preco_venda}</div></div>
              <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--blue)' }} /><div className="kpi-lbl">Margem</div><div className="kpi-val" style={{ fontSize: 18, color: 'var(--blue)' }}>{margemCalc(ft)}%</div></div>
              <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--warning)' }} /><div className="kpi-lbl">Rendimento</div><div className="kpi-val" style={{ fontSize: 14 }}>{ft.rendimento}</div></div>
            </div>

            {/* Tempo e modo */}
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
                  <div onClick={e => { e.stopPropagation(); deletar(f.id) }} style={{ cursor: 'pointer', color: 'var(--muted)' }}>
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
              <button className="btn bp" onClick={salvar}><Save size={12} /> Salvar Ficha</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

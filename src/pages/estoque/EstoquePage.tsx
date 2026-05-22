import { useState, useEffect, useCallback } from 'react'
import { Search, Package, TrendingDown, History, ArrowLeftRight, ClipboardList, Download, Plus, ChevronRight, CheckCircle, XCircle, Calculator, Loader } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import { useToast } from '../../hooks/useToast'
import {
  fetchEstoqueProdutos, insertEstoqueProduto, updateEstoqueProduto,
  fetchEstoqueMovimentacoes, fetchEstoqueMovimentacoesDias, insertEstoqueMovimentacao,
  fetchEstoqueContagens, insertEstoqueContagem,
  fetchEstoqueContagemItens, upsertEstoqueContagemItens,
} from '../../lib/db'
import type { EstoqueProduto, EstoqueMovimentacao, EstoqueContagem, EstoqueContagemItem, NivelStatus } from '../../types/database'

// ── helpers ────────────────────────────────────────────────

function nivelStatus(p: EstoqueProduto): NivelStatus {
  if (p.nivel_atual <= 0 || p.nivel_atual < p.nivel_minimo) return 'Crítico'
  if (p.nivel_atual < p.nivel_minimo * 1.5) return 'Repor'
  if (p.nivel_atual >= p.nivel_ideal) return 'Ideal'
  return 'Ok'
}

const NIVEL_BADGE: Record<NivelStatus, string> = {
  'Crítico': 'bg-r',
  'Repor': 'bg-y',
  'Ok': 'bg-g',
  'Ideal': 'bg-b',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

const CATEGORIAS = ['Açaí', 'Bebidas', 'Carnes', 'Condimentos', 'Embalagens', 'Frutas', 'Graos', 'Higiene', 'Laticínios', 'Legumes', 'Limpeza', 'Proteínas']

// ── Inline number input para edição em massa ───────────────

interface InlineInputProps {
  value: number
  onChange: (v: number) => void
  step?: number
  prefix?: string
}
function InlineInput({ value, onChange, step = 1, prefix }: InlineInputProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {prefix && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{prefix}</span>}
      <input
        type="number"
        step={step}
        min={0}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{
          width: 70, padding: '3px 6px', fontSize: 12, border: '1.5px solid var(--bordo-l)',
          borderRadius: 5, background: 'var(--bordo-bg)', color: 'var(--text)',
          outline: 'none', fontWeight: 600,
        }}
        onClick={e => (e.target as HTMLInputElement).select()}
      />
    </div>
  )
}

// ── Tab Lista ──────────────────────────────────────────────

type BulkRow = { nivel_atual: number; nivel_minimo: number; nivel_ideal: number; preco_unitario: number }

function TabLista({ loja }: { loja: string }) {
  const { lojas } = useLoja()
  const { toast } = useToast()
  const [produtos, setProdutos] = useState<EstoqueProduto[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [ordenar, setOrdenar] = useState('Nome (A-Z)')
  const [categoria, setCategoria] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editProduto, setEditProduto] = useState<EstoqueProduto | null>(null)
  const [form, setForm] = useState({ nome: '', gramatura: 'Unidade(s)', categoria: 'Geral', nivel_minimo: '', nivel_ideal: '', preco_unitario: '' })
  const [saving, setSaving] = useState(false)

  // ── Edição em massa
  const [editMode, setEditMode] = useState(false)
  const [bulkData, setBulkData] = useState<Record<string, BulkRow>>({})
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkSaved, setBulkSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setProdutos(await fetchEstoqueProdutos(loja)) } catch {}
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const filtrados = produtos
    .filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()))
    .filter(p => !categoria || p.categoria === categoria)
    .sort((a, b) => ordenar === 'Nome (Z-A)' ? b.nome.localeCompare(a.nome) : a.nome.localeCompare(b.nome))

  const criticos = produtos.filter(p => nivelStatus(p) === 'Crítico').length
  const repor = produtos.filter(p => nivelStatus(p) === 'Repor').length
  const valorTotal = produtos.reduce((s, p) => s + p.nivel_atual * p.preco_unitario, 0)

  // Inicializa bulkData com valores atuais de todos os produtos
  const entrarEditMode = () => {
    const initial: Record<string, BulkRow> = {}
    produtos.forEach(p => {
      initial[p.id] = { nivel_atual: p.nivel_atual, nivel_minimo: p.nivel_minimo, nivel_ideal: p.nivel_ideal, preco_unitario: p.preco_unitario }
    })
    setBulkData(initial)
    setEditMode(true)
  }

  const cancelarEditMode = () => {
    setEditMode(false)
    setBulkData({})
  }

  const salvarEmMassa = async () => {
    setBulkSaving(true)
    try {
      // Salva apenas produtos que foram modificados
      const modificados = produtos.filter(p => {
        const d = bulkData[p.id]
        if (!d) return false
        return d.nivel_atual !== p.nivel_atual || d.nivel_minimo !== p.nivel_minimo ||
               d.nivel_ideal !== p.nivel_ideal || d.preco_unitario !== p.preco_unitario
      })
      await Promise.all(
        modificados.map(p => updateEstoqueProduto(p.id, bulkData[p.id]))
      )
      setBulkSaved(true)
      toast('Estoque atualizado em massa!')
      setTimeout(() => setBulkSaved(false), 2500)
      setEditMode(false)
      setBulkData({})
      await load()
    } catch (e) {
      console.error(e)
      toast('Erro ao salvar estoque. Tente novamente.', 'error')
    }
    setBulkSaving(false)
  }

  const setBulkField = (id: string, field: keyof BulkRow, val: number) => {
    setBulkData(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
  }

  const isModified = (p: EstoqueProduto) => {
    const d = bulkData[p.id]
    if (!d) return false
    return d.nivel_atual !== p.nivel_atual || d.nivel_minimo !== p.nivel_minimo ||
           d.nivel_ideal !== p.nivel_ideal || d.preco_unitario !== p.preco_unitario
  }

  const numModificados = editMode ? filtrados.filter(isModified).length : 0

  const openNovo = () => {
    setEditProduto(null)
    setForm({ nome: '', gramatura: 'Unidade(s)', categoria: 'Geral', nivel_minimo: '', nivel_ideal: '', preco_unitario: '' })
    setShowModal(true)
  }

  const openEdit = (p: EstoqueProduto) => {
    setEditProduto(p)
    setForm({ nome: p.nome, gramatura: p.gramatura, categoria: p.categoria, nivel_minimo: String(p.nivel_minimo), nivel_ideal: String(p.nivel_ideal), preco_unitario: String(p.preco_unitario) })
    setShowModal(true)
  }

  const salvar = async () => {
    if (!form.nome.trim()) return
    setSaving(true)
    try {
      const payload = {
        loja: loja === 'Todas as Lojas' ? (lojas[0] || loja) : loja,
        nome: form.nome.trim().toUpperCase(),
        gramatura: form.gramatura,
        categoria: form.categoria,
        nivel_atual: editProduto?.nivel_atual ?? 0,
        nivel_minimo: parseFloat(form.nivel_minimo) || 0,
        nivel_ideal: parseFloat(form.nivel_ideal) || 0,
        preco_unitario: parseFloat(form.preco_unitario) || 0,
        ativo: true,
      }
      if (editProduto) {
        await updateEstoqueProduto(editProduto.id, payload)
        toast('Produto atualizado!')
      } else {
        await insertEstoqueProduto(payload)
        toast('Produto cadastrado!')
      }
      setShowModal(false)
      await load()
    } catch {
      toast('Erro ao salvar produto. Tente novamente.', 'error')
    }
    setSaving(false)
  }

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Valor em Estoque (mês)</div>
          <div className="kpi-val">R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          <div className="kpi-sub">{loja}</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Total de Produtos</div>
          <div className="kpi-val">{produtos.length}</div>
          <div className="kpi-sub">cadastrados no estoque</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--danger)' }} />
          <div className="kpi-lbl">Nível Crítico</div>
          <div className="kpi-val" style={{ color: 'var(--danger)' }}>{criticos}</div>
          <div className="kpi-sub">produtos abaixo do mínimo</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Repor</div>
          <div className="kpi-val" style={{ color: 'var(--warning)' }}>{repor}</div>
          <div className="kpi-sub">produtos para repor</div>
        </div>
      </div>

      {bulkSaved && (
        <div className="al al-g" style={{ marginBottom: 10 }}>
          <CheckCircle size={13} /> Alterações salvas com sucesso!
        </div>
      )}

      <div className="card">
        <div className="card-hd">
          <span className="card-tt">📦 Lista de Estoque</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {editMode ? (
              <>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {numModificados > 0 ? `${numModificados} produto${numModificados > 1 ? 's' : ''} modificado${numModificados > 1 ? 's' : ''}` : 'Sem alterações'}
                </span>
                <button className="btn bo bsm" onClick={cancelarEditMode} disabled={bulkSaving}>Cancelar</button>
                <button
                  className="btn bp bsm"
                  onClick={salvarEmMassa}
                  disabled={bulkSaving || numModificados === 0}
                  style={{ minWidth: 120 }}
                >
                  {bulkSaving ? <><Loader size={10} className="spin" /> Salvando...</> : `✓ Salvar ${numModificados > 0 ? `(${numModificados})` : 'Alterações'}`}
                </button>
              </>
            ) : (
              <>
                <button className="btn bo bsm" onClick={entrarEditMode} disabled={loading || produtos.length === 0}>
                  ✏️ Edição em Massa
                </button>
                <button className="btn bp bsm" onClick={openNovo}><Plus size={11} /> Adicionar Produto</button>
              </>
            )}
          </div>
        </div>

        {editMode && (
          <div style={{ padding: '8px 15px', background: 'var(--bordo-bg)', borderBottom: '1px solid var(--bordo-l)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--bordo)', fontWeight: 600 }}>
              ✏️ Modo de edição em massa ativo — edite os campos diretamente na tabela e clique em Salvar
            </span>
          </div>
        )}

        <div style={{ padding: '10px 15px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="sw-wrap" style={{ flex: 1, minWidth: 200 }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input className="srch" placeholder="Buscar por nome..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <select className="flt" value={ordenar} onChange={e => setOrdenar(e.target.value)}>
            <option>Nome (A-Z)</option>
            <option>Nome (Z-A)</option>
          </select>
          <select className="flt" value={categoria} onChange={e => setCategoria(e.target.value)}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
          {(busca || categoria) && <button className="btn bo bsm" onClick={() => { setBusca(''); setCategoria('') }}>Limpar filtros</button>}
        </div>

        <div className="tw">
          {loading ? (
            <div className="empty"><Loader size={24} className="spin" /><div style={{ marginTop: 8 }}>Carregando...</div></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Gramatura</th>
                  <th>Filial</th>
                  <th>Nível Atual</th>
                  <th>Nível de Estoque</th>
                  <th>Mínimo</th>
                  <th>Ideal</th>
                  <th>Preço Unit.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const row = editMode ? (bulkData[p.id] ?? { nivel_atual: p.nivel_atual, nivel_minimo: p.nivel_minimo, nivel_ideal: p.nivel_ideal, preco_unitario: p.preco_unitario }) : null
                  const modified = editMode && isModified(p)
                  // Usa valores do bulkData em editMode para calcular o badge
                  const pView = row ? { ...p, ...row } : p
                  const nivel = nivelStatus(pView)
                  return (
                    <tr key={p.id} style={modified ? { background: 'var(--bordo-bg)' } : undefined}>
                      <td>
                        <strong>{p.nome}</strong>
                        {modified && <span style={{ fontSize: 9, background: 'var(--bordo)', color: '#fff', borderRadius: 4, padding: '1px 5px', marginLeft: 6, fontWeight: 700 }}>editado</span>}
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.categoria}</div>
                      </td>
                      <td style={{ color: 'var(--blue)', fontWeight: 500 }}>{p.gramatura}</td>
                      <td>{p.loja}</td>
                      <td>
                        {editMode && row ? (
                          <InlineInput value={row.nivel_atual} onChange={v => setBulkField(p.id, 'nivel_atual', v)} />
                        ) : (
                          <span style={{ fontWeight: 700, color: nivel === 'Crítico' ? 'var(--danger)' : nivel === 'Repor' ? 'var(--warning)' : 'var(--text)' }}>{p.nivel_atual}</span>
                        )}
                      </td>
                      <td><span className={`badge ${NIVEL_BADGE[nivel]}`}>{nivel}</span></td>
                      <td>
                        {editMode && row ? (
                          <InlineInput value={row.nivel_minimo} onChange={v => setBulkField(p.id, 'nivel_minimo', v)} />
                        ) : p.nivel_minimo}
                      </td>
                      <td>
                        {editMode && row ? (
                          <InlineInput value={row.nivel_ideal} onChange={v => setBulkField(p.id, 'nivel_ideal', v)} />
                        ) : p.nivel_ideal}
                      </td>
                      <td>
                        {editMode && row ? (
                          <InlineInput value={row.preco_unitario} onChange={v => setBulkField(p.id, 'preco_unitario', v)} step={0.01} prefix="R$" />
                        ) : (
                          `R$ ${p.preco_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        )}
                      </td>
                      <td>
                        {!editMode && (
                          <div className="ab"><button className="ib" onClick={() => openEdit(p)} title="Editar">✏️</button></div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {!loading && filtrados.length === 0 && (
            <div className="empty"><Package size={36} /><div>Nenhum produto encontrado</div></div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="ov open" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">{editProduto ? 'Editar Produto' : 'Novo Produto'}</span>
              <button className="mx" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="mbd">
              <div className="fg"><label className="fl">Nome <span className="rq">*</span></label><input className="inp" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
              <div className="g2">
                <div className="fg"><label className="fl">Gramatura</label>
                  <select className="sel" value={form.gramatura} onChange={e => setForm(f => ({ ...f, gramatura: e.target.value }))}>
                    <option>Unidade(s)</option><option>Quilograma(s)</option><option>Litro(s)</option><option>Pacote(s)</option><option>Caixa(s)</option><option>Grama(s)</option>
                  </select>
                </div>
                <div className="fg"><label className="fl">Categoria</label>
                  <select className="sel" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                    {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="g3">
                <div className="fg"><label className="fl">Estoque Mínimo</label><input type="number" className="inp" value={form.nivel_minimo} onChange={e => setForm(f => ({ ...f, nivel_minimo: e.target.value }))} /></div>
                <div className="fg"><label className="fl">Estoque Ideal</label><input type="number" className="inp" value={form.nivel_ideal} onChange={e => setForm(f => ({ ...f, nivel_ideal: e.target.value }))} /></div>
                <div className="fg"><label className="fl">Preço Unit. (R$)</label><input type="number" className="inp" value={form.preco_unitario} onChange={e => setForm(f => ({ ...f, preco_unitario: e.target.value }))} /></div>
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab CMV ────────────────────────────────────────────────

function TabCMV({ loja }: { loja: string }) {
  const [movs, setMovs] = useState<EstoqueMovimentacao[]>([])
  const [produtos, setProdutos] = useState<EstoqueProduto[]>([])
  const [loading, setLoading] = useState(true)
  const [faturamento, setFaturamento] = useState('')
  const [cmvResult, setCmvResult] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchEstoqueMovimentacoes(loja),
      fetchEstoqueProdutos(loja),
    ]).then(([m, p]) => { setMovs(m); setProdutos(p) }).catch(() => {}).finally(() => setLoading(false))
  }, [loja])

  // Mapa produto_nome → preco_unitario para calcular valores monetários
  const precoMap = Object.fromEntries(produtos.map(p => [p.nome, p.preco_unitario]))

  const entradasVal = movs
    .filter(m => m.tipo === 'entrada')
    .reduce((s, m) => s + m.quantidade * (precoMap[m.produto_nome] ?? 0), 0)

  const saidasVal = movs
    .filter(m => m.tipo === 'saida')
    .reduce((s, m) => s + m.quantidade * (precoMap[m.produto_nome] ?? 0), 0)

  const estoqueAtual = produtos.reduce((s, p) => s + p.nivel_atual * p.preco_unitario, 0)

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const calcular = () => {
    const fat = parseFloat(faturamento.replace(',', '.'))
    if (!fat || !saidasVal) return
    const pct = (saidasVal / fat * 100).toFixed(1)
    setCmvResult(`${pct}%`)
  }

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Estoque Atual (R$)</div>
          <div className="kpi-val" style={{ fontSize: 18 }}>{loading ? '—' : fmtBRL(estoqueAtual)}</div>
          <div className="kpi-sub">valor total em estoque</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--success)' }} />
          <div className="kpi-lbl">Entradas no Período (R$)</div>
          <div className="kpi-val" style={{ fontSize: 18, color: 'var(--success)' }}>{loading ? '—' : fmtBRL(entradasVal)}</div>
          <div className="kpi-sub">compras e reposições</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Saídas no Período (R$)</div>
          <div className="kpi-val" style={{ fontSize: 18, color: 'var(--warning)' }}>{loading ? '—' : fmtBRL(saidasVal)}</div>
          <div className="kpi-sub">consumo e perdas</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">% CMV sobre Faturamento</div>
          <div className="kpi-val" style={{ color: cmvResult ? 'var(--bordo)' : 'var(--muted)' }}>{cmvResult ?? '—'}</div>
          <div className="kpi-sub" style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 6 }}>
            <input className="inp" style={{ flex: 1, padding: '4px 8px', fontSize: 11 }} placeholder="Faturamento (R$)" value={faturamento} onChange={e => setFaturamento(e.target.value)} />
            <button className="btn bp bsm" onClick={calcular}><Calculator size={10} /> Calcular</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-tt">↕ Movimentações do Período</span>
        </div>
        <div style={{ padding: '12px 15px' }}>
          {loading ? (
            <div className="empty"><Loader size={24} className="spin" /></div>
          ) : movs.length === 0 ? (
            <div className="empty"><ArrowLeftRight size={28} /><div>Nenhuma movimentação no período</div></div>
          ) : movs.map((m, i) => {
            const valor = m.quantidade * (precoMap[m.produto_nome] ?? 0)
            return (
              <div key={i} className="sl-i">
                <div className="sl-ico" style={{ background: m.tipo === 'entrada' ? '#D1FAE5' : '#FEE2E2' }}>
                  {m.tipo === 'entrada' ? <CheckCircle size={11} style={{ color: 'var(--success)' }} /> : <XCircle size={11} style={{ color: 'var(--danger)' }} />}
                </div>
                <div style={{ fontSize: 12, flex: 1 }}>
                  No dia <strong>{fmtDate(m.created_at)}</strong>, foi{' '}
                  <span style={{ color: m.tipo === 'entrada' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {m.tipo === 'entrada' ? 'adicionado' : 'removido'}
                  </span>{' '}
                  <strong>{m.quantidade} {m.unidade}</strong> de <strong>{m.produto_nome}</strong> na filial{' '}
                  <span style={{ color: 'var(--blue)', fontWeight: 500 }}>{m.loja}</span>.
                  {m.motivo && <span style={{ color: 'var(--muted)', fontSize: 10 }}> ({m.motivo})</span>}
                </div>
                {valor > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: m.tipo === 'entrada' ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
                    {m.tipo === 'entrada' ? '+' : '-'}{fmtBRL(valor)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Tab Histórico ──────────────────────────────────────────

function TabHistorico({ loja }: { loja: string }) {
  const { user } = useAuth()
  const { lojas } = useLoja()
  const [contagens, setContagens] = useState<EstoqueContagem[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionada, setSelecionada] = useState<EstoqueContagem | null>(null)
  const [itens, setItens] = useState<EstoqueContagemItem[]>([])
  const [loadingItens, setLoadingItens] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formTipo, setFormTipo] = useState<'regular' | 'fechamento' | 'abertura'>('regular')
  const [formData, setFormData] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setContagens(await fetchEstoqueContagens(loja)) } catch {}
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const selecionar = async (c: EstoqueContagem) => {
    setSelecionada(c)
    setLoadingItens(true)
    try { setItens(await fetchEstoqueContagemItens(c.id)) } catch {}
    setLoadingItens(false)
  }

  const criar = async () => {
    setSaving(true)
    try {
      await insertEstoqueContagem({
        loja: loja === 'Todas as Lojas' ? (lojas[0] || loja) : loja,
        tipo: formTipo,
        data_contagem: formData,
        created_by: user?.name || null,
      })
      setShowForm(false)
      await load()
    } catch {}
    setSaving(false)
  }

  return (
    <div>
      <div className="sec-tt">Histórico de Contagens</div>
      <div className="sec-sub">Visualize todos os históricos de contagens que você já fez</div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 15 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Seu histórico</div>
          <button className="btn bp" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }} onClick={() => setShowForm(true)}>
            <Plus size={11} /> Criar histórico
          </button>
          {loading ? <div className="empty"><Loader size={18} className="spin" /></div> : contagens.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>Nenhuma contagem ainda</div>
          ) : contagens.map(c => (
            <div key={c.id} onClick={() => selecionar(c)} style={{ padding: '8px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 4, background: selecionada?.id === c.id ? 'var(--bordo-bg)' : 'transparent', border: `1px solid ${selecionada?.id === c.id ? 'var(--bordo-l)' : 'var(--border)'}` }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{new Date(c.data_contagem + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{c.tipo} · por {c.created_by || 'sistema'}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 15, minHeight: 200 }}>
          {selecionada ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                Contagem de {new Date(selecionada.data_contagem + 'T12:00:00').toLocaleDateString('pt-BR')} — {selecionada.tipo}
              </div>
              {loadingItens ? <div className="empty"><Loader size={18} className="spin" /></div> : itens.length === 0 ? (
                <div className="empty"><ClipboardList size={28} /><div>Sem itens nesta contagem</div></div>
              ) : (
                <div className="tw">
                  <table>
                    <thead><tr><th>Produto</th><th>Unidade</th><th>Qtd Contada</th></tr></thead>
                    <tbody>
                      {itens.map(it => (
                        <tr key={it.id}><td><strong>{it.produto_nome}</strong></td><td>{it.unidade}</td><td style={{ fontWeight: 700 }}>{it.quantidade_contada}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="empty" style={{ padding: '60px 0' }}>
              <History size={36} />
              <div style={{ marginTop: 8, fontWeight: 600 }}>Selecione uma data para ver o histórico</div>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="ov open" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Criar Histórico de Contagem</span><button className="mx" onClick={() => setShowForm(false)}>✕</button></div>
            <div className="mbd">
              <div className="fg"><label className="fl">Data</label><input type="date" className="inp" value={formData} onChange={e => setFormData(e.target.value)} /></div>
              <div className="fg"><label className="fl">Tipo</label>
                <select className="sel" value={formTipo} onChange={e => setFormTipo(e.target.value as typeof formTipo)}>
                  <option value="regular">Contagem regular</option>
                  <option value="fechamento">Contagem de fechamento</option>
                  <option value="abertura">Contagem de abertura</option>
                </select>
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn bp" onClick={criar} disabled={saving}>{saving ? 'Criando...' : 'Criar histórico'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Movimentações ──────────────────────────────────────

function TabMovimentacoes({ loja }: { loja: string }) {
  const { user } = useAuth()
  const { lojas } = useLoja()
  const { toast } = useToast()
  const [dias, setDias] = useState<string[]>([])
  const [diaSel, setDiaSel] = useState<string | null>(null)
  const [movs, setMovs] = useState<EstoqueMovimentacao[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMovs, setLoadingMovs] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [produtos, setProdutos] = useState<EstoqueProduto[]>([])
  const [form, setForm] = useState({ produto_id: '', produto_nome: '', tipo: 'entrada' as 'entrada' | 'saida', quantidade: '', motivo: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, p] = await Promise.all([fetchEstoqueMovimentacoesDias(loja), fetchEstoqueProdutos(loja)])
      setDias(d)
      setProdutos(p)
    } catch {}
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const selecionarDia = async (dia: string) => {
    setDiaSel(dia)
    setLoadingMovs(true)
    try { setMovs(await fetchEstoqueMovimentacoes(loja, dia)) } catch {}
    setLoadingMovs(false)
  }

  const registrar = async () => {
    if (!form.produto_nome || !form.quantidade) return
    setSaving(true)
    try {
      const prod = produtos.find(p => p.id === form.produto_id)
      const qtd = parseFloat(form.quantidade)
      await insertEstoqueMovimentacao({
        loja: loja === 'Todas as Lojas' ? (lojas[0] || loja) : loja,
        produto_id: form.produto_id || null,
        produto_nome: form.produto_nome,
        tipo: form.tipo,
        quantidade: qtd,
        unidade: prod?.gramatura.replace('(s)', '') || 'un',
        motivo: form.motivo || null,
        created_by: user?.name || null,
      })
      // Atualiza nivel_atual do produto no Supabase
      if (prod && form.produto_id) {
        const delta = form.tipo === 'entrada' ? qtd : -qtd
        const novoNivel = Math.max(0, prod.nivel_atual + delta)
        await updateEstoqueProduto(form.produto_id, { nivel_atual: novoNivel })
      }
      setShowModal(false)
      setForm({ produto_id: '', produto_nome: '', tipo: 'entrada', quantidade: '', motivo: '' })
      toast('Movimentação registrada!')
      await load()
      if (diaSel) await selecionarDia(diaSel)
    } catch (e) {
      console.error(e)
      toast('Erro ao registrar movimentação. Tente novamente.', 'error')
    }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div className="sec-tt">Suas movimentações</div>
          <div className="sec-sub">Histórico de todos os produtos que foram atualizados.</div>
        </div>
        <button className="btn bp bsm" onClick={() => setShowModal(true)}><Plus size={11} /> Registrar Movimentação</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 15 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Movimentações</div>
          {loading ? <div className="empty"><Loader size={18} className="spin" /></div> : dias.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>Nenhuma movimentação</div>
          ) : dias.map(d => (
            <button key={d} onClick={() => selecionarDia(d)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '9px 12px', borderRadius: 7, border: `1px solid ${diaSel === d ? 'var(--bordo-l)' : 'var(--border)'}`,
              background: diaSel === d ? 'var(--bordo-bg)' : '#fff', color: diaSel === d ? 'var(--bordo)' : 'var(--text)',
              fontWeight: 600, fontSize: 12.5, cursor: 'pointer', marginBottom: 5,
            }}>
              {new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')} <ChevronRight size={13} />
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: 15 }}>
          {diaSel ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                Histórico de {new Date(diaSel + 'T12:00:00').toLocaleDateString('pt-BR')}
              </div>
              {loadingMovs ? <div className="empty"><Loader size={18} className="spin" /></div> : movs.length === 0 ? (
                <div className="empty"><ArrowLeftRight size={28} /><div>Nenhuma movimentação neste dia</div></div>
              ) : movs.map((m, i) => (
                <div key={i} className="sl-i">
                  <div className="sl-ico" style={{ background: m.tipo === 'entrada' ? '#D1FAE5' : '#FEE2E2' }}>
                    {m.tipo === 'entrada' ? <CheckCircle size={11} style={{ color: 'var(--success)' }} /> : <XCircle size={11} style={{ color: 'var(--danger)' }} />}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    Foi <span style={{ color: m.tipo === 'entrada' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      {m.tipo === 'entrada' ? 'adicionado' : 'removido'}
                    </span>{' '}
                    <strong>{m.quantidade} {m.unidade}</strong> de <strong>{m.produto_nome}</strong> na filial{' '}
                    <span style={{ color: 'var(--blue)', fontWeight: 500 }}>{m.loja}</span>.
                    {m.motivo && <span style={{ color: 'var(--muted)', fontSize: 10 }}> ({m.motivo})</span>}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="empty" style={{ padding: '60px 0' }}>
              <ArrowLeftRight size={36} />
              <div style={{ marginTop: 8, fontWeight: 600 }}>Selecione uma data para ver o histórico</div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="ov open" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Registrar Movimentação</span><button className="mx" onClick={() => setShowModal(false)}>✕</button></div>
            <div className="mbd">
              <div className="fg"><label className="fl">Produto <span className="rq">*</span></label>
                <select className="sel" value={form.produto_id} onChange={e => {
                  const p = produtos.find(x => x.id === e.target.value)
                  setForm(f => ({ ...f, produto_id: e.target.value, produto_nome: p?.nome || '' }))
                }}>
                  <option value="">Selecione um produto</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="g2">
                <div className="fg"><label className="fl">Tipo</label>
                  <select className="sel" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'entrada' | 'saida' }))}>
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saída</option>
                  </select>
                </div>
                <div className="fg"><label className="fl">Quantidade <span className="rq">*</span></label>
                  <input type="number" className="inp" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} />
                </div>
              </div>
              <div className="fg"><label className="fl">Motivo</label>
                <input className="inp" placeholder="Ex: Compra, Uso produção, Perda..." value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} />
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn bp" onClick={registrar} disabled={saving}>{saving ? 'Salvando...' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Contagem ───────────────────────────────────────────

function TabContagem({ loja }: { loja: string }) {
  const { user } = useAuth()
  const { lojas } = useLoja()
  const { toast } = useToast()
  const [produtos, setProdutos] = useState<EstoqueProduto[]>([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState<'regular' | 'fechamento' | 'abertura'>('regular')
  const [categoria, setCategoria] = useState('')
  const [contagens, setContagens] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchEstoqueProdutos(loja).then(p => {
      setProdutos(p)
      setContagens(Object.fromEntries(p.map(x => [x.id, 0])))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [loja])

  const filtrados = produtos.filter(p => !categoria || p.categoria === categoria)

  const salvar = async () => {
    setSaving(true)
    try {
      const lojaReal = loja === 'Todas as Lojas' ? (lojas[0] || loja) : loja
      const contagem = await insertEstoqueContagem({ loja: lojaReal, tipo, data_contagem: new Date().toISOString().slice(0, 10), created_by: user?.name || null })
      const itens: Omit<EstoqueContagemItem, 'id' | 'created_at'>[] = filtrados
        .filter(p => (contagens[p.id] ?? 0) >= 0)
        .map(p => ({
          contagem_id: contagem.id,
          produto_id: p.id,
          produto_nome: p.nome,
          quantidade_contada: contagens[p.id] ?? 0,
          unidade: p.gramatura.replace('(s)', ''),
        }))
      if (itens.length) await upsertEstoqueContagemItens(itens)
      // Atualiza nivel_atual de cada produto com a quantidade contada
      await Promise.all(
        filtrados.map(p =>
          updateEstoqueProduto(p.id, { nivel_atual: contagens[p.id] ?? 0 })
        )
      )
      setSaved(true)
      toast('Contagem salva com sucesso!')
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error(e)
      toast('Erro ao salvar contagem. Tente novamente.', 'error')
    }
    setSaving(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="sec-tt">Contagem de Estoque</div>
          <div className="sec-sub">Preencha os campos abaixo para fazer uma contagem de estoque</div>
        </div>
        <button className="btn bo" onClick={() => window.print()}><Download size={11} /> Baixar PDF</button>
      </div>

      <div className="card" style={{ padding: 15, marginBottom: 14 }}>
        <div className="g2" style={{ marginBottom: 11 }}>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Tipo de contagem</label>
            <select className="sel" value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}>
              <option value="regular">Contagem regular</option>
              <option value="fechamento">Contagem de fechamento</option>
              <option value="abertura">Contagem de abertura</option>
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Categoria</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="sel" value={categoria} onChange={e => setCategoria(e.target.value)} style={{ flex: 1 }}>
                <option value="">Todas</option>
                {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
              </select>
              {categoria && <button className="btn bo bsm" onClick={() => setCategoria('')}>Limpar</button>}
            </div>
          </div>
        </div>
      </div>

      {saved && <div className="al al-g" style={{ marginBottom: 12 }}><CheckCircle size={13} /> Contagem salva com sucesso!</div>}

      <div className="card">
        {loading ? (
          <div className="empty"><Loader size={24} className="spin" /></div>
        ) : (
          <div className="tw">
            <table>
              <thead><tr><th>Produto</th><th>Unidade de Medida</th><th style={{ width: 160 }}>Contagem</th></tr></thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.nome}</strong><div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.categoria}</div></td>
                    <td style={{ color: 'var(--muted)' }}>{p.gramatura.replace('(s)', '')}</td>
                    <td>
                      <input type="number" className="inp" style={{ padding: '4px 8px', fontSize: 12 }} min={0}
                        value={contagens[p.id] ?? 0}
                        onChange={e => setContagens(prev => ({ ...prev, [p.id]: parseFloat(e.target.value) || 0 }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: '12px 15px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn bp" onClick={salvar} disabled={saving || loading}>
            <ClipboardList size={11} /> {saving ? 'Salvando...' : 'Salvar Contagem'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── EstoquePage ────────────────────────────────────────────

type EstoqueTab = 'lista' | 'cmv' | 'historico' | 'movimentacoes' | 'contagem'

const TABS: { id: EstoqueTab; label: string; icon: React.ReactNode }[] = [
  { id: 'lista', label: 'Lista', icon: <Package size={12} /> },
  { id: 'cmv', label: 'CMV', icon: <TrendingDown size={12} /> },
  { id: 'historico', label: 'Histórico', icon: <History size={12} /> },
  { id: 'movimentacoes', label: 'Movimentações', icon: <ArrowLeftRight size={12} /> },
  { id: 'contagem', label: 'Contagem', icon: <ClipboardList size={12} /> },
]

export default function EstoquePage() {
  const { loja } = useLoja()
  const [tab, setTab] = useState<EstoqueTab>('lista')

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'lista' && <TabLista loja={loja} />}
      {tab === 'cmv' && <TabCMV loja={loja} />}
      {tab === 'historico' && <TabHistorico loja={loja} />}
      {tab === 'movimentacoes' && <TabMovimentacoes loja={loja} />}
      {tab === 'contagem' && <TabContagem loja={loja} />}
    </div>
  )
}

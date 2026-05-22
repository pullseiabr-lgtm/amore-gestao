import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, Plus, Trash2, Edit3, Loader, Search,
  XCircle, CheckCircle2, Package, BarChart2,
  RefreshCw, Calendar,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import { fetchRupturas, insertRuptura, updateRuptura, deleteRuptura, type Ruptura } from '../../lib/db'

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

const MOTIVOS = [
  { value: 'estoque_zerado',         label: 'Estoque zerado' },
  { value: 'fornecedor_indisponivel',label: 'Fornecedor indisponível' },
  { value: 'logistica',              label: 'Logística' },
  { value: 'qualidade',              label: 'Qualidade' },
  { value: 'preco',                  label: 'Preço' },
  { value: 'outros',                 label: 'Outros' },
]

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  aberta:    { label: 'Aberta',    cls: 'bg-r' },
  parcial:   { label: 'Parcial',   cls: 'bg-y' },
  resolvida: { label: 'Resolvida', cls: 'bg-g' },
}

const FORM_INIT = {
  produto_nome: '', categoria: '', qtd_solicitada: '', qtd_atendida: '',
  motivo: 'estoque_zerado', motivo_descricao: '', impacto_financeiro: '',
  unidade: '', fornecedor_nome: '', responsavel: '', data_ocorrencia: '',
  numero_pedido: '', cliente: '', status: 'aberta' as Ruptura['status'],
}

// ── Modal ─────────────────────────────────────────────────────

function ModalRuptura({
  ruptura, loja, userName, onClose, onSalvo,
}: {
  ruptura: Ruptura | null
  loja: string
  userName: string
  onClose: () => void
  onSalvo: () => void
}) {
  const [form, setForm] = useState({
    ...FORM_INIT,
    responsavel: userName,
    data_ocorrencia: new Date().toISOString().slice(0, 10),
    ...(ruptura ? {
      produto_nome:      ruptura.produto_nome,
      categoria:         ruptura.categoria ?? '',
      qtd_solicitada:    String(ruptura.qtd_solicitada),
      qtd_atendida:      String(ruptura.qtd_atendida),
      motivo:            ruptura.motivo ?? 'outros',
      motivo_descricao:  ruptura.motivo_descricao ?? '',
      impacto_financeiro:String(ruptura.impacto_financeiro),
      unidade:           ruptura.unidade ?? '',
      fornecedor_nome:   ruptura.fornecedor_nome ?? '',
      responsavel:       ruptura.responsavel ?? userName,
      data_ocorrencia:   ruptura.data_ocorrencia,
      numero_pedido:     ruptura.numero_pedido ?? '',
      cliente:           ruptura.cliente ?? '',
      status:            ruptura.status,
    } : {}),
  })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const salvar = async () => {
    if (!form.produto_nome.trim() || !form.qtd_solicitada) {
      setErro('Produto e quantidade solicitada são obrigatórios')
      return
    }
    setSaving(true)
    setErro('')
    try {
      const payload = {
        loja,
        produto_nome: form.produto_nome.trim(),
        categoria: form.categoria || null,
        qtd_solicitada: parseFloat(form.qtd_solicitada) || 0,
        qtd_atendida: parseFloat(form.qtd_atendida) || 0,
        motivo: form.motivo || null,
        motivo_descricao: form.motivo_descricao || null,
        impacto_financeiro: parseFloat(form.impacto_financeiro) || 0,
        unidade: form.unidade || null,
        fornecedor_nome: form.fornecedor_nome || null,
        responsavel: form.responsavel || null,
        data_ocorrencia: form.data_ocorrencia || new Date().toISOString().slice(0, 10),
        numero_pedido: form.numero_pedido || null,
        cliente: form.cliente || null,
        status: form.status,
        created_by: userName,
      }
      if (ruptura) {
        await updateRuptura(ruptura.id, payload)
      } else {
        await insertRuptura(payload)
      }
      onSalvo()
    } catch {
      setErro('Erro ao salvar. Tente novamente.')
    }
    setSaving(false)
  }

  return (
    <div className="ov open">
      <div className="modal lg">
        <div className="mhd">
          <span className="mtt">{ruptura ? 'Editar Ruptura' : 'Registrar Ruptura'}</span>
          <button className="mx" onClick={onClose}><XCircle size={13} /></button>
        </div>
        <div className="mbd">
          {erro && <div className="al al-r" style={{ marginBottom: 12 }}><AlertTriangle size={13} />{erro}</div>}

          <div className="g2">
            <div className="fg">
              <label className="fl">Produto <span className="rq">*</span></label>
              <input className="inp" value={form.produto_nome} onChange={e => set('produto_nome', e.target.value)} placeholder="Nome do produto" />
            </div>
            <div className="fg">
              <label className="fl">Categoria</label>
              <input className="inp" value={form.categoria} onChange={e => set('categoria', e.target.value)} placeholder="Ex: Açaí, Bebidas…" />
            </div>
          </div>

          <div className="g3">
            <div className="fg">
              <label className="fl">Qtd Solicitada <span className="rq">*</span></label>
              <input type="number" min="0" step="0.001" className="inp" value={form.qtd_solicitada}
                onChange={e => set('qtd_solicitada', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Qtd Atendida</label>
              <input type="number" min="0" step="0.001" className="inp" value={form.qtd_atendida}
                onChange={e => set('qtd_atendida', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Unidade</label>
              <input className="inp" value={form.unidade} onChange={e => set('unidade', e.target.value)} placeholder="kg, un, L…" />
            </div>
          </div>

          <div className="g2">
            <div className="fg">
              <label className="fl">Motivo da Ruptura</label>
              <select className="sel" value={form.motivo} onChange={e => set('motivo', e.target.value)}>
                {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Impacto Financeiro (R$)</label>
              <input type="number" min="0" step="0.01" className="inp" value={form.impacto_financeiro}
                onChange={e => set('impacto_financeiro', e.target.value)} placeholder="0,00" />
            </div>
          </div>

          <div className="fg">
            <label className="fl">Descrição do Motivo</label>
            <textarea className="txa" value={form.motivo_descricao} onChange={e => set('motivo_descricao', e.target.value)}
              placeholder="Descreva o motivo detalhado da ruptura…" rows={2} />
          </div>

          <div className="g2">
            <div className="fg">
              <label className="fl">Nº do Pedido</label>
              <input className="inp" value={form.numero_pedido} onChange={e => set('numero_pedido', e.target.value)} placeholder="Opcional" />
            </div>
            <div className="fg">
              <label className="fl">Cliente</label>
              <input className="inp" value={form.cliente} onChange={e => set('cliente', e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div className="g3">
            <div className="fg">
              <label className="fl">Fornecedor</label>
              <input className="inp" value={form.fornecedor_nome} onChange={e => set('fornecedor_nome', e.target.value)} placeholder="Nome do fornecedor" />
            </div>
            <div className="fg">
              <label className="fl">Responsável</label>
              <input className="inp" value={form.responsavel} onChange={e => set('responsavel', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Data da Ocorrência</label>
              <input type="date" className="inp" value={form.data_ocorrencia} onChange={e => set('data_ocorrencia', e.target.value)} />
            </div>
          </div>

          <div className="fg">
            <label className="fl">Status</label>
            <select className="sel" value={form.status} onChange={e => set('status', e.target.value as Ruptura['status'])}>
              <option value="aberta">Aberta</option>
              <option value="parcial">Parcialmente resolvida</option>
              <option value="resolvida">Resolvida</option>
            </select>
          </div>
        </div>
        <div className="mft">
          <button className="btn bo" onClick={onClose}>Cancelar</button>
          <button className="btn bp" onClick={salvar} disabled={saving}>
            {saving ? <Loader size={11} className="spin" /> : <CheckCircle2 size={11} />}
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard de Indicadores ──────────────────────────────────

function DashIndicadores({ rupturas }: { rupturas: Ruptura[] }) {
  const totalRupturas = rupturas.length
  const impactoTotal  = rupturas.reduce((s, r) => s + r.impacto_financeiro, 0)
  const abertas       = rupturas.filter(r => r.status === 'aberta').length
  const resolvidas    = rupturas.filter(r => r.status === 'resolvida').length

  // Top 5 produtos com mais ruptura
  const porProduto: Record<string, number> = {}
  rupturas.forEach(r => {
    porProduto[r.produto_nome] = (porProduto[r.produto_nome] ?? 0) + r.qtd_ruptura
  })
  const topProdutos = Object.entries(porProduto)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Por motivo
  const porMotivo: Record<string, number> = {}
  rupturas.forEach(r => {
    const k = r.motivo ?? 'outros'
    porMotivo[k] = (porMotivo[k] ?? 0) + 1
  })

  // Por categoria
  const porCategoria: Record<string, { qtd: number; impacto: number }> = {}
  rupturas.forEach(r => {
    const k = r.categoria ?? 'Sem categoria'
    if (!porCategoria[k]) porCategoria[k] = { qtd: 0, impacto: 0 }
    porCategoria[k].qtd++
    porCategoria[k].impacto += r.impacto_financeiro
  })
  const topCategorias = Object.entries(porCategoria).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 5)

  const maxQtd = topProdutos[0]?.[1] ?? 1

  const MOTIVO_LABELS: Record<string, string> = {
    estoque_zerado: 'Estoque zerado', fornecedor_indisponivel: 'Forn. indisponível',
    logistica: 'Logística', qualidade: 'Qualidade', preco: 'Preço', outros: 'Outros',
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 16 }}>
      {/* KPIs */}
      <div className="card" style={{ padding: 14, gridColumn: 'span 2' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {[
            { lbl: 'Total Rupturas', val: totalRupturas, color: 'var(--danger)' },
            { lbl: 'Abertas',        val: abertas,       color: 'var(--warning)' },
            { lbl: 'Resolvidas',     val: resolvidas,    color: 'var(--success)' },
            { lbl: 'Impacto Total',  val: fmtBRL(impactoTotal), color: 'var(--purple)' },
          ].map(k => (
            <div key={k.lbl} style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 8, background: 'var(--cream)' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{k.lbl}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: k.color, fontFamily: 'Plus Jakarta Sans' }}>{k.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top produtos */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}>Top Produtos em Ruptura</div>
        {topProdutos.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>Sem dados</div>
        ) : topProdutos.map(([nome, qtd]) => (
          <div key={nome} className="bc-row" style={{ marginBottom: 6 }}>
            <div className="bc-lbl" style={{ width: 100, fontSize: 10 }} title={nome}>{nome.length > 14 ? nome.slice(0, 14) + '…' : nome}</div>
            <div className="bc-out" style={{ flex: 1 }}>
              <div className="bc-in" style={{ width: `${(qtd / maxQtd) * 100}%`, background: 'var(--danger)' }} />
            </div>
            <div className="bc-val">{qtd.toFixed(1)}</div>
          </div>
        ))}
      </div>

      {/* Por motivo */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}>Rupturas por Motivo</div>
        {Object.entries(porMotivo).length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>Sem dados</div>
        ) : Object.entries(porMotivo).sort((a, b) => b[1] - a[1]).map(([motivo, qtd]) => (
          <div key={motivo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11 }}>{MOTIVO_LABELS[motivo] ?? motivo}</span>
            <span className="badge bg-r">{qtd}</span>
          </div>
        ))}
      </div>

      {/* Por categoria */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}>Ruptura por Categoria</div>
        {topCategorias.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>Sem dados</div>
        ) : topCategorias.map(([cat, d]) => (
          <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11 }}>{cat}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="badge bg-r">{d.qtd} rupt.</span>
              {d.impacto > 0 && <span className="badge bg-y">{fmtBRL(d.impacto)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Página Principal ──────────────────────────────────────────

export default function RupturaPage() {
  const { user } = useAuth()
  const { loja } = useLoja()
  const [rupturas, setRupturas] = useState<Ruptura[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'lista' | 'dashboard'>('lista')
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [filtroMotivo, setFiltroMotivo] = useState<string>('todos')
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10))
  const [modal, setModal] = useState<{ open: boolean; ruptura: Ruptura | null }>({ open: false, ruptura: null })
  const [confirmDelete, setConfirmDelete] = useState<Ruptura | null>(null)

  const userName = user?.name ?? user?.email ?? 'Usuário'

  const load = useCallback(async () => {
    setLoading(true)
    try { setRupturas(await fetchRupturas(loja, dataInicio, dataFim)) } catch {}
    setLoading(false)
  }, [loja, dataInicio, dataFim])

  useEffect(() => { load() }, [load])

  const filtradas = rupturas
    .filter(r => !busca || r.produto_nome.toLowerCase().includes(busca.toLowerCase())
      || (r.cliente ?? '').toLowerCase().includes(busca.toLowerCase())
      || (r.numero_pedido ?? '').toLowerCase().includes(busca.toLowerCase()))
    .filter(r => filtroStatus === 'todos' || r.status === filtroStatus)
    .filter(r => filtroMotivo === 'todos' || r.motivo === filtroMotivo)

  const handleDelete = async (r: Ruptura) => {
    try { await deleteRuptura(r.id); await load() } catch {}
    setConfirmDelete(null)
  }

  return (
    <div>
      <div className="fb" style={{ marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div className="sec-tt">Ruptura de Pedidos</div>
          <div className="sec-sub">Monitore e analise as rupturas operacionais</div>
        </div>
        <button className="btn bp bsm" onClick={() => setModal({ open: true, ruptura: null })}>
          <Plus size={11} /> Registrar Ruptura
        </button>
      </div>

      {/* Filtro de período */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Calendar size={13} color="var(--muted)" />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" className="inp" style={{ width: 'auto', fontSize: 12 }}
              value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>até</span>
            <input type="date" className="inp" style={{ width: 'auto', fontSize: 12 }}
              value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
          <button className="btn bo bsm" onClick={load}>
            <RefreshCw size={11} /> Atualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab${tab === 'lista' ? ' active' : ''}`} onClick={() => setTab('lista')}>
          <Package size={11} style={{ marginRight: 4 }} /> Lista ({rupturas.length})
        </button>
        <button className={`tab${tab === 'dashboard' ? ' active' : ''}`} onClick={() => setTab('dashboard')}>
          <BarChart2 size={11} style={{ marginRight: 4 }} /> Indicadores
        </button>
      </div>

      {tab === 'dashboard' && <DashIndicadores rupturas={rupturas} />}

      {tab === 'lista' && (
        <>
          {/* Filtros */}
          <div className="fb" style={{ marginBottom: 12 }}>
            <div className="sw-wrap">
              <Search size={12} />
              <input className="srch" placeholder="Buscar produto, cliente, pedido…"
                value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <select className="flt" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="todos">Todos status</option>
              <option value="aberta">Aberta</option>
              <option value="parcial">Parcial</option>
              <option value="resolvida">Resolvida</option>
            </select>
            <select className="flt" value={filtroMotivo} onChange={e => setFiltroMotivo(e.target.value)}>
              <option value="todos">Todos motivos</option>
              {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="empty"><Loader size={18} className="spin" /></div>
          ) : filtradas.length === 0 ? (
            <div className="empty">
              <AlertTriangle size={32} />
              <div style={{ marginTop: 8, fontWeight: 600 }}>Nenhuma ruptura registrada</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Registre rupturas para acompanhar o impacto operacional</div>
            </div>
          ) : (
            <div className="card">
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Pedido</th>
                      <th>Cliente</th>
                      <th>Solicitado</th>
                      <th>Atendido</th>
                      <th>Ruptura</th>
                      <th>%</th>
                      <th>Impacto</th>
                      <th>Motivo</th>
                      <th>Fornecedor</th>
                      <th>Responsável</th>
                      <th>Data</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map(r => {
                      const sb = STATUS_BADGE[r.status]
                      const pctCls = r.pct_ruptura >= 80 ? '#DC2626' : r.pct_ruptura >= 40 ? '#D97706' : '#059669'
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600, minWidth: 130 }}>{r.produto_nome}</td>
                          <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.numero_pedido ?? '—'}</td>
                          <td style={{ fontSize: 11 }}>{r.cliente ?? '—'}</td>
                          <td>{r.qtd_solicitada} {r.unidade ?? ''}</td>
                          <td>{r.qtd_atendida} {r.unidade ?? ''}</td>
                          <td style={{ color: '#DC2626', fontWeight: 700 }}>{r.qtd_ruptura.toFixed(2)}</td>
                          <td style={{ color: pctCls, fontWeight: 700 }}>{r.pct_ruptura.toFixed(0)}%</td>
                          <td>{r.impacto_financeiro > 0 ? fmtBRL(r.impacto_financeiro) : '—'}</td>
                          <td style={{ fontSize: 11 }}>{MOTIVOS.find(m => m.value === r.motivo)?.label ?? r.motivo ?? '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.fornecedor_nome ?? '—'}</td>
                          <td style={{ fontSize: 11 }}>{r.responsavel ?? '—'}</td>
                          <td style={{ fontSize: 11 }}>{fmtDate(r.data_ocorrencia)}</td>
                          <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                          <td>
                            <div className="ab">
                              <button className="ib" onClick={() => setModal({ open: true, ruptura: r })} title="Editar">
                                <Edit3 size={11} />
                              </button>
                              <button className="ib rd" onClick={() => setConfirmDelete(r)} title="Excluir">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {modal.open && (
        <ModalRuptura
          ruptura={modal.ruptura}
          loja={loja}
          userName={userName}
          onClose={() => setModal({ open: false, ruptura: null })}
          onSalvo={() => { setModal({ open: false, ruptura: null }); load() }}
        />
      )}

      {confirmDelete && (
        <div className="cnf-overlay open">
          <div className="cnf-box">
            <div className="cnf-ico"><Trash2 size={18} color="var(--danger)" /></div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Excluir ruptura?</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{confirmDelete.produto_nome}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn bo" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn bd" onClick={() => handleDelete(confirmDelete)}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

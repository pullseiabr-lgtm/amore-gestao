import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Search, ShoppingBag, Star, Clock, TrendingUp, Loader2, X, BarChart2, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useLoja } from '../../contexts/LojaContext'
import { useToast } from '../../hooks/useToast'
import { fetchVendas, insertVenda } from '../../lib/db'
import type { Venda, VendaItem } from '../../lib/db'
import Modal from '../../components/ui/Modal'

const CANAIS = [
  { value: 'salao', label: 'Salão' },
  { value: 'balcao', label: 'Balcão' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'app', label: 'App' },
]

const PAGAMENTOS = [
  { value: 'pix', label: 'PIX' },
  { value: 'credito', label: 'Crédito' },
  { value: 'debito', label: 'Débito' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'vr', label: 'VR / VA' },
]

const CARDAPIO = [
  { nome: 'Risoto de Funghi', preco: 58.90 },
  { nome: 'Macarrão à Bolonhesa', preco: 49.90 },
  { nome: 'Filé Mignon ao Molho Madeira', preco: 89.90 },
  { nome: 'Salmão Grelhado', preco: 76.90 },
  { nome: 'Parmegiana de Frango', preco: 54.90 },
  { nome: 'Picanha na Brasa', preco: 98.00 },
  { nome: 'Pizza Margherita', preco: 62.00 },
  { nome: 'Pizza 4 Queijos', preco: 58.00 },
  { nome: 'Hambúrguer Artesanal', preco: 38.90 },
  { nome: 'Salada Caesar', preco: 32.90 },
  { nome: 'Combo Executivo', preco: 34.90 },
  { nome: 'Tiramisu', preco: 28.90 },
  { nome: 'Suco Natural', preco: 14.90 },
  { nome: 'Refrigerante', preco: 8.00 },
  { nome: 'Cerveja Long Neck', preco: 13.90 },
  { nome: 'Água com Gás', preco: 6.00 },
  { nome: 'Cappuccino', preco: 18.90 },
  { nome: 'Batata Frita', preco: 22.00 },
  { nome: 'Farofa', preco: 12.00 },
]

function canalLabel(c: string) { return CANAIS.find(x => x.value === c)?.label || c }
function pagLabel(p: string) { return PAGAMENTOS.find(x => x.value === p)?.label || p }
function stars(n: number | null) { if (!n) return '—'; return '★'.repeat(n) + '☆'.repeat(5 - n) }
function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(iso: string) { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }

const EMPTY_FORM = {
  loja: '', colaborador: '', canal: 'salao' as Venda['canal'],
  pagamento: 'pix' as Venda['pagamento'], avaliacao: 5, tempo_min: 15, obs: '',
}

type PageTab = 'vendas' | 'dashboard'

export default function VendasPage() {
  const { user, can, isDemoMode } = useAuth()
  const { theme } = useTheme()
  const { loja, lojas } = useLoja()
  const { toast } = useToast()
  // Para formulário: garante loja real (nunca 'Todas as Lojas')
  const lojaReal = (loja && loja !== 'Todas as Lojas') ? loja : (lojas.find(l => l !== 'Todas as Lojas') || theme.stores[0] || '')

  const [pageTab, setPageTab] = useState<PageTab>('vendas')
  const [vendas, setVendas] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [filterLoja, setFilterLoja] = useState('')
  const [filterCanal, setFilterCanal] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [itens, setItens] = useState<VendaItem[]>([])
  const [itemNome, setItemNome] = useState('')
  const [itemQtd, setItemQtd] = useState(1)
  const [itemPreco, setItemPreco] = useState('')

  const loadVendas = useCallback(() => {
    setLoading(true)
    const fallback = setTimeout(() => setLoading(false), 7000)
    fetchVendas(loja)
      .then(data => setVendas(data))
      .catch(() => {})
      .finally(() => { clearTimeout(fallback); setLoading(false) })
    return () => clearTimeout(fallback)
  }, [loja])

  useEffect(() => { return loadVendas() }, [loadVendas])

  const total = itens.reduce((acc, i) => acc + i.qtd * i.preco, 0)

  const filtered = vendas.filter(v => {
    const q = search.toLowerCase()
    const matchQ = !q || v.colaborador.toLowerCase().includes(q) || v.loja.toLowerCase().includes(q)
    const matchL = !filterLoja || v.loja === filterLoja
    const matchC = !filterCanal || v.canal === filterCanal
    return matchQ && matchL && matchC
  })

  const today = vendas.filter(v => new Date(v.created_at).toDateString() === new Date().toDateString())
  const fatHoje = today.reduce((s, v) => s + Number(v.total), 0)
  const ticketMedio = today.length ? fatHoje / today.length : 0
  const avalMedia = today.filter(v => v.avaliacao).reduce((s, v, _, a) => s + (v.avaliacao || 0) / a.length, 0)

  // ── Dashboard analytics ──────────────────────────────────────
  const dash = useMemo(() => {
    const now = new Date()
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const week  = vendas.filter(v => new Date(v.created_at) >= startOfWeek)
    const month = vendas.filter(v => new Date(v.created_at) >= startOfMonth)

    const fatSemana = week.reduce((s, v) => s + Number(v.total), 0)
    const fatMes    = month.reduce((s, v) => s + Number(v.total), 0)

    // Ranking por colaborador (mês)
    const byColab: Record<string, { fat: number; cnt: number; aval: number[]; loja: string }> = {}
    month.forEach(v => {
      if (!byColab[v.colaborador]) byColab[v.colaborador] = { fat: 0, cnt: 0, aval: [], loja: v.loja }
      byColab[v.colaborador].fat += Number(v.total)
      byColab[v.colaborador].cnt += 1
      if (v.avaliacao) byColab[v.colaborador].aval.push(v.avaliacao)
    })
    const rankingColab = Object.entries(byColab)
      .map(([nome, d]) => ({
        nome, loja: d.loja, fat: d.fat, cnt: d.cnt,
        ticket: d.cnt ? d.fat / d.cnt : 0,
        aval: d.aval.length ? d.aval.reduce((a, b) => a + b, 0) / d.aval.length : 0,
      }))
      .sort((a, b) => b.fat - a.fat)

    // Ranking por canal (mês)
    const byCanal: Record<string, number> = {}
    month.forEach(v => { byCanal[v.canal] = (byCanal[v.canal] || 0) + Number(v.total) })

    // Prato mais vendido (mês)
    const pratoCnt: Record<string, number> = {}
    month.forEach(v => {
      if (Array.isArray(v.itens)) {
        v.itens.forEach((it: VendaItem) => {
          pratoCnt[it.nome] = (pratoCnt[it.nome] || 0) + it.qtd
        })
      }
    })
    const pratos = Object.entries(pratoCnt).sort((a, b) => b[1] - a[1])

    // Comparativo últimos 7 dias
    const dias7: { label: string; fat: number; cnt: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0, 0, 0, 0)
      const next = new Date(d); next.setDate(d.getDate() + 1)
      const dvs = vendas.filter(v => { const t = new Date(v.created_at); return t >= d && t < next })
      dias7.push({
        label: i === 0 ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }),
        fat: dvs.reduce((s, v) => s + Number(v.total), 0),
        cnt: dvs.length,
      })
    }

    return { fatSemana, fatMes, rankingColab, byCanal, pratos, dias7, week, month }
  }, [vendas])

  const pushItem = (nome: string, preco: number, qtd: number) => {
    if (!nome || !preco || qtd < 1) return
    setItens(prev => {
      const idx = prev.findIndex(i => i.nome === nome)
      if (idx >= 0) return prev.map((i, j) => j === idx ? { ...i, qtd: i.qtd + qtd } : i)
      return [...prev, { nome, qtd, preco }]
    })
  }

  const addItem = () => {
    const nome = itemNome.trim()
    const preco = parseFloat(itemPreco.replace(',', '.').replace(/[^\d.]/g, ''))
    if (!nome || !preco || itemQtd < 1) return
    pushItem(nome, preco, itemQtd)
    setItemNome(''); setItemQtd(1); setItemPreco('')
  }

  // Clicking a cardápio chip adds 1 unit directly to the cart
  const selectCardapio = (item: typeof CARDAPIO[0]) => {
    pushItem(item.nome, item.preco, 1)
  }

  const openForm = () => {
    setForm({ ...EMPTY_FORM, loja: lojaReal, colaborador: user?.name || '' })
    setItens([])
    setItemNome(''); setItemQtd(1); setItemPreco('')
    setShowForm(true)
  }

  const save = async () => {
    if (!form.loja || !form.colaborador) { toast('Preencha loja e colaborador.', 'error'); return }
    if (itens.length === 0) { toast('Adicione pelo menos um item.', 'error'); return }
    setSaving(true)
    try {
      let venda: Venda
      if (isDemoMode) {
        // Demo mode: build record locally (no real DB session)
        venda = {
          id: `demo-${Date.now()}`,
          ...form,
          itens,
          total,
          created_by: user?.name || 'Sistema',
          created_at: new Date().toISOString(),
        }
      } else {
        venda = await insertVenda({ ...form, itens, total, created_by: user?.name || 'Sistema' })
      }
      setVendas(prev => [venda, ...prev])
      setShowForm(false)
      toast(`Venda registrada! ${fmtBRL(total)}`)
    } catch {
      toast('Erro ao registrar venda.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab${pageTab === 'vendas' ? ' active' : ''}`} onClick={() => setPageTab('vendas')}>
          <ShoppingBag size={12} style={{ marginRight: 5 }}/>Registro de Vendas
        </button>
        <button className={`tab${pageTab === 'dashboard' ? ' active' : ''}`} onClick={() => setPageTab('dashboard')}>
          <BarChart2 size={12} style={{ marginRight: 5 }}/>📊 Dashboard Gerencial
        </button>
      </div>

      {pageTab === 'dashboard' && (
        <DashboardVendas dash={dash} today={today} fatHoje={fatHoje} ticketMedio={ticketMedio} loading={loading} />
      )}

      {pageTab === 'vendas' && <>
      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        {[
          { lbl: 'Vendas Hoje', val: String(today.length), sub: `${vendas.length} no total`, col: 'var(--bordo)', icon: <ShoppingBag size={16} /> },
          { lbl: 'Faturamento Hoje', val: fmtBRL(fatHoje), sub: 'vendas do dia', col: 'var(--success)', icon: <TrendingUp size={16} /> },
          { lbl: 'Ticket Médio', val: fmtBRL(ticketMedio), sub: 'meta: R$ 45,00', col: 'var(--blue)', icon: <ShoppingBag size={16} /> },
          { lbl: 'Avaliação Média', val: avalMedia ? avalMedia.toFixed(1) + ' ★' : '—', sub: `${today.filter(v => v.avaliacao).length} avaliações`, col: 'var(--warning)', icon: <Star size={16} /> },
        ].map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-ac" style={{ background: k.col }} />
            <div className="kpi-lbl">{k.lbl}</div>
            <div className="kpi-val">{k.val}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="fb" style={{ marginBottom: 12 }}>
        <div className="sw-wrap">
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="srch" placeholder="Buscar colaborador ou loja..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="flt" value={filterLoja} onChange={e => setFilterLoja(e.target.value)}>
          <option value="">Todas as Lojas</option>
          {theme.stores.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="flt" value={filterCanal} onChange={e => setFilterCanal(e.target.value)}>
          <option value="">Todos os Canais</option>
          {CANAIS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {can('vendas', 'create') && (
          <button className="btn bp bsm" onClick={openForm}>
            <Plus size={11} /> Nova Venda
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
            <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px', display: 'block' }} />
            Carregando vendas...
          </div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Loja</th>
                  <th>Colaborador</th>
                  <th>Canal</th>
                  <th>Itens</th>
                  <th>Total</th>
                  <th>Pagamento</th>
                  <th>Avaliação</th>
                  <th><Clock size={11} /></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>Nenhuma venda encontrada.</td></tr>
                )}
                {filtered.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(v.created_at)}</td>
                    <td>{v.loja}</td>
                    <td><strong>{v.colaborador}</strong></td>
                    <td><span className={`badge ${v.canal === 'delivery' ? 'bg-b' : v.canal === 'app' ? 'bg-p' : 'bg-gr'}`}>{canalLabel(v.canal)}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 180 }}>
                      {Array.isArray(v.itens) ? v.itens.map((it: VendaItem) => `${it.qtd}x ${it.nome}`).join(', ') : '—'}
                    </td>
                    <td><strong style={{ color: 'var(--success)' }}>{fmtBRL(Number(v.total))}</strong></td>
                    <td><span className="badge bg-t">{pagLabel(v.pagamento)}</span></td>
                    <td style={{ color: 'var(--warning)', fontSize: 13 }}>{stars(v.avaliacao)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{v.tempo_min ? `${v.tempo_min} min` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nova Venda */}
      {showForm && (
        <Modal title="Nova Venda" open={showForm} onClose={() => setShowForm(false)} size="lg">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="fg">
              <label className="fl">Loja *</label>
              <select className="inp" value={form.loja} onChange={e => setForm(f => ({ ...f, loja: e.target.value }))}>
                <option value="">Selecione...</option>
                {theme.stores.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Colaborador *</label>
              <input className="inp" value={form.colaborador} onChange={e => setForm(f => ({ ...f, colaborador: e.target.value }))} placeholder="Nome do colaborador" />
            </div>
            <div className="fg">
              <label className="fl">Canal</label>
              <select className="inp" value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value as Venda['canal'] }))}>
                {CANAIS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Pagamento</label>
              <select className="inp" value={form.pagamento} onChange={e => setForm(f => ({ ...f, pagamento: e.target.value as Venda['pagamento'] }))}>
                {PAGAMENTOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Avaliação (1–5)</label>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setForm(f => ({ ...f, avaliacao: n }))}
                    style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', color: n <= form.avaliacao ? 'var(--warning)' : 'var(--border)', padding: 0 }}>
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div className="fg">
              <label className="fl">Tempo de atendimento (min)</label>
              <input className="inp" type="number" min={1} max={120} value={form.tempo_min} onChange={e => setForm(f => ({ ...f, tempo_min: Number(e.target.value) }))} />
            </div>
          </div>

          {/* Itens do pedido */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: 1 }}>Itens do Pedido</div>

            {/* Atalhos do cardápio */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {CARDAPIO.map(item => (
                <button key={item.nome} type="button" onClick={() => selectCardapio(item)}
                  style={{ fontSize: 10, padding: '3px 8px', background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {item.nome}
                </button>
              ))}
            </div>

            {/* Adicionar item */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 100px auto', gap: 6, marginBottom: 8, alignItems: 'end' }}>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl">Item</label>
                <input className="inp" value={itemNome} onChange={e => setItemNome(e.target.value)} placeholder="Nome do item" onKeyDown={e => e.key === 'Enter' && addItem()} />
              </div>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl">Qtd</label>
                <input className="inp" type="number" min={1} value={itemQtd} onChange={e => setItemQtd(Number(e.target.value))} />
              </div>
              <div className="fg" style={{ margin: 0 }}>
                <label className="fl">Preço (R$)</label>
                <input className="inp" value={itemPreco} onChange={e => setItemPreco(e.target.value)} placeholder="0,00" onKeyDown={e => e.key === 'Enter' && addItem()} />
              </div>
              <button type="button" className="btn bp bsm" onClick={addItem} style={{ alignSelf: 'flex-end' }}>
                <Plus size={11} /> Add
              </button>
            </div>

            {/* Lista de itens */}
            {itens.length > 0 && (
              <div style={{ background: 'var(--cream)', borderRadius: 8, padding: '8px 12px' }}>
                {itens.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < itens.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 12 }}>{it.qtd}x <strong>{it.nome}</strong></span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>{fmtBRL(it.qtd * it.preco)}</span>
                      <button type="button" onClick={() => setItens(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontWeight: 800, fontSize: 14 }}>
                  <span>Total</span>
                  <span style={{ color: 'var(--bordo)' }}>{fmtBRL(total)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="fg">
            <label className="fl">Observações</label>
            <textarea className="inp" rows={2} value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Preferências do cliente, alergias, etc." />
          </div>

          <div className="fb" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn bsm" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn bp bsm" onClick={save} disabled={saving || itens.length === 0}>
              {saving ? <Loader2 size={11} className="spin" /> : <Plus size={11} />}
              {saving ? 'Salvando...' : `Registrar Venda ${itens.length > 0 ? '· ' + fmtBRL(total) : ''}`}
            </button>
          </div>
        </Modal>
      )}
      </>}
    </div>
  )
}

// ── Dashboard Gerencial de Vendas ─────────────────────────────

function DashboardVendas({ dash, today, fatHoje, ticketMedio, loading }: {
  dash: {
    fatSemana: number; fatMes: number
    rankingColab: { nome: string; loja: string; fat: number; cnt: number; ticket: number; aval: number }[]
    byCanal: Record<string, number>
    pratos: [string, number][]
    dias7: { label: string; fat: number; cnt: number }[]
    week: unknown[]; month: unknown[]
  }
  today: { total: number | string }[]
  fatHoje: number
  ticketMedio: number
  loading: boolean
}) {
  const ticketMes = (dash.month as {total:number}[]).length ? dash.fatMes / (dash.month as {total:number}[]).length : 0

  const maxDia7 = Math.max(...dash.dias7.map(d => d.fat), 1)
  const maxColab = dash.rankingColab[0]?.fat || 1
  const canalEntries = Object.entries(dash.byCanal).sort((a, b) => b[1] - a[1])
  const totalCanal = canalEntries.reduce((s, [, v]) => s + v, 0)

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
      <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px', display: 'block' }}/>
      Carregando dados...
    </div>
  )

  return (
    <div>
      {/* KPIs principais */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {[
          { lbl: 'Faturamento Hoje', val: fmtBRL(fatHoje), sub: `${today.length} comandas`, col: 'var(--bordo)', icon: '💰' },
          { lbl: 'Faturamento Semana', val: fmtBRL(dash.fatSemana), sub: `${(dash.week as unknown[]).length} comandas`, col: 'var(--success)', icon: '📈' },
          { lbl: 'Faturamento Mês', val: fmtBRL(dash.fatMes), sub: `${(dash.month as unknown[]).length} comandas`, col: '#6366F1', icon: '📊' },
          { lbl: 'Ticket Médio Hoje', val: fmtBRL(ticketMedio), sub: 'por comanda', col: 'var(--blue)', icon: '🎯' },
          { lbl: 'Ticket Médio Mês', val: fmtBRL(ticketMes), sub: `meta R$ 45,00`, col: '#8B5CF6', icon: '🏷️' },
        ].map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-ac" style={{ background: k.col }}/>
            <div className="kpi-lbl">{k.icon} {k.lbl}</div>
            <div className="kpi-val" style={{ fontSize: 20 }}>{k.val}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Comparativo 7 dias */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">📅 Últimos 7 dias</span>
            <span className="badge bg-br">Faturamento diário</span>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {dash.dias7.map((d, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 11 }}>
                  <span style={{ fontWeight: d.label === 'Hoje' ? 800 : 500, color: d.label === 'Hoje' ? 'var(--bordo)' : 'var(--text)' }}>
                    {d.label}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--success)' }}>{fmtBRL(d.fat)}</span>
                </div>
                <div style={{ background: 'var(--border)', borderRadius: 4, height: 6 }}>
                  <div style={{ background: d.label === 'Hoje' ? 'var(--bordo)' : 'var(--success)', height: 6, borderRadius: 4, width: `${(d.fat / maxDia7) * 100}%`, minWidth: d.fat > 0 ? 4 : 0 }}/>
                </div>
                {d.cnt > 0 && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>{d.cnt} comanda(s)</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Vendas por canal */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">📡 Por Canal</span>
            <span className="badge bg-br">mês atual</span>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {canalEntries.length === 0
              ? <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 20 }}>Sem dados</div>
              : canalEntries.map(([canal, fat]) => {
                  const pct = Math.round((fat / totalCanal) * 100)
                  return (
                    <div key={canal} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 11 }}>
                        <span style={{ fontWeight: 600 }}>{canalLabel(canal)}</span>
                        <span style={{ fontWeight: 700, color: 'var(--bordo)' }}>{fmtBRL(fat)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({pct}%)</span></span>
                      </div>
                      <div style={{ background: 'var(--border)', borderRadius: 4, height: 8 }}>
                        <div style={{ background: 'var(--bordo)', height: 8, borderRadius: 4, width: `${pct}%`, opacity: 0.8 }}/>
                      </div>
                    </div>
                  )
                })}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Ranking por colaborador */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt"><Users size={13} style={{ display:'inline', marginRight:4 }}/>Ranking Garçons / Colaboradores</span>
            <span className="badge bg-br">mês atual</span>
          </div>
          {dash.rankingColab.length === 0
            ? <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>Sem dados</div>
            : (
              <div style={{ padding: '8px 16px' }}>
                {dash.rankingColab.slice(0, 8).map((c, i) => (
                  <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < Math.min(7, dash.rankingColab.length - 1) ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 14, minWidth: 20, textAlign: 'center', color: i === 0 ? '#F59E0B' : i === 1 ? '#9CA3AF' : i === 2 ? '#CD7C2F' : 'var(--muted)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                      <div style={{ background: 'var(--border)', borderRadius: 3, height: 4, marginTop: 3 }}>
                        <div style={{ background: i === 0 ? 'var(--bordo)' : 'var(--success)', height: 4, borderRadius: 3, width: `${(c.fat / maxColab) * 100}%` }}/>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--success)' }}>{fmtBRL(c.fat)}</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>{c.cnt} venda(s) · ticket {fmtBRL(c.ticket)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Pratos mais vendidos */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">🍽️ Pratos Mais Vendidos</span>
            <span className="badge bg-br">mês atual</span>
          </div>
          {dash.pratos.length === 0
            ? <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>Sem dados</div>
            : (
              <div style={{ padding: '8px 16px' }}>
                {dash.pratos.slice(0, 8).map(([nome, cnt], i) => (
                  <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < 7 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 18 }}>{i + 1}.</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{nome}</div>
                      <div style={{ background: 'var(--border)', borderRadius: 3, height: 4, marginTop: 3 }}>
                        <div style={{ background: '#8B5CF6', height: 4, borderRadius: 3, width: `${(cnt / (dash.pratos[0]?.[1] || 1)) * 100}%` }}/>
                      </div>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--bordo)', minWidth: 30, textAlign: 'right' }}>{cnt}x</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

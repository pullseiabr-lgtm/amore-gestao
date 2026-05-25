import { useState, useEffect, useCallback } from 'react'
import {
  Trash2, Check, X, Search, ShoppingCart,
  DollarSign, CreditCard, Smartphone, Banknote,
  ArrowLeft, Printer, Lock, Unlock, Loader2,
  TrendingUp, Package, History, AlertTriangle,
} from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import { fetchProdutos, insertVenda, fetchVendas } from '../../lib/db'
import type { Venda } from '../../lib/db'
import type { Produto } from '../../types/database'

// ── Tipos locais ────────────────────────────────────────────

type FormaPgto = 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'misto'

interface ItemCarrinho {
  produto_id: string; nome: string; preco: number; quantidade: number; desconto: number
}

interface VendaLocal {
  id: string; numero: number; data: string; hora: string
  itens: ItemCarrinho[]; total: number; forma_pagamento: FormaPgto
  troco: number; status: 'aberta' | 'finalizada' | 'cancelada'
  operador: string; observacao: string
}

interface Caixa {
  aberto: boolean; saldo_abertura: number; data_abertura: string; operador: string
  total_vendas: number; total_sangrias: number; qtd_vendas: number
}

// ── Helpers ──────────────────────────────────────────────────

const fmtR$ = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

function mapPagamento(f: FormaPgto): Venda['pagamento'] {
  if (f === 'cartao_credito') return 'credito'
  if (f === 'cartao_debito')  return 'debito'
  if (f === 'misto')          return 'pix'
  return f as Venda['pagamento']
}

// Converte Venda do Supabase para VendaLocal
function vendaToLocal(v: Venda, idx: number): VendaLocal {
  const forma = ((): FormaPgto => {
    if (v.pagamento === 'credito') return 'cartao_credito'
    if (v.pagamento === 'debito')  return 'cartao_debito'
    return v.pagamento as FormaPgto
  })()
  return {
    id: v.id, numero: idx + 1,
    data: new Date(v.created_at).toLocaleDateString('pt-BR'),
    hora: new Date(v.created_at).toTimeString().slice(0, 5),
    itens: (v.itens || []).map(i => ({ produto_id: i.nome, nome: i.nome, preco: i.preco, quantidade: i.qtd, desconto: 0 })),
    total: v.total, forma_pagamento: forma,
    troco: 0, status: 'finalizada', operador: v.colaborador,
    observacao: v.obs || '',
  }
}

// ── Componente Principal ──────────────────────────────────────

type PdvView = 'venda' | 'historico' | 'relatorio'

export default function PdvPage() {
  const { theme }   = useTheme()
  const { user }    = useAuth()
  const { loja, lojas } = useLoja()
  const lojaReal = (loja && loja !== 'Todas as Lojas') ? loja : (lojas.find(l => l !== 'Todas as Lojas') || theme.stores[0] || '')

  const [caixa, setCaixa] = useState<Caixa>({
    aberto: false, saldo_abertura: 0, data_abertura: '', operador: user?.email || 'Operador',
    total_vendas: 0, total_sangrias: 0, qtd_vendas: 0,
  })
  const [view, setView]           = useState<PdvView>('venda')
  const [vendas, setVendas]       = useState<VendaLocal[]>([])
  const [produtos, setProdutos]   = useState<Produto[]>([])
  const [loading, setLoading]     = useState(true)
  const [salvando, setSalvando]   = useState(false)
  const [carrinho, setCarrinho]   = useState<ItemCarrinho[]>([])
  const [busca, setBusca]         = useState('')
  const [categoria, setCategoria] = useState('')
  const [showPgto, setShowPgto]   = useState(false)
  const [showAbertura, setShowAbertura]   = useState(false)
  const [showSangria, setShowSangria]     = useState(false)
  const [showFechamento, setShowFechamento] = useState(false)
  const [pgtoForm, setPgtoForm]   = useState({ forma: 'pix' as FormaPgto, valorRecebido: '', obs: '' })
  const [aberturaForm, setAberturaForm] = useState({ saldo: '', operador: user?.email || 'Operador' })
  const [sangriaForm, setSangriaForm]   = useState({ valor: '', motivo: '' })
  const [ultimaVenda, setUltimaVenda]   = useState<VendaLocal | null>(null)
  const [showComprova, setShowComprova] = useState(false)

  // ── Carregar produtos e vendas do dia ──────────────────────
  const carregarDados = useCallback(async () => {
    if (!lojaReal) return
    setLoading(true)
    try {
      const [prods, vendasDB] = await Promise.allSettled([
        fetchProdutos(lojaReal, { ativo: true }),
        fetchVendas(lojaReal),
      ])

      // Produtos — filtra os que têm preco_venda e disponivel_pdv=true
      if (prods.status === 'fulfilled') {
        const pdvProds = prods.value.filter(p => p.disponivel_pdv && p.preco_venda && p.preco_venda > 0)
        setProdutos(pdvProds.length > 0 ? pdvProds : prods.value.slice(0, 20))
      }

      // Vendas de hoje — filtra pelo dia atual
      if (vendasDB.status === 'fulfilled') {
        const hoje = new Date().toDateString()
        const vendasHoje = vendasDB.value
          .filter(v => new Date(v.created_at).toDateString() === hoje)
          .map((v, i) => vendaToLocal(v, i))
        setVendas(vendasHoje)
        const totalHoje = vendasHoje.reduce((s, v) => s + (v.status === 'finalizada' ? v.total : 0), 0)
        const qtdHoje   = vendasHoje.filter(v => v.status === 'finalizada').length
        setCaixa(c => ({ ...c, total_vendas: totalHoje, qtd_vendas: qtdHoje }))
      }
    } catch { /* ignora — fallback visual */ } finally {
      setLoading(false)
    }
  }, [lojaReal])

  useEffect(() => { carregarDados() }, [carregarDados])

  const categorias = ['', ...new Set(produtos.map(p => p.categoria_nome || p.nome.split(' ')[0]))]

  const produtosFiltrados = produtos
    .filter(p => (!busca || p.nome.toLowerCase().includes(busca.toLowerCase())))
    .filter(p => !categoria || (p.categoria_nome || '') === categoria)

  const totalCarrinho = carrinho.reduce((s, i) => s + (i.preco - i.desconto) * i.quantidade, 0)
  const qtdItens      = carrinho.reduce((s, i) => s + i.quantidade, 0)

  // ── Carrinho ───────────────────────────────────────────────
  const addItem = (p: Produto) => {
    const preco = p.preco_venda ?? 0
    if (preco <= 0) return
    setCarrinho(prev => {
      const exists = prev.find(i => i.produto_id === p.id)
      if (exists) return prev.map(i => i.produto_id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { produto_id: p.id, nome: p.nome, preco, quantidade: 1, desconto: 0 }]
    })
  }

  const updateQtd = (id: string, delta: number) => {
    setCarrinho(prev => {
      const novo = prev.map(i => i.produto_id === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      return novo.filter(i => i.quantidade > 0)
    })
  }

  const removeItem     = (id: string) => setCarrinho(prev => prev.filter(i => i.produto_id !== id))
  const limparCarrinho = () => setCarrinho([])

  // ── Caixa ──────────────────────────────────────────────────
  const abrirCaixa = () => {
    setCaixa(c => ({
      ...c, aberto: true,
      saldo_abertura: parseFloat(aberturaForm.saldo) || 0,
      data_abertura: new Date().toLocaleString('pt-BR'),
      operador: aberturaForm.operador,
    }))
    setShowAbertura(false)
  }

  const registrarSangria = () => {
    const v = parseFloat(sangriaForm.valor) || 0
    setCaixa(c => ({ ...c, total_sangrias: c.total_sangrias + v }))
    setSangriaForm({ valor: '', motivo: '' })
    setShowSangria(false)
  }

  // ── Finalizar venda — salva no Supabase ───────────────────
  const finalizarVenda = async () => {
    if (carrinho.length === 0) return
    const valorRecebido = parseFloat(pgtoForm.valorRecebido.replace(',', '.')) || totalCarrinho
    const troco = Math.max(0, valorRecebido - totalCarrinho)
    setSalvando(true)

    const vendaLocal: VendaLocal = {
      id: `local_${Date.now()}`, numero: vendas.length + 1,
      data: new Date().toLocaleDateString('pt-BR'),
      hora: new Date().toTimeString().slice(0, 5),
      itens: [...carrinho], total: totalCarrinho,
      forma_pagamento: pgtoForm.forma, troco,
      status: 'finalizada', operador: caixa.operador,
      observacao: pgtoForm.obs,
    }

    // Persiste no Supabase (fire and don't block UI)
    insertVenda({
      loja: lojaReal,
      colaborador: caixa.operador,
      canal: 'balcao',
      itens: carrinho.map(i => ({ nome: i.nome, qtd: i.quantidade, preco: i.preco - i.desconto })),
      total: totalCarrinho,
      pagamento: mapPagamento(pgtoForm.forma),
      avaliacao: null,
      tempo_min: null,
      obs: pgtoForm.obs + (pgtoForm.forma === 'misto' ? ' [pgto misto]' : ''),
      created_by: caixa.operador,
    }).then(saved => {
      // Atualiza o id local com o id real do Supabase
      setVendas(prev => prev.map(v => v.id === vendaLocal.id ? { ...v, id: saved.id } : v))
    }).catch(() => { /* fallback silencioso */ })

    setVendas(prev => [vendaLocal, ...prev])
    setCaixa(c => ({ ...c, total_vendas: c.total_vendas + totalCarrinho, qtd_vendas: c.qtd_vendas + 1 }))
    setUltimaVenda(vendaLocal)
    setCarrinho([])
    setPgtoForm({ forma: 'pix', valorRecebido: '', obs: '' })
    setShowPgto(false)
    setShowComprova(true)
    setSalvando(false)
  }

  const cancelarVenda = (id: string) => {
    setVendas(prev => prev.map(v => v.id === id ? { ...v, status: 'cancelada' } : v))
  }

  const ticketMedio = vendas.filter(v => v.status === 'finalizada').length > 0
    ? caixa.total_vendas / vendas.filter(v => v.status === 'finalizada').length
    : 0

  // ── Tela: carregando ──
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}>
        <Loader2 size={28} className="spin" />
        <span style={{ marginLeft: 10, color: 'var(--muted)', fontSize: 14 }}>Carregando PDV...</span>
      </div>
    )
  }

  // ── Tela: caixa fechado ──
  if (!caixa.aberto && view === 'venda') {
    return (
      <div>
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--success)' }} /><div className="kpi-lbl">Total Vendas (hoje)</div><div className="kpi-val">{fmtR$(caixa.total_vendas)}</div><div className="kpi-sub">{caixa.qtd_vendas} vendas</div></div>
          <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--blue)' }} /><div className="kpi-lbl">Ticket Médio</div><div className="kpi-val">{fmtR$(ticketMedio)}</div><div className="kpi-sub">por venda</div></div>
          <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--warning)' }} /><div className="kpi-lbl">Sangrias</div><div className="kpi-val">{fmtR$(caixa.total_sangrias)}</div><div className="kpi-sub">retiradas do caixa</div></div>
          <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--bordo)' }} /><div className="kpi-lbl">Saldo Final</div><div className="kpi-val">{fmtR$(caixa.total_vendas - caixa.total_sangrias)}</div><div className="kpi-sub">estimado</div></div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="tab active" onClick={() => setView('venda')}>🛒 PDV</button>
          <button className="tab" onClick={() => setView('historico')}>📋 Histórico</button>
          <button className="tab" onClick={() => setView('relatorio')}>📊 Relatório</button>
        </div>

        <div className="card" style={{ padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Lock size={32} style={{ color: 'var(--danger)' }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Caixa Fechado</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
            Abra o caixa para iniciar as vendas do dia
          </div>
          <button className="btn bp" onClick={() => setShowAbertura(true)}>
            <Unlock size={14} /> Abrir Caixa
          </button>
        </div>

        {showAbertura && (
          <div className="ov open" onClick={() => setShowAbertura(false)}>
            <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
              <div className="mhd"><span className="mtt">Abertura de Caixa</span><button className="mx" onClick={() => setShowAbertura(false)}>✕</button></div>
              <div className="mbd">
                <div className="fg" style={{ marginBottom: 14 }}>
                  <label className="fl">Operador</label>
                  <input className="inp" value={aberturaForm.operador} onChange={e => setAberturaForm(f => ({ ...f, operador: e.target.value }))} />
                </div>
                <div className="fg">
                  <label className="fl">Saldo de abertura (troco inicial R$)</label>
                  <input className="inp" type="number" min={0} step={0.01} value={aberturaForm.saldo} onChange={e => setAberturaForm(f => ({ ...f, saldo: e.target.value }))} placeholder="0,00" autoFocus />
                </div>
              </div>
              <div className="mft">
                <button className="btn bo" onClick={() => setShowAbertura(false)}>Cancelar</button>
                <button className="btn bp" onClick={abrirCaixa}><Unlock size={12} /> Abrir Caixa</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Vista Histórico ──
  if (view === 'historico') {
    return (
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="tab" onClick={() => setView('venda')}>🛒 PDV</button>
          <button className="tab active" onClick={() => setView('historico')}>📋 Histórico</button>
          <button className="tab" onClick={() => setView('relatorio')}>📊 Relatório</button>
        </div>

        <div className="card">
          <div className="card-hd"><span className="card-tt"><History size={13} style={{ display: 'inline', marginRight: 4 }} />Vendas do Dia</span></div>
          <div className="tw">
            <table>
              <thead><tr><th>Nº</th><th>Hora</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>Troco</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {vendas.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 13 }}>Nenhuma venda hoje</td></tr>
                ) : vendas.map(v => (
                  <tr key={v.id} style={{ opacity: v.status === 'cancelada' ? 0.5 : 1 }}>
                    <td><strong>#{String(v.numero).padStart(3, '0')}</strong></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{v.hora}</td>
                    <td style={{ fontSize: 12 }}>{v.itens.reduce((s, i) => s + i.quantidade, 0)} itens</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>{fmtR$(v.total)}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 12, background: 'var(--bordo-bg)', color: 'var(--bordo)', fontWeight: 600 }}>
                        {{ pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Crédito', cartao_debito: 'Débito', misto: 'Misto' }[v.forma_pagamento]}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{v.troco > 0 ? fmtR$(v.troco) : '—'}</td>
                    <td>
                      <span className={`badge ${v.status === 'finalizada' ? 'bg-g' : v.status === 'cancelada' ? 'bg-r' : 'bg-y'}`}>
                        {v.status === 'finalizada' ? 'Finalizada' : v.status === 'cancelada' ? 'Cancelada' : 'Aberta'}
                      </span>
                    </td>
                    <td>
                      {v.status === 'finalizada' && (
                        <button className="ib rd" onClick={() => cancelarVenda(v.id)} title="Cancelar venda"><X size={11} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── Vista Relatório ──
  if (view === 'relatorio') {
    const finalizadas = vendas.filter(v => v.status === 'finalizada')
    const porForma = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'misto'].map(f => ({
      forma: f, label: { pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Crédito', cartao_debito: 'Débito', misto: 'Misto' }[f] ?? f,
      total: finalizadas.filter(v => v.forma_pagamento === f).reduce((s, v) => s + v.total, 0),
      qtd: finalizadas.filter(v => v.forma_pagamento === f).length,
    })).filter(f => f.qtd > 0)

    const maxForma = porForma[0]?.total ?? 1

    return (
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="tab" onClick={() => setView('venda')}>🛒 PDV</button>
          <button className="tab" onClick={() => setView('historico')}>📋 Histórico</button>
          <button className="tab active" onClick={() => setView('relatorio')}>📊 Relatório</button>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--success)' }} /><div className="kpi-lbl">Total Vendas</div><div className="kpi-val">{fmtR$(caixa.total_vendas)}</div><div className="kpi-sub">{finalizadas.length} vendas finalizadas</div></div>
          <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--blue)' }} /><div className="kpi-lbl">Ticket Médio</div><div className="kpi-val">{fmtR$(ticketMedio)}</div><div className="kpi-sub">por venda</div></div>
          <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--warning)' }} /><div className="kpi-lbl">Sangrias</div><div className="kpi-val" style={{ color: 'var(--warning)' }}>{fmtR$(caixa.total_sangrias)}</div><div className="kpi-sub">retiradas</div></div>
          <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--bordo)' }} /><div className="kpi-lbl">Saldo Líquido</div><div className="kpi-val">{fmtR$(caixa.saldo_abertura + caixa.total_vendas - caixa.total_sangrias)}</div><div className="kpi-sub">caixa atual</div></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card">
            <div className="card-hd"><span className="card-tt"><TrendingUp size={13} style={{ display: 'inline', marginRight: 4 }} />Por Forma de Pagamento</span></div>
            {porForma.length === 0 ? (
              <div className="empty" style={{ padding: '24px 0', fontSize: 12 }}>Sem dados</div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                {porForma.map(f => (
                  <div key={f.forma} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{f.label}</div>
                      <div style={{ height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginTop: 4 }}>
                        <div style={{ height: '100%', width: `${(f.total / maxForma) * 100}%`, background: 'var(--success)', borderRadius: 99 }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtR$(f.total)}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{f.qtd} vendas</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-hd"><span className="card-tt"><Package size={13} style={{ display: 'inline', marginRight: 4 }} />Mais Vendidos</span></div>
            <div style={{ padding: '4px 0' }}>
              {Object.entries(
                vendas.filter(v => v.status === 'finalizada')
                  .flatMap(v => v.itens)
                  .reduce((acc, i) => {
                    acc[i.nome] = (acc[i.nome] || 0) + i.quantidade
                    return acc
                  }, {} as Record<string, number>)
              ).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nome, qtd], i) => (
                <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--bordo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--bordo)', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{nome}</div>
                  <span className="badge bg-b">{qtd}×</span>
                </div>
              ))}
              {vendas.filter(v => v.status === 'finalizada').length === 0 && (
                <div className="empty" style={{ padding: '24px 0', fontSize: 12 }}>Sem vendas ainda</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Vista PDV Principal ──
  return (
    <div>
      {/* Tabs + Ações Caixa */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 0, flex: 1 }}>
          <button className="tab active" onClick={() => setView('venda')}>🛒 PDV</button>
          <button className="tab" onClick={() => setView('historico')}>📋 Histórico</button>
          <button className="tab" onClick={() => setView('relatorio')}>📊 Relatório</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <div style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#D1FAE5', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Unlock size={11} /> Caixa Aberto — {lojaReal}
          </div>
          <button className="btn bo bsm" onClick={() => setShowSangria(true)}><ArrowLeft size={11} /> Sangria</button>
          <button className="btn bsm" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => setShowFechamento(true)}><Lock size={11} /> Fechar Caixa</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }}>
        {/* Produtos */}
        <div>
          {produtos.length === 0 ? (
            <div className="card" style={{ padding: '40px 20px', textAlign: 'center' }}>
              <Package size={40} style={{ opacity: 0.2, margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Nenhum produto no PDV</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Cadastre produtos em <strong>Produtos</strong> e ative a opção <em>"Disponível no PDV"</em> com preço de venda.
              </div>
            </div>
          ) : (
            <>
              {/* Busca e filtro */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <div className="sw-wrap" style={{ flex: 1, minWidth: 200 }}>
                  <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                  <input className="srch" placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {categorias.map(c => (
                    <button key={c} onClick={() => setCategoria(c)}
                      style={{ padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${categoria === c ? 'var(--bordo)' : 'var(--border)'}`, background: categoria === c ? 'var(--bordo)' : 'transparent', color: categoria === c ? '#fff' : 'var(--text)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      {c || 'Todos'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid de produtos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                {produtosFiltrados.map(p => (
                  <button key={p.id} onClick={() => addItem(p)}
                    style={{
                      padding: '12px 10px', borderRadius: 10, border: '1.5px solid var(--border)',
                      background: 'var(--card)', cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color .15s, box-shadow .15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget.style.borderColor = 'var(--bordo)') }}
                    onMouseLeave={e => { (e.currentTarget.style.borderColor = 'var(--border)') }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, lineHeight: 1.2 }}>{p.nome}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--success)' }}>{fmtR$(p.preco_venda ?? 0)}</div>
                    {p.categoria_nome && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{p.categoria_nome}</div>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Carrinho */}
        <div>
          <div className="card" style={{ position: 'sticky', top: 0 }}>
            <div className="card-hd">
              <span className="card-tt"><ShoppingCart size={13} style={{ display: 'inline', marginRight: 4 }} />Carrinho ({qtdItens})</span>
              {carrinho.length > 0 && (
                <button className="ib rd" onClick={limparCarrinho} title="Limpar"><Trash2 size={12} /></button>
              )}
            </div>

            {carrinho.length === 0 ? (
              <div className="empty" style={{ padding: '32px 0' }}>
                <ShoppingCart size={32} style={{ opacity: 0.3 }} />
                <div style={{ fontSize: 12, marginTop: 8, color: 'var(--muted)' }}>Selecione os produtos</div>
              </div>
            ) : (
              <div>
                {carrinho.map(item => (
                  <div key={item.produto_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtR$(item.preco)} × {item.quantidade}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => updateQtd(item.produto_id, -1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>−</button>
                      <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{item.quantidade}</span>
                      <button onClick={() => updateQtd(item.produto_id, 1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>+</button>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bordo)', minWidth: 60, textAlign: 'right' }}>
                      {fmtR$((item.preco - item.desconto) * item.quantidade)}
                    </div>
                    <button className="ib rd" onClick={() => removeItem(item.produto_id)}><X size={11} /></button>
                  </div>
                ))}

                <div style={{ padding: '12px 14px', borderTop: '2px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Total</span>
                    <span style={{ fontWeight: 900, fontSize: 22, color: 'var(--success)' }}>{fmtR$(totalCarrinho)}</span>
                  </div>
                  <button className="btn bp" style={{ width: '100%', justifyContent: 'center', fontSize: 14, padding: '10px 0' }}
                    onClick={() => setShowPgto(true)} disabled={salvando}>
                    {salvando ? <Loader2 size={14} className="spin" /> : <DollarSign size={14} />} Finalizar Venda
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Pagamento */}
      {showPgto && (
        <div className="ov open" onClick={() => setShowPgto(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Finalizar Venda</span><button className="mx" onClick={() => setShowPgto(false)}>✕</button></div>
            <div className="mbd">
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total a pagar</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--success)' }}>{fmtR$(totalCarrinho)}</div>
              </div>

              <div className="fg" style={{ marginBottom: 14 }}>
                <label className="fl">Forma de pagamento</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { value: 'pix', label: 'PIX', icon: <Smartphone size={14} /> },
                    { value: 'dinheiro', label: 'Dinheiro', icon: <Banknote size={14} /> },
                    { value: 'cartao_debito', label: 'Débito', icon: <CreditCard size={14} /> },
                    { value: 'cartao_credito', label: 'Crédito', icon: <CreditCard size={14} /> },
                  ].map(f => (
                    <button key={f.value} onClick={() => setPgtoForm(p => ({ ...p, forma: f.value as FormaPgto }))}
                      style={{
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        border: `2px solid ${pgtoForm.forma === f.value ? 'var(--bordo)' : 'var(--border)'}`,
                        background: pgtoForm.forma === f.value ? 'var(--bordo-bg)' : 'transparent',
                        color: pgtoForm.forma === f.value ? 'var(--bordo)' : 'var(--text)',
                        display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13,
                      }}>
                      {f.icon} {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {pgtoForm.forma === 'dinheiro' && (
                <div className="fg" style={{ marginBottom: 14 }}>
                  <label className="fl">Valor recebido (R$)</label>
                  <input className="inp" type="number" min={totalCarrinho} step={0.01} autoFocus
                    value={pgtoForm.valorRecebido} onChange={e => setPgtoForm(p => ({ ...p, valorRecebido: e.target.value }))}
                    placeholder={totalCarrinho.toFixed(2)} />
                  {pgtoForm.valorRecebido && parseFloat(pgtoForm.valorRecebido) >= totalCarrinho && (
                    <div style={{ marginTop: 6, padding: '6px 10px', background: '#D1FAE5', borderRadius: 7, fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>
                      Troco: {fmtR$(parseFloat(pgtoForm.valorRecebido) - totalCarrinho)}
                    </div>
                  )}
                </div>
              )}

              <div className="fg">
                <label className="fl">Observação</label>
                <input className="inp" value={pgtoForm.obs} onChange={e => setPgtoForm(p => ({ ...p, obs: e.target.value }))} placeholder="Mesa, cliente, detalhes..." />
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowPgto(false)}>Cancelar</button>
              <button className="btn bp" onClick={finalizarVenda} disabled={salvando}>
                {salvando ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Confirmar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprovante */}
      {showComprova && ultimaVenda && (
        <div className="ov open" onClick={() => setShowComprova(false)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">✅ Venda Finalizada!</span><button className="mx" onClick={() => setShowComprova(false)}>✕</button></div>
            <div className="mbd" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--success)', marginBottom: 4 }}>{fmtR$(ultimaVenda.total)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                Venda #{String(ultimaVenda.numero).padStart(3, '0')} · {ultimaVenda.hora}
              </div>
              {ultimaVenda.troco > 0 && (
                <div style={{ padding: '8px 14px', background: '#D1FAE5', borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--success)', marginBottom: 12 }}>
                  💵 Troco: {fmtR$(ultimaVenda.troco)}
                </div>
              )}
              <button className="btn bo bsm" onClick={() => window.print()}>
                <Printer size={11} /> Imprimir Cupom
              </button>
            </div>
            <div className="mft">
              <button className="btn bp" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowComprova(false)}>
                Próxima Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sangria */}
      {showSangria && (
        <div className="ov open" onClick={() => setShowSangria(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Sangria de Caixa</span><button className="mx" onClick={() => setShowSangria(false)}>✕</button></div>
            <div className="mbd">
              <div style={{ padding: '8px 12px', background: '#FEF3C7', borderRadius: 8, fontSize: 12, color: '#92400E', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={12} /> Sangria é uma retirada de dinheiro do caixa. Registre sempre que retirar.
              </div>
              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl">Valor da sangria (R$) <span className="rq">*</span></label>
                <input className="inp" type="number" min={0} step={0.01} value={sangriaForm.valor} onChange={e => setSangriaForm(f => ({ ...f, valor: e.target.value }))} autoFocus placeholder="0,00" />
              </div>
              <div className="fg">
                <label className="fl">Motivo</label>
                <input className="inp" value={sangriaForm.motivo} onChange={e => setSangriaForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ex: Pagamento de fornecedor, Depósito bancário..." />
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowSangria(false)}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={registrarSangria}><Check size={12} /> Confirmar Sangria</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fechamento */}
      {showFechamento && (
        <div className="ov open" onClick={() => setShowFechamento(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Fechamento de Caixa</span><button className="mx" onClick={() => setShowFechamento(false)}>✕</button></div>
            <div className="mbd">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                {[
                  { lbl: 'Saldo de abertura', val: fmtR$(caixa.saldo_abertura) },
                  { lbl: 'Total vendas', val: fmtR$(caixa.total_vendas) },
                  { lbl: 'Sangrias', val: fmtR$(caixa.total_sangrias) },
                  { lbl: 'Saldo final', val: fmtR$(caixa.saldo_abertura + caixa.total_vendas - caixa.total_sangrias) },
                ].map(r => (
                  <div key={r.lbl} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{r.lbl}</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{r.val}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                Ao fechar o caixa, todas as vendas do dia serão registradas.
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowFechamento(false)}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }}
                onClick={() => { setCaixa(c => ({ ...c, aberto: false })); setShowFechamento(false); setView('relatorio') }}>
                <Lock size={12} /> Fechar Caixa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

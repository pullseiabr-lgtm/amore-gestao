import { useState, useCallback, useEffect, useRef } from 'react'
import { Activity, TrendingUp, TrendingDown, Star, Award, BarChart3, RefreshCw, Plus, Trash2, Bell, Eye, Code2, ChevronDown, ChevronUp, Zap, Target, Bot, Search, Send, Key, ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import {
  fetchMarketPriceHistory, insertMarketPrice, deleteMarketPrice,
  fetchFornecedorScores, upsertFornecedorScore, deleteFornecedorScore,
  fetchMarketAlerts, insertMarketAlert, marcarAlertaLido, marcarTodosLidos,
  fetchMarketTendencias, upsertMarketTendencia,
} from '../../lib/db'
import { useLoja } from '../../contexts/LojaContext'
import type { MarketPriceHistory, FornecedorScore, MarketAlert, MarketTendencia } from '../../types/database'

// ── Helpers de Score ──────────────────────────────────────────

function calcScoreTotal(s: { score_operacional: number; score_financeiro: number; score_confiabilidade: number; score_entrega: number; score_competitividade: number }): number {
  return parseFloat((
    s.score_competitividade * 0.30 +
    s.score_confiabilidade  * 0.25 +
    s.score_entrega         * 0.25 +
    s.score_operacional     * 0.10 +
    s.score_financeiro      * 0.10
  ).toFixed(2))
}

function getClassificacao(total: number): FornecedorScore['classificacao'] {
  if (total >= 8.0) return 'ouro'
  if (total >= 6.5) return 'prata'
  if (total >= 5.0) return 'bronze'
  if (total >= 3.0) return 'observacao'
  return 'critico'
}

const CLASS_CONFIG = {
  ouro:       { label: 'Ouro',          color: '#f59e0b', bg: '#fef3c7', icon: '🥇' },
  prata:      { label: 'Prata',         color: '#6b7280', bg: '#f3f4f6', icon: '🥈' },
  bronze:     { label: 'Bronze',        color: '#d97706', bg: '#fef3c7', icon: '🥉' },
  observacao: { label: 'Em Observação', color: '#3b82f6', bg: '#eff6ff', icon: '👁' },
  critico:    { label: 'Crítico',       color: '#ef4444', bg: '#fef2f2', icon: '🚨' },
}

const ALERT_CONFIG = {
  aumento:       { label: 'Alta de Preço',   color: '#ef4444', icon: '🔴', bg: '#fef2f2' },
  reducao:       { label: 'Redução',         color: '#22c55e', icon: '🟢', bg: '#f0fdf4' },
  oportunidade:  { label: 'Oportunidade',    color: '#3b82f6', icon: '💡', bg: '#eff6ff' },
  risco_ruptura: { label: 'Risco Ruptura',   color: '#f97316', icon: '⚠️', bg: '#fff7ed' },
  antecipacao:   { label: 'Antecipar Compra',color: '#8b5cf6', icon: '⚡', bg: '#f5f3ff' },
  variacao:      { label: 'Variação',        color: '#6b7280', icon: '📊', bg: '#f9fafb' },
}

const TEND_CONFIG = {
  alta:    { label: 'Alta',    color: '#ef4444', icon: '↑', bg: '#fef2f2' },
  baixa:   { label: 'Baixa',   color: '#22c55e', icon: '↓', bg: '#f0fdf4' },
  estavel: { label: 'Estável', color: '#6b7280', icon: '→', bg: '#f9fafb' },
  volatil: { label: 'Volátil', color: '#f59e0b', icon: '↕', bg: '#fef3c7' },
}

// ── Análise de Tendências (client-side) ───────────────────────

function analisarTendencias(history: MarketPriceHistory[]): {
  tendencias: Omit<MarketTendencia, 'id' | 'created_at'>[]
  novosAlertas: Omit<MarketAlert, 'id' | 'created_at'>[]
} {
  const hoje = new Date().toISOString().slice(0, 10)
  const por30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const por7  = new Date(Date.now() - 7  * 86400000).toISOString().slice(0, 10)

  const produtos = [...new Set(history.map(h => h.produto))]
  const tendencias: Omit<MarketTendencia, 'id' | 'created_at'>[] = []
  const novosAlertas: Omit<MarketAlert, 'id' | 'created_at'>[] = []

  for (const produto of produtos) {
    const rows = history.filter(h => h.produto === produto).sort((a, b) => a.data.localeCompare(b.data))
    const r30  = rows.filter(r => r.data >= por30)
    const r7   = rows.filter(r => r.data >= por7)
    if (r30.length < 2) continue

    const precos30 = r30.map(r => r.preco)
    const precos7  = r7.map(r => r.preco)
    const medio30  = precos30.reduce((a, b) => a + b, 0) / precos30.length
    const atual    = rows[rows.length - 1].preco
    const primeiroMes = precos30[0]
    const primeiroSemana = precos7.length > 0 ? precos7[0] : atual

    const var30 = primeiroMes > 0 ? ((atual - primeiroMes) / primeiroMes) * 100 : 0
    const var7  = primeiroSemana > 0 ? ((atual - primeiroSemana) / primeiroSemana) * 100 : 0

    // Detectar volatilidade (desvio padrão / média)
    const variancia = precos30.reduce((acc, p) => acc + Math.pow(p - medio30, 2), 0) / precos30.length
    const cv = medio30 > 0 ? Math.sqrt(variancia) / medio30 : 0

    let tendencia: MarketTendencia['tendencia'] = 'estavel'
    if (cv > 0.15) tendencia = 'volatil'
    else if (var7 > 5) tendencia = 'alta'
    else if (var7 < -5) tendencia = 'baixa'

    // Melhor fornecedor no mês
    const melhorRow = r30.reduce((best, r) => r.preco < best.preco ? r : best, r30[0])

    // Previsão simples: extrapolação linear dos últimos 7 dias
    let previsao7 = 0
    if (r7.length >= 2) {
      const slope = (r7[r7.length - 1].preco - r7[0].preco) / r7.length
      previsao7 = medio30 > 0 ? (slope * 7 / medio30) * 100 : 0
    }

    tendencias.push({
      produto,
      categoria: rows[0].categoria,
      tendencia,
      variacao_7d: parseFloat(var7.toFixed(2)),
      variacao_30d: parseFloat(var30.toFixed(2)),
      preco_medio_30d: parseFloat(medio30.toFixed(4)),
      preco_atual: atual,
      melhor_fornecedor: melhorRow.fornecedor_nome,
      melhor_preco: melhorRow.preco,
      previsao_7d_pct: parseFloat(previsao7.toFixed(2)),
      data_analise: hoje,
      updated_at: new Date().toISOString(),
    })

    // Gerar alertas automáticos
    if (var7 > 10) {
      novosAlertas.push({
        tipo: 'aumento',
        produto,
        categoria: rows[0].categoria,
        mensagem: `Preço de ${produto} subiu ${var7.toFixed(1)}% nos últimos 7 dias`,
        variacao_pct: parseFloat(var7.toFixed(2)),
        preco_anterior: primeiroSemana,
        preco_atual: atual,
        fornecedor_nome: rows[rows.length - 1].fornecedor_nome,
        loja: rows[rows.length - 1].loja,
        lido: false,
      })
    } else if (var7 < -10) {
      novosAlertas.push({
        tipo: 'oportunidade',
        produto,
        categoria: rows[0].categoria,
        mensagem: `Oportunidade! ${produto} caiu ${Math.abs(var7).toFixed(1)}% — melhor comprar agora`,
        variacao_pct: parseFloat(var7.toFixed(2)),
        preco_anterior: primeiroSemana,
        preco_atual: atual,
        fornecedor_nome: melhorRow.fornecedor_nome,
        loja: melhorRow.loja,
        lido: false,
      })
    }

    if (previsao7 > 8) {
      novosAlertas.push({
        tipo: 'antecipacao',
        produto,
        categoria: rows[0].categoria,
        mensagem: `Tendência de alta para ${produto}: previsão +${previsao7.toFixed(1)}% em 7 dias`,
        variacao_pct: parseFloat(previsao7.toFixed(2)),
        preco_anterior: atual,
        preco_atual: null,
        fornecedor_nome: melhorRow.fornecedor_nome,
        loja: '',
        lido: false,
      })
    }
  }

  return { tendencias, novosAlertas }
}

// ── Cálculo automático de competitividade por fornecedor ─────

function calcCompetitividadeScores(history: MarketPriceHistory[]): Record<string, number> {
  const por30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const recentes = history.filter(h => h.data >= por30)
  if (recentes.length === 0) return {}

  // Média de mercado por produto
  const mediaMercado: Record<string, number> = {}
  const produtos = [...new Set(recentes.map(h => h.produto))]
  for (const p of produtos) {
    const precos = recentes.filter(h => h.produto === p).map(h => h.preco)
    mediaMercado[p] = precos.reduce((a, b) => a + b, 0) / precos.length
  }

  // Média por fornecedor por produto
  const scores: Record<string, number[]> = {}
  const fornecedores = [...new Set(recentes.map(h => h.fornecedor_nome).filter(Boolean))]
  for (const f of fornecedores) {
    const rows = recentes.filter(h => h.fornecedor_nome === f)
    const pontos: number[] = []
    for (const p of [...new Set(rows.map(r => r.produto))]) {
      const media_f = rows.filter(r => r.produto === p).map(r => r.preco)
        .reduce((a, b) => a + b, 0) / rows.filter(r => r.produto === p).length
      const media_m = mediaMercado[p] ?? media_f
      if (media_m === 0) continue
      // Ratio: 0.7 (30% mais barato) = 10 pts; 1.3 (30% mais caro) = 0 pts
      const ratio = media_f / media_m
      const score = Math.max(0, Math.min(10, (1.3 - ratio) / 0.6 * 10))
      pontos.push(score)
    }
    if (pontos.length > 0) {
      scores[f] = pontos
    }
  }

  const resultado: Record<string, number> = {}
  for (const [f, pontos] of Object.entries(scores)) {
    resultado[f] = parseFloat((pontos.reduce((a, b) => a + b, 0) / pontos.length).toFixed(2))
  }
  return resultado
}

// ── Tipos locais de formulário ────────────────────────────────

type Tab = 'overview' | 'ranking' | 'precos' | 'tendencias' | 'agente' | 'api'

const UNIDADES = ['kg', 'g', 'L', 'ml', 'un', 'cx', 'pç', 'dz', 'sc', 'fd']

// ─────────────────────────────────────────────────────────────

export default function MarketPage() {
  const { loja, lojas } = useLoja()
  const lojaReal = loja === 'Todas as Lojas' ? (lojas.find(l => l !== 'Todas as Lojas') ?? 'Amore CD') : loja
  const lojaQ    = loja !== 'Todas as Lojas' ? loja : undefined

  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [analisando, setAnalisando] = useState(false)

  const [prices,    setPrices]    = useState<MarketPriceHistory[]>([])
  const [scores,    setScores]    = useState<FornecedorScore[]>([])
  const [alerts,    setAlerts]    = useState<MarketAlert[]>([])
  const [tendencias,setTendencias]= useState<MarketTendencia[]>([])

  // Filtros
  const [filterProduto, setFilterProduto] = useState('')
  const [filterClass, setFilterClass] = useState<FornecedorScore['classificacao'] | 'todas'>('todas')
  const [filterAlertTipo, setFilterAlertTipo] = useState<string>('todos')

  // Formulário de preço
  const [showPriceForm, setShowPriceForm] = useState(false)
  const [priceForm, setPriceForm] = useState({
    produto: '', categoria: '', fornecedor_nome: '', preco: '',
    unidade: 'kg', data: new Date().toISOString().slice(0, 10),
    fonte: 'manual' as MarketPriceHistory['fonte'], obs: '',
  })

  // Formulário de score
  const [editScore, setEditScore] = useState<FornecedorScore | null>(null)
  const [scoreForm, setScoreForm] = useState({
    fornecedor_nome: '',
    score_operacional: '5',
    score_financeiro: '5',
    score_confiabilidade: '5',
    score_entrega: '5',
    score_competitividade: '5',
    total_pedidos: '0',
    pedidos_no_prazo: '0',
    pedidos_em_atraso: '0',
    rupturas: '0',
    obs: '',
  })
  const [showScoreForm, setShowScoreForm] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [p, s, a, t] = await Promise.all([
        fetchMarketPriceHistory(lojaQ),
        fetchFornecedorScores(),
        fetchMarketAlerts(),
        fetchMarketTendencias(),
      ])
      setPrices(p)
      setScores(s)
      setAlerts(a)
      setTendencias(t)
    } finally {
      setLoading(false)
    }
  }, [lojaQ])

  useEffect(() => { void reload() }, [reload])

  // ── Handlers de Preço ──────────────────────────────────────

  const handleAddPrice = async () => {
    if (!priceForm.produto.trim() || !priceForm.fornecedor_nome.trim() || !priceForm.preco) return
    const novo: Omit<MarketPriceHistory, 'id' | 'created_at'> = {
      produto: priceForm.produto.trim(),
      categoria: priceForm.categoria.trim(),
      fornecedor_nome: priceForm.fornecedor_nome.trim(),
      preco: parseFloat(priceForm.preco.replace(',', '.')),
      unidade: priceForm.unidade,
      loja: lojaReal,
      fonte: priceForm.fonte,
      data: priceForm.data,
      obs: priceForm.obs.trim(),
    }
    const inserted = await insertMarketPrice(novo)
    setPrices(prev => [inserted, ...prev])
    setPriceForm({ produto: '', categoria: '', fornecedor_nome: '', preco: '', unidade: 'kg', data: new Date().toISOString().slice(0, 10), fonte: 'manual', obs: '' })
    setShowPriceForm(false)

    // Auto-update competitividade do fornecedor
    const allPrices = [inserted, ...prices]
    const compScores = calcCompetitividadeScores(allPrices)
    const compScore = compScores[novo.fornecedor_nome]
    if (compScore !== undefined) {
      const existing = scores.find(s => s.fornecedor_nome === novo.fornecedor_nome)
      if (existing) {
        const novoScore = { ...existing, score_competitividade: compScore, ultima_atualizacao: new Date().toISOString() }
        novoScore.score_total = calcScoreTotal(novoScore)
        novoScore.classificacao = getClassificacao(novoScore.score_total)
        upsertFornecedorScore(novoScore).catch(console.error)
        setScores(prev => prev.map(s => s.fornecedor_nome === novo.fornecedor_nome ? novoScore : s))
      }
    }
  }

  const handleDeletePrice = (id: string) => {
    setPrices(prev => prev.filter(p => p.id !== id))
    deleteMarketPrice(id).catch(console.error)
  }

  // ── Handlers de Score ──────────────────────────────────────

  const openScoreForm = (s?: FornecedorScore) => {
    if (s) {
      setEditScore(s)
      setScoreForm({
        fornecedor_nome: s.fornecedor_nome,
        score_operacional: String(s.score_operacional),
        score_financeiro: String(s.score_financeiro),
        score_confiabilidade: String(s.score_confiabilidade),
        score_entrega: String(s.score_entrega),
        score_competitividade: String(s.score_competitividade),
        total_pedidos: String(s.total_pedidos),
        pedidos_no_prazo: String(s.pedidos_no_prazo),
        pedidos_em_atraso: String(s.pedidos_em_atraso),
        rupturas: String(s.rupturas),
        obs: s.obs,
      })
    } else {
      setEditScore(null)
      setScoreForm({ fornecedor_nome: '', score_operacional: '5', score_financeiro: '5', score_confiabilidade: '5', score_entrega: '5', score_competitividade: '5', total_pedidos: '0', pedidos_no_prazo: '0', pedidos_em_atraso: '0', rupturas: '0', obs: '' })
    }
    setShowScoreForm(true)
  }

  const handleSaveScore = async () => {
    if (!scoreForm.fornecedor_nome.trim()) return
    const s = {
      fornecedor_nome: scoreForm.fornecedor_nome.trim(),
      score_operacional: parseFloat(scoreForm.score_operacional) || 5,
      score_financeiro: parseFloat(scoreForm.score_financeiro) || 5,
      score_confiabilidade: parseFloat(scoreForm.score_confiabilidade) || 5,
      score_entrega: parseFloat(scoreForm.score_entrega) || 5,
      score_competitividade: parseFloat(scoreForm.score_competitividade) || 5,
      total_pedidos: parseInt(scoreForm.total_pedidos) || 0,
      pedidos_no_prazo: parseInt(scoreForm.pedidos_no_prazo) || 0,
      pedidos_em_atraso: parseInt(scoreForm.pedidos_em_atraso) || 0,
      rupturas: parseInt(scoreForm.rupturas) || 0,
      avaliacao_media: 0,
      obs: scoreForm.obs,
      ultima_atualizacao: new Date().toISOString(),
    }
    s.score_competitividade = Math.min(10, Math.max(0, s.score_competitividade))
    const total = calcScoreTotal(s)
    const classificacao = getClassificacao(total)
    const payload = { ...s, score_total: total, classificacao }
    const saved = await upsertFornecedorScore(payload)
    if (editScore) {
      setScores(prev => prev.map(x => x.fornecedor_nome === saved.fornecedor_nome ? saved : x))
    } else {
      setScores(prev => {
        const idx = prev.findIndex(x => x.fornecedor_nome === saved.fornecedor_nome)
        return idx >= 0 ? prev.map((x, i) => i === idx ? saved : x) : [saved, ...prev]
      })
    }
    setShowScoreForm(false)
  }

  const handleDeleteScore = (id: string) => {
    setScores(prev => prev.filter(s => s.id !== id))
    deleteFornecedorScore(id).catch(console.error)
  }

  // ── Handler de Análise ─────────────────────────────────────

  const handleAnalisar = async () => {
    if (prices.length < 4) return
    setAnalisando(true)
    try {
      const { tendencias: novasTend, novosAlertas } = analisarTendencias(prices)

      // Salvar tendências
      const saved: MarketTendencia[] = []
      for (const t of novasTend) {
        try { saved.push(await upsertMarketTendencia(t)) } catch { /* skip */ }
      }
      setTendencias(saved)

      // Salvar novos alertas
      const savedAlerts: MarketAlert[] = []
      for (const a of novosAlertas) {
        try { savedAlerts.push(await insertMarketAlert(a)) } catch { /* skip */ }
      }
      if (savedAlerts.length > 0) setAlerts(prev => [...savedAlerts, ...prev])

      // Auto-update scores de competitividade
      const compScores = calcCompetitividadeScores(prices)
      for (const [fornecedor_nome, compScore] of Object.entries(compScores)) {
        const existing = scores.find(s => s.fornecedor_nome === fornecedor_nome)
        if (existing) {
          const updated = { ...existing, score_competitividade: compScore, ultima_atualizacao: new Date().toISOString() }
          updated.score_total = calcScoreTotal(updated)
          updated.classificacao = getClassificacao(updated.score_total)
          upsertFornecedorScore(updated).catch(console.error)
          setScores(prev => prev.map(s => s.fornecedor_nome === fornecedor_nome ? updated : s))
        }
      }

      setTab('tendencias')
    } finally {
      setAnalisando(false)
    }
  }

  // ── KPIs derivados ─────────────────────────────────────────

  const naoLidos = alerts.filter(a => !a.lido).length
  const scoreMedio = scores.length > 0
    ? (scores.reduce((acc, s) => acc + s.score_total, 0) / scores.length).toFixed(1)
    : '—'
  const melhorFornecedor = scores.length > 0 ? scores[0] : null
  const produtosAlta = tendencias.filter(t => t.tendencia === 'alta').length
  const produtosBaixa = tendencias.filter(t => t.tendencia === 'baixa').length
  const oportunidades = alerts.filter(a => a.tipo === 'oportunidade' && !a.lido)

  // ── Produtos únicos do histórico de preços ────────────────

  const produtosUnicos = [...new Set(prices.map(p => p.produto))].sort()

  // ── JSX ───────────────────────────────────────────────────

  const tabStyle = (t: Tab) => ({
    padding: '6px 14px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: tab === t ? 700 : 400,
    background: tab === t ? 'var(--bordo)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--txt-sec)',
    transition: 'all .15s',
  } as React.CSSProperties)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
      <RefreshCw size={20} className="spin" style={{ color: 'var(--bordo)' }} />
      <span style={{ color: 'var(--txt-sec)' }}>Carregando inteligência de mercado...</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Topbar do módulo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={20} color="var(--bordo)" />
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--txt)' }}>Market Analytics & Supplier Intelligence</span>
          {naoLidos > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
              {naoLidos} alerta{naoLidos > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleAnalisar}
            disabled={analisando || prices.length < 4}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: prices.length < 4 ? 'not-allowed' : 'pointer', background: 'var(--bordo)', color: '#fff', fontWeight: 600, fontSize: 13, opacity: analisando || prices.length < 4 ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
            title={prices.length < 4 ? 'Adicione pelo menos 4 preços para analisar' : ''}
          >
            {analisando ? <RefreshCw size={13} className="spin" /> : <Zap size={13} />}
            {analisando ? 'Analisando...' : 'Analisar Mercado'}
          </button>
          <button onClick={reload} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'transparent', cursor: 'pointer', color: 'var(--txt-sec)' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
        <button style={tabStyle('overview')}  onClick={() => setTab('overview')}>📊 Overview</button>
        <button style={tabStyle('ranking')}   onClick={() => setTab('ranking')}>🏆 Ranking</button>
        <button style={tabStyle('precos')}    onClick={() => setTab('precos')}>💲 Preços</button>
        <button style={tabStyle('tendencias')}onClick={() => setTab('tendencias')}>📈 Tendências</button>
        <button style={{ ...tabStyle('agente'), background: tab === 'agente' ? '#7c3aed' : 'transparent', border: tab === 'agente' ? 'none' : '1px solid #7c3aed40', color: tab === 'agente' ? '#fff' : '#7c3aed' }} onClick={() => setTab('agente')}>🤖 Agente IA</button>
        <button style={tabStyle('api')}       onClick={() => setTab('api')}>🔌 API Docs</button>
      </div>

      {/* ── TAB: OVERVIEW ───────────────────────────────────── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
            {[
              { label: 'Fornecedores', value: scores.length, sub: 'com score ativo', icon: <Award size={18} color="var(--bordo)" /> },
              { label: 'Alertas Ativos', value: naoLidos, sub: 'não lidos', icon: <Bell size={18} color={naoLidos > 0 ? '#ef4444' : '#6b7280'} /> },
              { label: 'Score Médio', value: scoreMedio, sub: 'do mercado', icon: <Star size={18} color="#f59e0b" /> },
              { label: 'Em Alta', value: produtosAlta, sub: 'produtos tendência ↑', icon: <TrendingUp size={18} color="#ef4444" /> },
              { label: 'Em Baixa', value: produtosBaixa, sub: 'produtos tendência ↓', icon: <TrendingDown size={18} color="#22c55e" /> },
              { label: 'Oportunidades', value: oportunidades.length, sub: 'para compra agora', icon: <Target size={18} color="#3b82f6" /> },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--bordo-l)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, color: 'var(--txt-sec)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</span>
                  {kpi.icon}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--txt)', margin: '4px 0 2px' }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: 'var(--txt-sec)' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Painel de Oportunidades */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--bordo-l)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Target size={16} color="var(--bordo)" /> Painel de Oportunidades
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
              {/* Melhor Fornecedor do Dia */}
              <OpCard
                titulo="Melhor Fornecedor"
                valor={melhorFornecedor?.fornecedor_nome ?? '—'}
                detalhe={melhorFornecedor ? `Score ${melhorFornecedor.score_total.toFixed(1)} · ${CLASS_CONFIG[melhorFornecedor.classificacao].icon} ${CLASS_CONFIG[melhorFornecedor.classificacao].label}` : 'Cadastre fornecedores'}
                cor="#f59e0b" icone="🥇"
              />
              {/* Produto com maior queda 7d */}
              {(() => {
                const sorted = [...tendencias].sort((a, b) => a.variacao_7d - b.variacao_7d)
                const melhor = sorted[0]
                return <OpCard titulo="Maior Queda (7d)" valor={melhor ? melhor.produto : '—'} detalhe={melhor ? `${melhor.variacao_7d.toFixed(1)}% · Melhor hora p/ comprar` : 'Sem dados'} cor="#22c55e" icone="📉" />
              })()}
              {/* Produto com maior alta 7d */}
              {(() => {
                const sorted = [...tendencias].sort((a, b) => b.variacao_7d - a.variacao_7d)
                const pior = sorted[0]
                return <OpCard titulo="Maior Alta (7d)" valor={pior ? pior.produto : '—'} detalhe={pior ? `+${pior.variacao_7d.toFixed(1)}% · Negociar agora` : 'Sem dados'} cor="#ef4444" icone="📈" />
              })()}
              {/* Melhor preço atual */}
              {(() => {
                const best = tendencias.reduce<MarketTendencia | null>((acc, t) => t.melhor_preco > 0 && (!acc || t.melhor_preco < acc.melhor_preco) ? t : acc, null)
                return <OpCard titulo="Melhor Oportunidade" valor={best ? best.produto : '—'} detalhe={best ? `R$ ${best.melhor_preco.toFixed(2)} / ${prices.find(p => p.produto === best.produto)?.unidade ?? ''} via ${best.melhor_fornecedor}` : 'Sem dados'} cor="#3b82f6" icone="💡" />
              })()}
              {/* Tendência de alta */}
              {(() => {
                const altas = tendencias.filter(t => t.tendencia === 'alta').slice(0, 3).map(t => t.produto).join(', ')
                return <OpCard titulo="Em Tendência de Alta" valor={altas || '—'} detalhe={`${produtosAlta} produto${produtosAlta !== 1 ? 's' : ''} em alta`} cor="#f97316" icone="⬆️" />
              })()}
              {/* Tendência de baixa */}
              {(() => {
                const baixas = tendencias.filter(t => t.tendencia === 'baixa').slice(0, 3).map(t => t.produto).join(', ')
                return <OpCard titulo="Em Tendência de Baixa" valor={baixas || '—'} detalhe={`${produtosBaixa} produto${produtosBaixa !== 1 ? 's' : ''} em baixa`} cor="#22c55e" icone="⬇️" />
              })()}
            </div>
          </div>

          {/* Alertas recentes */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--bordo-l)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bell size={16} color="var(--bordo)" /> Alertas Recentes
              </span>
              {naoLidos > 0 && (
                <button onClick={() => { marcarTodosLidos().catch(console.error); setAlerts(prev => prev.map(a => ({ ...a, lido: true }))) }}
                  style={{ fontSize: 12, color: 'var(--bordo)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Marcar todos como lidos
                </button>
              )}
            </div>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--txt-sec)', fontSize: 13 }}>
                Nenhum alerta ainda. Clique em "Analisar Mercado" para gerar automaticamente.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {alerts.slice(0, 30).map(a => {
                  const cfg = ALERT_CONFIG[a.tipo]
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, background: a.lido ? 'transparent' : cfg.bg, border: `1px solid ${a.lido ? 'var(--bordo-l)' : cfg.color}20`, opacity: a.lido ? 0.6 : 1 }}>
                      <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</div>
                        <div style={{ fontSize: 13, color: 'var(--txt)' }}>{a.mensagem}</div>
                        <div style={{ fontSize: 11, color: 'var(--txt-sec)', marginTop: 2 }}>
                          {a.variacao_pct > 0 ? `+${a.variacao_pct.toFixed(1)}%` : `${a.variacao_pct.toFixed(1)}%`}
                          {a.preco_anterior && a.preco_atual ? ` · R$ ${a.preco_anterior.toFixed(2)} → R$ ${a.preco_atual.toFixed(2)}` : ''}
                          {a.fornecedor_nome ? ` · ${a.fornecedor_nome}` : ''}
                          {' · '}{new Date(a.created_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      {!a.lido && (
                        <button onClick={() => { marcarAlertaLido(a.id).catch(console.error); setAlerts(prev => prev.map(x => x.id === a.id ? { ...x, lido: true } : x)) }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--txt-sec)', padding: 4 }} title="Marcar como lido">
                          <Eye size={14} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: RANKING ────────────────────────────────────── */}
      {tab === 'ranking' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['todas', 'ouro', 'prata', 'bronze', 'observacao', 'critico'] as const).map(c => (
                <button key={c} onClick={() => setFilterClass(c)}
                  style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${filterClass === c ? 'var(--bordo)' : 'var(--bordo-l)'}`, background: filterClass === c ? 'var(--bordo)' : 'transparent', color: filterClass === c ? '#fff' : 'var(--txt-sec)', fontSize: 12, cursor: 'pointer', fontWeight: filterClass === c ? 700 : 400 }}>
                  {c === 'todas' ? 'Todos' : CLASS_CONFIG[c].icon + ' ' + CLASS_CONFIG[c].label}
                </button>
              ))}
            </div>
            <button onClick={() => openScoreForm()} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} /> Novo Fornecedor
            </button>
          </div>

          {/* Modal de Score */}
          {showScoreForm && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--txt)' }}>{editScore ? 'Editar Score' : 'Novo Score de Fornecedor'}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{ fontSize: 12, color: 'var(--txt-sec)' }}>Nome do Fornecedor *
                    <input value={scoreForm.fornecedor_nome} onChange={e => setScoreForm(p => ({ ...p, fornecedor_nome: e.target.value }))}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 13, boxSizing: 'border-box' }} />
                  </label>
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', marginBottom: 10 }}>Scores (0–10)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {[
                        ['Competitividade', 'score_competitividade', '30%'],
                        ['Confiabilidade',  'score_confiabilidade',  '25%'],
                        ['Entrega',         'score_entrega',         '25%'],
                        ['Operacional',     'score_operacional',     '10%'],
                        ['Financeiro',      'score_financeiro',      '10%'],
                      ].map(([label, key, peso]) => (
                        <label key={key} style={{ fontSize: 12, color: 'var(--txt-sec)' }}>
                          {label} <span style={{ color: 'var(--bordo)', fontSize: 10 }}>({peso})</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <input type="range" min="0" max="10" step="0.5"
                              value={scoreForm[key as keyof typeof scoreForm]}
                              onChange={e => setScoreForm(p => ({ ...p, [key]: e.target.value }))}
                              style={{ flex: 1 }} />
                            <span style={{ minWidth: 28, textAlign: 'right', fontWeight: 700, color: 'var(--txt)', fontSize: 14 }}>
                              {parseFloat(scoreForm[key as keyof typeof scoreForm] as string).toFixed(1)}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-card)', textAlign: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--txt-sec)' }}>Score Total: </span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--bordo)' }}>
                        {calcScoreTotal({
                          score_operacional: parseFloat(scoreForm.score_operacional) || 0,
                          score_financeiro: parseFloat(scoreForm.score_financeiro) || 0,
                          score_confiabilidade: parseFloat(scoreForm.score_confiabilidade) || 0,
                          score_entrega: parseFloat(scoreForm.score_entrega) || 0,
                          score_competitividade: parseFloat(scoreForm.score_competitividade) || 0,
                        }).toFixed(1)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--txt-sec)' }}> /10</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                    {[['Pedidos', 'total_pedidos'], ['No Prazo', 'pedidos_no_prazo'], ['Atraso', 'pedidos_em_atraso'], ['Rupturas', 'rupturas']].map(([l, k]) => (
                      <label key={k} style={{ fontSize: 11, color: 'var(--txt-sec)' }}>{l}
                        <input type="number" min="0" value={scoreForm[k as keyof typeof scoreForm]}
                          onChange={e => setScoreForm(p => ({ ...p, [k]: e.target.value }))}
                          style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--bordo-l)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 12, boxSizing: 'border-box' }} />
                      </label>
                    ))}
                  </div>
                  <label style={{ fontSize: 12, color: 'var(--txt-sec)' }}>Observações
                    <textarea value={scoreForm.obs} onChange={e => setScoreForm(p => ({ ...p, obs: e.target.value }))}
                      rows={2} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button onClick={() => setShowScoreForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'transparent', cursor: 'pointer', color: 'var(--txt-sec)', fontSize: 13 }}>Cancelar</button>
                  <button onClick={handleSaveScore} disabled={!scoreForm.fornecedor_nome.trim()}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Salvar</button>
                </div>
              </div>
            </div>
          )}

          {/* Lista de scores */}
          {scores.filter(s => filterClass === 'todas' || s.classificacao === filterClass).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--txt-sec)', fontSize: 13 }}>
              Nenhum fornecedor cadastrado nessa classificação. Clique em "Novo Fornecedor" para começar.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {scores
                .filter(s => filterClass === 'todas' || s.classificacao === filterClass)
                .map((s, idx) => {
                  const cfg = CLASS_CONFIG[s.classificacao]
                  return (
                    <div key={s.id} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '14px 16px', border: `1px solid var(--bordo-l)`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt-sec)', minWidth: 24 }}>#{idx + 1}</span>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--txt)' }}>{s.fornecedor_nome}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700 }}>
                            {cfg.icon} {cfg.label}
                          </span>
                          {s.total_pedidos > 0 && (
                            <span style={{ fontSize: 11, color: 'var(--txt-sec)' }}>
                              {s.pedidos_no_prazo}/{s.total_pedidos} no prazo · {s.rupturas} rupturas
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Barras de score */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,80px)', gap: 8 }}>
                        {[
                          { label: 'Competit.', val: s.score_competitividade },
                          { label: 'Confiab.', val: s.score_confiabilidade },
                          { label: 'Entrega', val: s.score_entrega },
                          { label: 'Operac.', val: s.score_operacional },
                          { label: 'Financ.', val: s.score_financeiro },
                        ].map(({ label, val }) => (
                          <div key={label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--txt-sec)', marginBottom: 3 }}>{label}</div>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--bordo-l)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${val * 10}%`, background: val >= 7 ? '#22c55e' : val >= 5 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt)', marginTop: 2 }}>{val.toFixed(1)}</div>
                          </div>
                        ))}
                      </div>

                      {/* Score total */}
                      <div style={{ textAlign: 'center', minWidth: 64 }}>
                        <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>TOTAL</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: cfg.color }}>{s.score_total.toFixed(1)}</div>
                      </div>

                      {/* Ações */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openScoreForm(s)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'transparent', cursor: 'pointer', color: 'var(--txt-sec)', fontSize: 12 }}>Editar</button>
                        <button onClick={() => handleDeleteScore(s.id)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #fca5a5', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: PREÇOS ─────────────────────────────────────── */}
      {tab === 'precos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                placeholder="🔍 Filtrar produto..."
                value={filterProduto}
                onChange={e => setFilterProduto(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 13, width: 200 }}
              />
              <span style={{ fontSize: 12, color: 'var(--txt-sec)' }}>{prices.length} registros</span>
            </div>
            <button onClick={() => setShowPriceForm(p => !p)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} /> Registrar Preço
            </button>
          </div>

          {/* Formulário de preço */}
          {showPriceForm && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--bordo-l)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)', marginBottom: 12 }}>Novo Registro de Preço</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
                {[
                  { label: 'Produto *', key: 'produto', type: 'text', placeholder: 'Ex: Frango' },
                  { label: 'Categoria', key: 'categoria', type: 'text', placeholder: 'Ex: Proteínas' },
                  { label: 'Fornecedor *', key: 'fornecedor_nome', type: 'text', placeholder: 'Nome do fornecedor' },
                  { label: 'Preço (R$) *', key: 'preco', type: 'text', placeholder: '0,00' },
                  { label: 'Data', key: 'data', type: 'date', placeholder: '' },
                  { label: 'Observação', key: 'obs', type: 'text', placeholder: 'Opcional' },
                ].map(({ label, key, type, placeholder }) => (
                  <label key={key} style={{ fontSize: 12, color: 'var(--txt-sec)' }}>{label}
                    <input type={type} placeholder={placeholder}
                      value={priceForm[key as keyof typeof priceForm] as string}
                      onChange={e => setPriceForm(p => ({ ...p, [key]: e.target.value }))}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 13, boxSizing: 'border-box' }} />
                  </label>
                ))}
                <label style={{ fontSize: 12, color: 'var(--txt-sec)' }}>Unidade
                  <select value={priceForm.unidade} onChange={e => setPriceForm(p => ({ ...p, unidade: e.target.value }))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 13 }}>
                    {UNIDADES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: 'var(--txt-sec)' }}>Fonte
                  <select value={priceForm.fonte} onChange={e => setPriceForm(p => ({ ...p, fonte: e.target.value as MarketPriceHistory['fonte'] }))}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 13 }}>
                    <option value="manual">Manual</option>
                    <option value="cotacao">Cotação</option>
                    <option value="compra">Compra Realizada</option>
                  </select>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowPriceForm(false)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'transparent', cursor: 'pointer', color: 'var(--txt-sec)', fontSize: 13 }}>Cancelar</button>
                <button onClick={handleAddPrice} disabled={!priceForm.produto.trim() || !priceForm.fornecedor_nome.trim() || !priceForm.preco}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                  Salvar
                </button>
              </div>
            </div>
          )}

          {/* Comparativo por produto */}
          {produtosUnicos.length > 0 && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--bordo-l)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart3 size={16} color="var(--bordo)" /> Comparativo por Produto
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {produtosUnicos
                  .filter(p => !filterProduto || p.toLowerCase().includes(filterProduto.toLowerCase()))
                  .slice(0, 20)
                  .map(produto => {
                    const rows = prices.filter(p => p.produto === produto)
                    const precos = rows.map(r => r.preco)
                    const min = Math.min(...precos)
                    const max = Math.max(...precos)
                    const avg = precos.reduce((a, b) => a + b, 0) / precos.length
                    const melhor = rows.find(r => r.preco === min)
                    return (
                      <div key={produto} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bordo-l)', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)', minWidth: 120 }}>{produto}</span>
                        <span style={{ fontSize: 11, color: 'var(--txt-sec)' }}>{rows[0]?.unidade}</span>
                        <div style={{ display: 'flex', gap: 16, flex: 1, flexWrap: 'wrap' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>MIN</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#22c55e' }}>R$ {min.toFixed(2)}</div>
                            <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>{melhor?.fornecedor_nome}</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>MÉDIA</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#f59e0b' }}>R$ {avg.toFixed(2)}</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>MAX</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#ef4444' }}>R$ {max.toFixed(2)}</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>REGISTROS</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{rows.length}</div>
                          </div>
                          {max > 0 && min > 0 && (
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>ECONOMIA</div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--bordo)' }}>
                                {(((max - min) / max) * 100).toFixed(1)}%
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Tabela de histórico */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--bordo-l)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)', marginBottom: 12 }}>Histórico Completo</div>
            {prices.filter(p => !filterProduto || p.produto.toLowerCase().includes(filterProduto.toLowerCase())).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--txt-sec)', fontSize: 13 }}>
                Nenhum registro. Clique em "Registrar Preço" para começar.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bordo-l)' }}>
                      {['Data', 'Produto', 'Categoria', 'Fornecedor', 'Preço', 'Un.', 'Fonte', 'Loja', ''].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: 'var(--txt-sec)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prices
                      .filter(p => !filterProduto || p.produto.toLowerCase().includes(filterProduto.toLowerCase()))
                      .slice(0, 100)
                      .map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--bordo-l)20' }}>
                          <td style={{ padding: '8px 10px', color: 'var(--txt-sec)', whiteSpace: 'nowrap' }}>{new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--txt)' }}>{p.produto}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--txt-sec)' }}>{p.categoria || '—'}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--txt)' }}>{p.fornecedor_nome}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#22c55e' }}>R$ {p.preco.toFixed(2)}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--txt-sec)' }}>{p.unidade}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--txt-sec)' }}>{p.fonte}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--txt-sec)' }}>{p.loja}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <button onClick={() => handleDeletePrice(p.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: TENDÊNCIAS ─────────────────────────────────── */}
      {tab === 'tendencias' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fef3c7', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={14} />
            Clique em <strong>"Analisar Mercado"</strong> (botão acima) para gerar tendências e alertas automaticamente a partir do histórico de preços.
          </div>

          {tendencias.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--txt-sec)' }}>
              <Activity size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontSize: 14 }}>Nenhuma tendência ainda.</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Registre preços e clique em "Analisar Mercado".</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
              {tendencias.map(t => {
                const cfg = TEND_CONFIG[t.tendencia]
                return (
                  <div key={t.id} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: `2px solid ${cfg.color}30` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--txt)' }}>{t.produto}</div>
                        {t.categoria && <div style={{ fontSize: 11, color: 'var(--txt-sec)' }}>{t.categoria}</div>}
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 99, background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 700 }}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>Var. 7 dias</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: t.variacao_7d > 0 ? '#ef4444' : t.variacao_7d < 0 ? '#22c55e' : 'var(--txt)' }}>
                          {t.variacao_7d > 0 ? '+' : ''}{t.variacao_7d.toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>Var. 30 dias</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: t.variacao_30d > 0 ? '#ef4444' : t.variacao_30d < 0 ? '#22c55e' : 'var(--txt)' }}>
                          {t.variacao_30d > 0 ? '+' : ''}{t.variacao_30d.toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>Preço Atual</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>R$ {t.preco_atual.toFixed(2)}</div>
                      </div>
                      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--txt-sec)' }}>Previsão 7d</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: t.previsao_7d_pct > 0 ? '#ef4444' : '#22c55e' }}>
                          {t.previsao_7d_pct > 0 ? '+' : ''}{t.previsao_7d_pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    {t.melhor_fornecedor && (
                      <div style={{ marginTop: 10, padding: '6px 10px', borderRadius: 8, background: '#f0fdf4', fontSize: 12 }}>
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>💡 Melhor preço:</span>
                        <span style={{ color: 'var(--txt)', marginLeft: 6 }}>R$ {t.melhor_preco.toFixed(2)} via {t.melhor_fornecedor}</span>
                      </div>
                    )}
                    <div style={{ marginTop: 6, fontSize: 10, color: 'var(--txt-sec)' }}>
                      Análise: {new Date(t.data_analise + 'T12:00:00').toLocaleDateString('pt-BR')} · Média 30d: R$ {t.preco_medio_30d.toFixed(2)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Alertas filtrados */}
          {alerts.length > 0 && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--bordo-l)', marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)' }}>Histórico de Alertas</span>
                <select value={filterAlertTipo} onChange={e => setFilterAlertTipo(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 12 }}>
                  <option value="todos">Todos os tipos</option>
                  {Object.entries(ALERT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {alerts
                  .filter(a => filterAlertTipo === 'todos' || a.tipo === filterAlertTipo)
                  .slice(0, 50)
                  .map(a => {
                    const cfg = ALERT_CONFIG[a.tipo]
                    return (
                      <div key={a.id} style={{ display: 'flex', gap: 8, padding: '8px 10px', borderRadius: 8, background: cfg.bg, fontSize: 12 }}>
                        <span>{cfg.icon}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}:</span>
                          <span style={{ marginLeft: 6, color: 'var(--txt)' }}>{a.mensagem}</span>
                        </div>
                        <span style={{ color: 'var(--txt-sec)', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: AGENTE IA ───────────────────────────────────── */}
      {tab === 'agente' && (
        <AgenteTab
          prices={prices}
          scores={scores}
          tendencias={tendencias}
          lojaReal={lojaReal}
          onAddPrice={(p) => {
            insertMarketPrice(p).then(saved => setPrices(prev => [saved, ...prev])).catch(console.error)
          }}
        />
      )}

      {/* ── TAB: API DOCS ────────────────────────────────────── */}
      {tab === 'api' && <ApiDocsTab />}
    </div>
  )
}

// ── Componente OpCard ─────────────────────────────────────────

function OpCard({ titulo, valor, detalhe, cor, icone }: { titulo: string; valor: string; detalhe: string; cor: string; icone: string }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', border: `1px solid ${cor}20` }}>
      <div style={{ fontSize: 11, color: 'var(--txt-sec)', marginBottom: 4 }}>{icone} {titulo}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)', marginBottom: 2, wordBreak: 'break-word' }}>{valor}</div>
      <div style={{ fontSize: 11, color: 'var(--txt-sec)' }}>{detalhe}</div>
    </div>
  )
}

// ── Serper Search ─────────────────────────────────────────────

interface SerperOrganic { title: string; link: string; snippet: string; position: number }
interface SerperResult  { organic: SerperOrganic[]; answerBox?: { answer?: string; snippet?: string } }

async function serperSearch(query: string, apiKey: string): Promise<SerperResult> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'br', hl: 'pt-br', num: 10 }),
  })
  if (!res.ok) throw new Error(`Serper API: ${res.status} ${res.statusText}`)
  return res.json()
}

function extractPrecos(text: string): Array<{ valor: number; contexto: string }> {
  const results: Array<{ valor: number; contexto: string }> = []
  // Match R$ X,XX or R$ X.XXX,XX patterns
  const re = /R\$\s*([\d]{1,4}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].replace(/\./g, '').replace(',', '.')
    const val = parseFloat(raw)
    if (!isNaN(val) && val > 0.5 && val < 50000) {
      const start = Math.max(0, m.index - 40)
      const end   = Math.min(text.length, m.index + m[0].length + 40)
      results.push({ valor: val, contexto: text.slice(start, end).trim() })
    }
  }
  return results
}

type MsgRole = 'user' | 'agent' | 'error' | 'system'

interface ChatMsg {
  id: string
  role: MsgRole
  content: string
  results?: SerperOrganic[]
  precos?: Array<{ valor: number; contexto: string; fonte: string; produto: string; fornecedor: string }>
  added?: boolean
  timestamp: Date
}

function buildQuery(input: string): { query: string; tipo: string; produto: string } {
  const low = input.toLowerCase().trim()

  // Detecta intenção
  if (/^(pesquisar?|buscar?|procurar?|preço|preco|valor|cotação|cotacao)\s+(.+)/i.test(low)) {
    const produto = low.replace(/^(pesquisar?|buscar?|procurar?|preço|preco|valor|cotação|cotacao)\s+/i, '').trim()
    return { query: `preço ${produto} atacado fornecedor brasil 2025`, tipo: 'preco', produto }
  }
  if (/^(analisar?|fornecedor)\s+(.+)/i.test(low)) {
    const nome = low.replace(/^(analisar?|fornecedor)\s+/i, '').trim()
    return { query: `${nome} fornecedor atacado brasil avaliação confiabilidade`, tipo: 'fornecedor', produto: nome }
  }
  if (/^(tendência|tendencia|variação|variacao|histórico|historico)\s+(.+)/i.test(low)) {
    const produto = low.replace(/^(tendência|tendencia|variação|variacao|histórico|historico)\s+/i, '').trim()
    return { query: `variação preço ${produto} brasil 2024 2025 tendência`, tipo: 'tendencia', produto }
  }
  if (/^(melhores?|top|ranking)\s+(fornecedores?|distribuidoras?)\s+(.+)/i.test(low)) {
    const cat = low.replace(/^(melhores?|top|ranking)\s+(fornecedores?|distribuidoras?)\s+/i, '').trim()
    return { query: `melhores fornecedores distribuidores ${cat} atacado brasil`, tipo: 'ranking', produto: cat }
  }
  return { query: `${input} mercado brasil preços atacado`, tipo: 'geral', produto: input }
}

// ── AgenteTab Component ───────────────────────────────────────

interface AgenteTabProps {
  prices: MarketPriceHistory[]
  scores: FornecedorScore[]
  tendencias: MarketTendencia[]
  lojaReal: string
  onAddPrice: (p: Omit<MarketPriceHistory, 'id' | 'created_at'>) => void
}

function AgenteTab({ prices, scores, tendencias, lojaReal, onAddPrice }: AgenteTabProps) {
  const STORAGE_KEY = 'amore_serper_key'
  const [apiKey, setApiKey]       = useState(() => localStorage.getItem(STORAGE_KEY) ?? (import.meta.env.VITE_SERPER_API_KEY ?? ''))
  const [keyInput, setKeyInput]   = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [msgs, setMsgs]           = useState<ChatMsg[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const bottomRef                 = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const saveKey = () => {
    if (!keyInput.trim()) return
    localStorage.setItem(STORAGE_KEY, keyInput.trim())
    setApiKey(keyInput.trim())
    setKeyInput('')
    setShowSetup(false)
    addSystemMsg('✅ Chave Serper configurada com sucesso! Já pode pesquisar no Google.')
  }

  const removeKey = () => {
    localStorage.removeItem(STORAGE_KEY)
    setApiKey('')
    addSystemMsg('🔑 Chave removida. Configure uma nova chave para pesquisar no Google.')
  }

  const addSystemMsg = (content: string) => {
    setMsgs(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content, timestamp: new Date() }])
  }

  // Análise interna sem Google
  const runInternalAnalysis = (query: string) => {
    const low = query.toLowerCase()
    const lines: string[] = []

    // Encontra produtos relevantes no histórico
    const matching = prices.filter(p =>
      p.produto.toLowerCase().includes(low) ||
      p.categoria.toLowerCase().includes(low) ||
      low.includes(p.produto.toLowerCase())
    )

    if (matching.length > 0) {
      const produto = matching[0].produto
      const precos  = matching.map(p => p.preco)
      const min     = Math.min(...precos)
      const max     = Math.max(...precos)
      const avg     = precos.reduce((a, b) => a + b, 0) / precos.length
      lines.push(`📦 **${produto}** — ${matching.length} registros no histórico`)
      lines.push(`💰 Menor preço: R$ ${min.toFixed(2)} · Maior: R$ ${max.toFixed(2)} · Média: R$ ${avg.toFixed(2)}`)
      const melhorRow = matching.reduce((a, b) => a.preco < b.preco ? a : b)
      lines.push(`🏆 Melhor fornecedor: ${melhorRow.fornecedor_nome} @ R$ ${melhorRow.preco.toFixed(2)}/${melhorRow.unidade}`)
      const tend = tendencias.find(t => t.produto === produto)
      if (tend) {
        lines.push(`📈 Tendência atual: ${tend.tendencia.toUpperCase()} · Variação 7d: ${tend.variacao_7d > 0 ? '+' : ''}${tend.variacao_7d.toFixed(1)}%`)
      }
    } else {
      lines.push(`🔍 Nenhum dado interno encontrado para "${query}".`)
      lines.push(`💡 Configure a API do Google (Serper) para buscar preços em tempo real.`)
    }

    // Score do fornecedor
    const scoreMatch = scores.filter(s => s.fornecedor_nome.toLowerCase().includes(low))
    if (scoreMatch.length > 0) {
      lines.push('')
      for (const s of scoreMatch.slice(0, 3)) {
        lines.push(`🎯 Fornecedor: **${s.fornecedor_nome}** — Score: ${s.score_total.toFixed(1)}/10 (${s.classificacao.toUpperCase()})`)
      }
    }

    // Resumo geral se consulta genérica
    if (matching.length === 0 && scoreMatch.length === 0) {
      const total = prices.length
      const fornecs = [...new Set(prices.map(p => p.fornecedor_nome))].length
      const produtos = [...new Set(prices.map(p => p.produto))].length
      lines.push(`📊 **Resumo do mercado monitorado:**`)
      lines.push(`• ${produtos} produtos · ${fornecs} fornecedores · ${total} registros de preço`)
      lines.push(`• ${scores.length} fornecedores com score ativo`)
      lines.push(`• ${tendencias.length} tendências analisadas`)
      if (scores.length > 0) {
        lines.push(`• Melhor fornecedor geral: **${scores[0].fornecedor_nome}** (${scores[0].score_total.toFixed(1)}/10)`)
      }
    }

    return lines.join('\n')
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')

    setMsgs(prev => [...prev, {
      id: crypto.randomUUID(), role: 'user', content: userMsg, timestamp: new Date()
    }])

    setLoading(true)
    try {
      if (!apiKey) {
        // Análise interna
        const analysis = runInternalAnalysis(userMsg)
        setMsgs(prev => [...prev, {
          id: crypto.randomUUID(), role: 'agent',
          content: analysis + '\n\n_⚠️ Para pesquisa em tempo real no Google, configure a chave Serper acima._',
          timestamp: new Date()
        }])
        return
      }

      const { query, tipo, produto } = buildQuery(userMsg)

      // Informar usuário o que está buscando
      setMsgs(prev => [...prev, {
        id: crypto.randomUUID(), role: 'system',
        content: `🔍 Buscando: "${query}"...`,
        timestamp: new Date()
      }])

      const result = await serperSearch(query, apiKey)
      const organics = result.organic ?? []

      // Extrair preços de todos os snippets + títulos
      const allPrecos: Array<{ valor: number; contexto: string; fonte: string; produto: string; fornecedor: string }> = []
      for (const r of organics) {
        const text = `${r.title} ${r.snippet}`
        const found = extractPrecos(text)
        for (const p of found) {
          let domain = r.link
          try { domain = new URL(r.link).hostname.replace('www.', '') } catch { /* ignore */ }
          allPrecos.push({
            valor: p.valor, contexto: p.contexto,
            fonte: domain, produto: produto || userMsg, fornecedor: domain,
          })
        }
      }

      // Montar mensagem de resposta
      let responseContent = ''
      if (tipo === 'preco' && allPrecos.length > 0) {
        const vals = allPrecos.map(p => p.valor)
        const min = Math.min(...vals)
        const max = Math.max(...vals)
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length

        // Compare com dados internos
        const interno = prices.filter(p => p.produto.toLowerCase().includes(produto.toLowerCase()))
        const interno_med = interno.length > 0 ? interno.map(p => p.preco).reduce((a, b) => a + b, 0) / interno.length : null

        responseContent = `✅ **${produto.charAt(0).toUpperCase() + produto.slice(1)}** — ${allPrecos.length} preços encontrados\n\n`
        responseContent += `💰 Mínimo: **R$ ${min.toFixed(2)}** · Máximo: R$ ${max.toFixed(2)} · Média: **R$ ${avg.toFixed(2)}**\n`
        if (interno_med !== null) {
          const diff = ((avg - interno_med) / interno_med) * 100
          responseContent += `📊 Comparando com seu histórico (R$ ${interno_med.toFixed(2)}): ${diff > 0 ? '⬆️' : '⬇️'} ${Math.abs(diff).toFixed(1)}% ${diff > 0 ? 'mais caro' : 'mais barato'} no mercado\n`
        }
        responseContent += `\n_Selecione os preços abaixo para adicionar ao histórico:_`
      } else if (tipo === 'fornecedor') {
        responseContent = `🏢 **Análise de fornecedor: ${produto}**\n\n`
        responseContent += organics.slice(0, 4).map(r => `• **${r.title}**\n  ${r.snippet}`).join('\n\n')
      } else if (tipo === 'tendencia') {
        responseContent = `📈 **Tendência de mercado: ${produto}**\n\n`
        const tend = tendencias.find(t => t.produto.toLowerCase().includes(produto.toLowerCase()))
        if (tend) {
          responseContent += `📊 Dados internos: ${tend.tendencia.toUpperCase()} · 7d: ${tend.variacao_7d > 0 ? '+' : ''}${tend.variacao_7d.toFixed(1)}% · 30d: ${tend.variacao_30d.toFixed(1)}%\n\n`
        }
        responseContent += `🌐 Mercado:\n` + organics.slice(0, 3).map(r => `• ${r.title}: ${r.snippet.slice(0, 120)}...`).join('\n')
      } else {
        responseContent = organics.length > 0
          ? `🌐 Resultados para "${userMsg}":\n\n` + organics.slice(0, 5).map(r => `• **${r.title}**\n  ${r.snippet}`).join('\n\n')
          : `Nenhum resultado encontrado para "${userMsg}".`
      }

      setMsgs(prev => [...prev, {
        id: crypto.randomUUID(), role: 'agent',
        content: responseContent,
        results: organics.slice(0, 6),
        precos: allPrecos.length > 0 ? allPrecos.slice(0, 12) : undefined,
        timestamp: new Date()
      }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMsgs(prev => [...prev, {
        id: crypto.randomUUID(), role: 'error',
        content: `❌ Erro: ${msg}\n\nVerifique se a chave Serper está correta e tem créditos disponíveis.`,
        timestamp: new Date()
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleAddPreco = (msg: ChatMsg, p: { valor: number; contexto: string; fonte: string; produto: string; fornecedor: string }, unidade = 'kg') => {
    onAddPrice({
      produto: p.produto,
      categoria: '',
      fornecedor_nome: p.fornecedor,
      preco: p.valor,
      unidade,
      loja: lojaReal,
      fonte: 'manual',
      data: new Date().toISOString().slice(0, 10),
      obs: `Via Agente IA · ${p.contexto.slice(0, 80)}`,
    })
    setMsgs(prev => prev.map(m => m.id === msg.id ? { ...m, added: true } : m))
    addSystemMsg(`✅ Preço adicionado: ${p.produto} · R$ ${p.valor.toFixed(2)} via ${p.fornecedor}`)
  }

  const SUGESTOES = [
    'Pesquisar preço do frango',
    'Buscar preço da carne bovina',
    'Analisar fornecedores de hortifruti',
    'Tendência preço do café',
    'Melhores fornecedores de laticínios',
    'Resumo do mercado',
  ]

  const renderMsgContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      const boldLine = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      return <div key={i} style={{ lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: boldLine || '&nbsp;' }} />
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header do Agente */}
      <div style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)', borderRadius: 14, padding: '16px 20px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bot size={22} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Canal de Comando — Market Intelligence</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Pesquise fornecedores e preços no Google e alimente os indicadores automaticamente</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
              {apiKey ? <><CheckCircle2 size={13} /><span>Google ativo</span></> : <><XCircle size={13} /><span>Sem Google</span></>}
            </div>
            <button onClick={() => setShowSetup(p => !p)}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Key size={12} /> Configurar
            </button>
          </div>
        </div>
      </div>

      {/* Setup Panel */}
      {showSetup && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '2px solid #7c3aed40' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Key size={14} color="#7c3aed" /> Configurar Serper API (Google Search)
          </div>
          <ol style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13, color: 'var(--txt-sec)', lineHeight: 2 }}>
            <li>Acesse <a href="https://serper.dev" target="_blank" rel="noreferrer" style={{ color: '#7c3aed' }}>serper.dev <ExternalLink size={10} /></a> e crie uma conta gratuita</li>
            <li>Copie sua <strong>API Key</strong> do painel</li>
            <li>Cole abaixo e clique em Salvar</li>
          </ol>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              placeholder="Cole sua chave Serper aqui..."
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveKey()}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bordo-l)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 13 }}
            />
            <button onClick={saveKey} disabled={!keyInput.trim()}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Salvar
            </button>
            {apiKey && (
              <button onClick={removeKey}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #fca5a5', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>
                Remover
              </button>
            )}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--txt-sec)' }}>
            Plano gratuito: 2.500 buscas/mês · A chave é salva localmente neste navegador.
          </div>
        </div>
      )}

      {/* Chat window */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bordo-l)', overflow: 'hidden' }}>
        {/* Messages area */}
        <div style={{ minHeight: 380, maxHeight: 520, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {msgs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <Bot size={40} color="#7c3aed" style={{ opacity: 0.4, marginBottom: 10 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>Agente de Inteligência de Mercado</div>
              <div style={{ fontSize: 13, color: 'var(--txt-sec)', marginBottom: 20 }}>
                {apiKey
                  ? 'Pesquise fornecedores e preços no Google ou use comandos especiais.'
                  : 'Configure a API do Google acima para pesquisar em tempo real. Análise de dados internos sempre disponível.'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {SUGESTOES.map(s => (
                  <button key={s} onClick={() => { setInput(s); }}
                    style={{ padding: '6px 12px', borderRadius: 99, border: '1px solid #7c3aed50', background: '#7c3aed10', color: '#7c3aed', cursor: 'pointer', fontSize: 12 }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map(msg => (
            <div key={msg.id} style={{
              marginBottom: 12,
              display: 'flex',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              gap: 8,
              alignItems: 'flex-start',
            }}>
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: msg.role === 'user' ? 'var(--bordo)' : msg.role === 'error' ? '#ef4444' : msg.role === 'system' ? '#6b7280' : '#7c3aed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
              }}>
                {msg.role === 'user' ? <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>EU</span>
                  : msg.role === 'agent' ? <Bot size={13} color="#fff" />
                  : <Activity size={13} color="#fff" />}
              </div>

              {/* Bubble */}
              <div style={{
                maxWidth: '75%',
                background: msg.role === 'user' ? 'var(--bordo)' : msg.role === 'error' ? '#fef2f2' : msg.role === 'system' ? 'var(--bg)' : 'var(--bg)',
                color: msg.role === 'user' ? '#fff' : msg.role === 'error' ? '#991b1b' : 'var(--txt)',
                borderRadius: msg.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                padding: '10px 14px',
                fontSize: 13,
                border: msg.role === 'system' ? '1px solid var(--bordo-l)' : 'none',
              }}>
                <div>{renderMsgContent(msg.content)}</div>

                {/* Precos extraídos */}
                {msg.precos && msg.precos.length > 0 && !msg.added && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--bordo-l)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 6 }}>
                      💰 {msg.precos.length} preços encontrados — clique para adicionar ao histórico:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {msg.precos.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f3ff', borderRadius: 8, padding: '6px 10px' }}>
                          <span style={{ fontWeight: 800, color: '#22c55e', fontSize: 15 }}>R$ {p.valor.toFixed(2)}</span>
                          <span style={{ fontSize: 11, color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.contexto.slice(0, 60)}</span>
                          <span style={{ fontSize: 10, color: '#7c3aed' }}>{p.fonte}</span>
                          <button onClick={() => handleAddPreco(msg, p)}
                            style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}>
                            + Adicionar
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => { msg.precos!.forEach(p => handleAddPreco(msg, p)); }}
                        style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12, marginTop: 4 }}>
                        ✅ Adicionar todos ao histórico
                      </button>
                    </div>
                  </div>
                )}

                {msg.added && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#22c55e', fontWeight: 600 }}>✅ Adicionados ao histórico de preços!</div>
                )}

                {/* Links de resultados */}
                {msg.results && msg.results.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--bordo-l)', paddingTop: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--txt-sec)', marginBottom: 4 }}>🌐 Fontes:</div>
                    {msg.results.slice(0, 4).map((r, i) => (
                      <a key={i} href={r.link} target="_blank" rel="noreferrer"
                        style={{ display: 'block', fontSize: 11, color: '#7c3aed', textDecoration: 'none', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <ExternalLink size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />{r.title}
                      </a>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 10, color: msg.role === 'user' ? 'rgba(255,255,255,0.6)' : 'var(--txt-sec)', marginTop: 4 }}>
                  {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={13} color="#fff" />
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: '4px 14px 14px 14px', padding: '10px 14px', display: 'flex', gap: 4, alignItems: 'center' }}>
                <div className="dot-flash" style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', animation: 'pulse 1.2s ease-in-out infinite' }} />
                <div className="dot-flash" style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', animation: 'pulse 1.2s ease-in-out 0.3s infinite' }} />
                <div className="dot-flash" style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', animation: 'pulse 1.2s ease-in-out 0.6s infinite' }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--bordo-l)', background: 'var(--bg)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-sec)' }} />
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={apiKey ? 'Pesquisar preço, analisar fornecedor, tendência...' : 'Analisar dados internos... (configure Google para buscar em tempo real)'}
              style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10, border: '1px solid var(--bordo-l)', background: 'transparent', color: 'var(--txt)', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
          <button onClick={handleSend} disabled={loading || !input.trim()}
            style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: loading || !input.trim() ? 'var(--bordo-l)' : '#7c3aed', color: '#fff', cursor: loading || !input.trim() ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, fontSize: 13 }}>
            <Send size={13} />
            {loading ? 'Buscando...' : 'Enviar'}
          </button>
        </div>
      </div>

      {/* Comandos disponíveis */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '12px 16px', border: '1px solid var(--bordo-l)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>💬 Comandos disponíveis:</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 6, fontSize: 12, color: 'var(--txt-sec)' }}>
          {[
            ['pesquisar <produto>', 'Busca preços no Google e extrai valores automaticamente'],
            ['analisar fornecedor <nome>', 'Pesquisa avaliações e informações do fornecedor'],
            ['tendência <produto>', 'Analisa variação de preço e tendências de mercado'],
            ['melhores fornecedores <categoria>', 'Lista os melhores fornecedores por categoria'],
            ['resumo do mercado', 'Análise geral dos dados internos'],
            ['<texto livre>', 'Qualquer busca no Google'],
          ].map(([cmd, desc]) => (
            <div key={cmd} style={{ display: 'flex', gap: 6 }}>
              <code style={{ background: '#7c3aed15', color: '#7c3aed', padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap', fontSize: 11 }}>{cmd}</code>
              <span style={{ fontSize: 11 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── API Docs Tab ──────────────────────────────────────────────

function ApiDocsTab() {
  const [expanded, setExpanded] = useState<string | null>('auth')

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const endpoints = [
    {
      id: 'price', tag: 'GET', path: '/rest/v1/market_price_history',
      desc: 'Listar histórico de preços de mercado',
      params: 'order=data.desc&loja=eq.{loja}&produto=eq.{produto}&limit=500',
      response: `[{ "id": "uuid", "produto": "Frango", "preco": 12.50, "unidade": "kg", "fornecedor_nome": "ABC", "data": "2026-01-15", ... }]`,
    },
    {
      id: 'price_post', tag: 'POST', path: '/rest/v1/market_price_history',
      desc: 'Registrar novo preço de mercado',
      body: `{ "produto": "Frango", "categoria": "Proteínas", "fornecedor_nome": "ABC Carnes", "preco": 12.50, "unidade": "kg", "loja": "Amore CD", "fonte": "cotacao", "data": "2026-01-15" }`,
      response: `{ "id": "uuid-gerado", "produto": "Frango", ... }`,
    },
    {
      id: 'scores', tag: 'GET', path: '/rest/v1/fornecedor_scores',
      desc: 'Ranking completo de fornecedores com scores',
      params: 'order=score_total.desc',
      response: `[{ "fornecedor_nome": "ABC", "score_total": 8.2, "classificacao": "ouro", "score_competitividade": 9.0, ... }]`,
    },
    {
      id: 'scores_post', tag: 'POST', path: '/rest/v1/fornecedor_scores',
      desc: 'Criar ou atualizar score de fornecedor (upsert via fornecedor_nome)',
      headers: `Prefer: return=representation,resolution=merge-duplicates`,
      body: `{ "fornecedor_nome": "ABC Carnes", "score_operacional": 7.5, "score_financeiro": 8.0, "score_confiabilidade": 7.0, "score_entrega": 8.5, "score_competitividade": 9.0, "score_total": 8.2, "classificacao": "ouro" }`,
      response: `{ "id": "uuid", "fornecedor_nome": "ABC Carnes", "score_total": 8.2, ... }`,
    },
    {
      id: 'alerts', tag: 'GET', path: '/rest/v1/market_alerts',
      desc: 'Listar alertas de mercado (filtrar não lidos com lido=eq.false)',
      params: 'order=created_at.desc&lido=eq.false&limit=100',
      response: `[{ "tipo": "aumento", "produto": "Frango", "mensagem": "Preço subiu 12%", "variacao_pct": 12.5, ... }]`,
    },
    {
      id: 'tendencias', tag: 'GET', path: '/rest/v1/market_tendencias',
      desc: 'Tendências de preços por produto',
      params: 'order=updated_at.desc',
      response: `[{ "produto": "Frango", "tendencia": "alta", "variacao_7d": 8.2, "variacao_30d": 12.5, "melhor_fornecedor": "ABC", "melhor_preco": 11.80, ... }]`,
    },
  ]

  const tagColor = (tag: string) => tag === 'GET' ? '#22c55e' : tag === 'POST' ? '#3b82f6' : tag === 'DELETE' ? '#ef4444' : '#f59e0b'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, border: '1px solid var(--bordo-l)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Code2 size={18} color="var(--bordo)" />
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--txt)' }}>API REST — Market Analytics</span>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--txt-sec)', lineHeight: 1.5 }}>
          Todas as APIs utilizam a interface RESTful do Supabase PostgREST. Autenticação via JWT Bearer ou API Key.
          Suporte completo a filtros, ordenação, paginação e webhooks via Supabase Realtime.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          {[
            { label: 'Protocolo', val: 'HTTPS / REST' },
            { label: 'Formato', val: 'JSON (UTF-8)' },
            { label: 'Auth', val: 'Bearer JWT / apikey' },
            { label: 'Realtime', val: 'WebSocket (Supabase)' },
          ].map(i => (
            <div key={i.label} style={{ background: 'var(--bg)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bordo-l)' }}>
              <div style={{ fontSize: 10, color: 'var(--txt-sec)', marginBottom: 2 }}>{i.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{i.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Auth */}
      <ApiSection id="auth" label="🔐 Autenticação" expanded={expanded} setExpanded={setExpanded}>
        <p style={{ fontSize: 13, color: 'var(--txt-sec)', margin: '0 0 10px' }}>
          Todas as requisições requerem os headers abaixo. Use o <strong>anon key</strong> para acesso público
          ou um JWT de usuário autenticado para operações com permissão.
        </p>
        <CodeBlock code={`curl -X GET "${baseUrl}/rest/v1/market_price_history?order=data.desc&limit=10" \\
  -H "apikey: ${anonKey.slice(0, 20)}..." \\
  -H "Authorization: Bearer ${anonKey.slice(0, 20)}..." \\
  -H "Content-Type: application/json"`} />
      </ApiSection>

      {/* Endpoints */}
      {endpoints.map(ep => (
        <ApiSection key={ep.id} id={ep.id} label={<><span style={{ background: tagColor(ep.tag), color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 700, marginRight: 8 }}>{ep.tag}</span><code style={{ fontSize: 13 }}>{ep.path}</code></>} expanded={expanded} setExpanded={setExpanded}>
          <p style={{ fontSize: 13, color: 'var(--txt-sec)', margin: '0 0 10px' }}>{ep.desc}</p>
          {ep.params && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', marginBottom: 4 }}>Query Params:</div>
              <CodeBlock code={`${ep.path}?${ep.params}`} />
            </>
          )}
          {ep.headers && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', margin: '10px 0 4px' }}>Headers adicionais:</div>
              <CodeBlock code={ep.headers} />
            </>
          )}
          {ep.body && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', margin: '10px 0 4px' }}>Request Body:</div>
              <CodeBlock code={ep.body} />
            </>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', margin: '10px 0 4px' }}>Response:</div>
          <CodeBlock code={ep.response} />
        </ApiSection>
      ))}

      {/* Webhooks & Realtime */}
      <ApiSection id="realtime" label="⚡ Realtime & Webhooks" expanded={expanded} setExpanded={setExpanded}>
        <p style={{ fontSize: 13, color: 'var(--txt-sec)', margin: '0 0 10px' }}>
          Use <strong>Supabase Realtime</strong> para receber atualizações em tempo real de alertas e preços.
          Configure webhooks no painel Supabase em Database → Webhooks.
        </p>
        <CodeBlock code={`// JavaScript — Subscribe em tempo real
import { createClient } from '@supabase/supabase-js'
const supabase = createClient('${baseUrl}', '${anonKey.slice(0, 20)}...')

const channel = supabase
  .channel('market-alerts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'market_alerts',
    filter: 'lido=eq.false'
  }, payload => {
    console.log('Novo alerta:', payload.new)
  })
  .subscribe()`} />
      </ApiSection>

      {/* Tabelas disponíveis */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--bordo-l)' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)', marginBottom: 12 }}>📋 Todas as APIs Disponíveis</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bordo-l)' }}>
                {['Módulo', 'Tabela', 'GET', 'POST', 'PATCH', 'DELETE'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--txt-sec)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Produtos', 'produtos', '✅', '✅', '✅', '✅'],
                ['Estoque', 'estoque_produtos', '✅', '✅', '✅', '✅'],
                ['Movimentações', 'estoque_movimentacoes', '✅', '✅', '—', '—'],
                ['Compras', 'compras_lista', '✅', '✅', '✅', '✅'],
                ['Itens Compra', 'compras_lista_item', '✅', '✅', '✅', '✅'],
                ['Fornecedores', 'fornecedores', '✅', '✅', '✅', '✅'],
                ['Requisições', 'requisicoes', '✅', '✅', '✅', '✅'],
                ['Cotações', 'requisicao_cotacoes', '✅', '✅', '✅', '✅'],
                ['Histórico Preços', 'market_price_history', '✅', '✅', '—', '✅'],
                ['Scores Fornec.', 'fornecedor_scores', '✅', '✅ (upsert)', '—', '✅'],
                ['Alertas', 'market_alerts', '✅', '✅', '✅', '—'],
                ['Tendências', 'market_tendencias', '✅', '✅ (upsert)', '—', '✅'],
                ['Financeiro', 'fin_creditos', '✅', '✅', '✅', '—'],
                ['Ruptura', 'rupturas', '✅', '✅', '✅', '✅'],
                ['Marketing', 'mkt_campanhas', '✅', '✅', '✅', '✅'],
                ['Gamificação', 'gam_metas', '✅', '✅', '✅', '✅'],
              ].map(row => (
                <tr key={row[1]} style={{ borderBottom: '1px solid var(--bordo-l)20' }}>
                  {row.map((cell, i) => (
                    <td key={i} style={{ padding: '7px 10px', color: i === 0 ? 'var(--txt)' : i === 1 ? '#6b7280' : cell === '✅' ? '#22c55e' : 'var(--txt-sec)', fontFamily: i === 1 ? 'monospace' : 'inherit', fontSize: i === 1 ? 11 : 12, fontWeight: i === 0 ? 600 : 400 }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--txt-sec)' }}>
          <strong>Base URL:</strong> <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{baseUrl}/rest/v1/</code><br />
          <strong>Documentação Supabase PostgREST:</strong> <a href="https://supabase.com/docs/guides/api" target="_blank" rel="noreferrer" style={{ color: 'var(--bordo)' }}>supabase.com/docs/guides/api</a>
        </div>
      </div>
    </div>
  )
}

// ── Sub-componentes de API Docs ───────────────────────────────

function ApiSection({ id, label, expanded, setExpanded, children }: {
  id: string
  label: React.ReactNode
  expanded: string | null
  setExpanded: (v: string | null) => void
  children: React.ReactNode
}) {
  const open = expanded === id
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--bordo-l)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setExpanded(open ? null : id)}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)' }}>{label}</span>
        {open ? <ChevronUp size={16} color="var(--txt-sec)" /> : <ChevronDown size={16} color="var(--txt-sec)" />}
      </div>
      {open && <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--bordo-l)' }}>{children}</div>}
    </div>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: '10px 14px', borderRadius: 8, fontSize: 12, overflowX: 'auto', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      {code}
    </pre>
  )
}

import { useState, useEffect, useCallback } from 'react'
import {
  Bot, TrendingUp, TrendingDown, AlertTriangle, BarChart3,
  Users, History, FileText, CheckCircle, XCircle, Clock,
  RefreshCw, Search, ChevronDown, ChevronUp, Download,
  ShieldAlert, Shield, ShieldCheck, Zap, Package,
  DollarSign, Eye, MessageSquare, Globe, ExternalLink,
  Settings2, Trash2, Star, Send, Sparkles, Key,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchComprasHistoricoPreco,
  fetchComprasAuditoria,
  fetchComprasJustificativas,
  updateComprasAuditoria,
  insertComprasJustificativa,
  updateComprasJustificativa,
  fetchComprasListas,
  fetchComprasListaItens,
  registrarEAnalisarCompra,
  fetchComprasPesquisaMercado,
  insertComprasPesquisaMercado,
  deleteComprasPesquisaMercado,
} from '../../lib/db'
import type {
  ComprasHistoricoPreco,
  ComprasAuditoria,
  ComprasJustificativa,
  MotivoJustificativa,
  NivelAlertaCompra,
  ComprasPesquisaMercado,
} from '../../types/database'

// ── Google Custom Search helpers ──────────────────────────────

interface GResult { title: string; link: string; snippet: string }

function extrairPreco(texto: string): number | null {
  // Patterns: R$ 12,50 / R$ 12.50 / R$12,50 / 12,50 reais
  const patterns = [
    /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/,
    /R\$\s*(\d{1,6}(?:,\d{1,2})?)/,
    /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:reais?|BRL)/i,
  ]
  for (const p of patterns) {
    const m = texto.match(p)
    if (m) {
      const raw = m[1].replace(/\./g, '').replace(',', '.')
      const v = parseFloat(raw)
      if (!isNaN(v) && v > 0 && v < 100000) return v
    }
  }
  return null
}

function extrairFornecedor(titulo: string, url: string): string {
  try {
    const host = new URL(url).hostname.replace('www.', '').split('.')[0]
    // capitaliza primeira letra
    return host.charAt(0).toUpperCase() + host.slice(1)
  } catch {
    return titulo.split(' ')[0] ?? '—'
  }
}

async function buscarNoGoogle(produto: string, apiKey: string, cseId: string): Promise<GResult[]> {
  const q = `preço ${produto} atacado distribuidora comprar fornecedor`
  const url =
    `https://www.googleapis.com/customsearch/v1` +
    `?key=${encodeURIComponent(apiKey)}` +
    `&cx=${encodeURIComponent(cseId)}` +
    `&q=${encodeURIComponent(q)}` +
    `&num=6&gl=br&lr=lang_pt`
  const resp = await fetch(url)
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error?.message || `Erro HTTP ${resp.status}`)
  return (data.items || []).map((i: { title: string; link: string; snippet: string }) => ({
    title:   i.title,
    link:    i.link,
    snippet: i.snippet,
  }))
}

// ── Helpers ──────────────────────────────────────────────────

const fmtR$ = (v: number | null | undefined) =>
  v == null ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`

const fmtPct = (v: number | null | undefined) =>
  v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`

const fmtData = (d: string) =>
  new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR')

// ── Nível de Alerta config ────────────────────────────────────

const NIVEL_CFG: Record<NivelAlertaCompra, { label: string; color: string; bg: string; icon: React.ReactNode; emoji: string }> = {
  normal: { label: 'Normal',  color: 'var(--success)', bg: '#D1FAE5', icon: <ShieldCheck size={12} />, emoji: '✅' },
  baixo:  { label: 'Baixo',   color: '#92400E',        bg: '#FEF3C7', icon: <Shield size={12} />,      emoji: '🟡' },
  medio:  { label: 'Médio',   color: '#B45309',        bg: '#FFEDD5', icon: <ShieldAlert size={12} />, emoji: '🟠' },
  alto:   { label: 'Alto',    color: 'var(--danger)',  bg: '#FEE2E2', icon: <AlertTriangle size={12} />, emoji: '🔴' },
}

const MOTIVO_LABEL: Record<MotivoJustificativa, string> = {
  reajuste_mercado:   'Reajuste de mercado',
  falta_fornecedor:   'Falta do fornecedor anterior',
  sem_opcao_barata:   'Sem opção mais barata disponível',
  cotacao_realizada:  'Cotação realizada — melhor preço',
  urgencia_operacional: 'Urgência operacional',
  qualidade_superior: 'Produto de qualidade superior',
  outro:              'Outro motivo',
}

const STATUS_JUST_CFG = {
  pendente:  { label: 'Pendente',  color: '#B45309', bg: '#FEF3C7', icon: <Clock size={11} /> },
  aprovado:  { label: 'Aprovado',  color: 'var(--success)', bg: '#D1FAE5', icon: <CheckCircle size={11} /> },
  reprovado: { label: 'Reprovado', color: 'var(--danger)',  bg: '#FEE2E2', icon: <XCircle size={11} /> },
}

// ── Sub-components ────────────────────────────────────────────

function Skeleton({ h = 18, w = '100%' }: { h?: number; w?: string }) {
  return <div style={{ height: h, width: w, borderRadius: 6, background: 'var(--border)', opacity: 0.5, animation: 'pulse 1.5s ease-in-out infinite' }} />
}

function KpiCard({ label, value, sub, color, icon, loading }: {
  label: string; value: string | number; sub: string; color: string; icon: React.ReactNode; loading?: boolean
}) {
  return (
    <div className="kpi" style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="kpi-ac" style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="kpi-lbl">{label}</div>
        <span style={{ color, opacity: 0.7 }}>{icon}</span>
      </div>
      {loading ? <Skeleton h={28} w="60%" /> : <div className="kpi-val">{value}</div>}
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

// Alert level badge
function AlertBadge({ nivel }: { nivel: NivelAlertaCompra }) {
  const c = NIVEL_CFG[nivel]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: c.bg, color: c.color,
    }}>
      {c.icon}{c.label}
    </span>
  )
}

// Progress bar
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100)
  return (
    <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', flex: 1, minWidth: 60 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .4s' }} />
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────

type Tab = 'painel' | 'compradores' | 'historico' | 'justificativas' | 'previsoes' | 'pesquisa' | 'ia'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'painel',          label: 'Painel',              icon: <BarChart3 size={12} /> },
  { id: 'compradores',     label: 'Compradores',          icon: <Users size={12} /> },
  { id: 'historico',       label: 'Histórico',            icon: <History size={12} /> },
  { id: 'justificativas',  label: 'Justificativas',       icon: <MessageSquare size={12} /> },
  { id: 'previsoes',       label: 'Previsões',            icon: <Zap size={12} /> },
  { id: 'pesquisa',        label: 'Pesquisa de Mercado',  icon: <Globe size={12} /> },
  { id: 'ia',              label: 'IA Analítica',          icon: <Sparkles size={12} /> },
]

// ── Main Component ────────────────────────────────────────────

export default function ComprasAgentePage() {
  const { user } = useAuth()
  const { loja } = useLoja()

  const [tab, setTab] = useState<Tab>('painel')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const [historico, setHistorico] = useState<ComprasHistoricoPreco[]>([])
  const [auditorias, setAuditorias] = useState<ComprasAuditoria[]>([])
  const [justificativas, setJustificativas] = useState<ComprasJustificativa[]>([])

  // filters
  const [filtroNivel, setFiltroNivel] = useState<NivelAlertaCompra | 'todos'>('todos')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ok' | 'pendente_justificativa' | 'justificado' | 'aprovado' | 'escalado'>('todos')
  const [busca, setBusca] = useState('')

  // justificativa modal
  const [justModal, setJustModal] = useState<{ auditoria: ComprasAuditoria } | null>(null)
  const [justForm, setJustForm] = useState<{
    motivo: MotivoJustificativa; descricao: string; houve_cotacao: boolean
  }>({ motivo: 'reajuste_mercado', descricao: '', houve_cotacao: false })
  const [savingJust, setSavingJust] = useState(false)

  // approval modal
  const [approveModal, setApproveModal] = useState<{ just: ComprasJustificativa; auditoria: ComprasAuditoria } | null>(null)
  const [approveObs, setApproveObs] = useState('')

  // detail expand
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null)

  // ── IA Analítica (Gemini) ────────────────────────────────────
  interface ChatMsg { role: 'user' | 'ai'; text: string; ts: Date }
  const [geminiKey,    setGeminiKey]    = useState(() => localStorage.getItem('gemini_api_key') || '')
  const [showKeyCfg,   setShowKeyCfg]   = useState(false)
  const [chatMsgs,     setChatMsgs]     = useState<ChatMsg[]>([])
  const [chatInput,    setChatInput]    = useState('')
  const [chatLoading,  setChatLoading]  = useState(false)

  const salvarGeminiKey = () => {
    localStorage.setItem('gemini_api_key', geminiKey.trim())
    setShowKeyCfg(false)
  }

  const enviarMensagem = async (texto?: string) => {
    const pergunta = (texto || chatInput).trim()
    if (!pergunta || chatLoading) return
    if (!geminiKey) { setShowKeyCfg(true); return }

    setChatInput('')
    const novaMsgUser: ChatMsg = { role: 'user', text: pergunta, ts: new Date() }
    setChatMsgs(prev => [...prev, novaMsgUser])
    setChatLoading(true)

    // Monta contexto com dados reais do agente
    const ctx = [
      `Você é um analista expert em compras de restaurantes.`,
      `Responda em português, de forma direta e prática.`,
      ``,
      `=== DADOS ATUAIS DO SISTEMA ===`,
      `Loja: ${loja}`,
      `Total compras auditadas: ${auditorias.length}`,
      `Alertas altos: ${alertasAlto.length}`,
      `Alertas médios: ${alertasMedio.length}`,
      `Pendentes de justificativa: ${pendJust.length}`,
      `Economia potencial: R$ ${economiaPotencial.toFixed(2)}`,
      `Produtos rastreados: ${Object.keys(produtoMap).length}`,
      `Compradores monitorados: ${buyerRanking.length}`,
      auditorias.length > 0
        ? `\nTop 5 produtos com maior variação:\n${auditorias.sort((a,b)=>(b.variacao_pct||0)-(a.variacao_pct||0)).slice(0,5).map(a=>`- ${a.produto_nome}: ${a.variacao_pct?.toFixed(1)}% (${fmtR$(a.preco_anterior)}→${fmtR$(a.preco_atual)})`).join('\n')}`
        : '',
      buyerRanking.length > 0
        ? `\nRanking compradores (variação média):\n${buyerRanking.slice(0,5).map((b,i)=>`${i+1}. ${b.nome}: ${b.varMedia.toFixed(1)}% · ${b.total} compras`).join('\n')}`
        : '',
      predicoes.length > 0
        ? `\nPrevisões de alta:\n${predicoes.filter(p=>p.tendencia==='alta').slice(0,5).map(p=>`- ${p.nome}: atual ${fmtR$(p.preco_atual)} → previsão ${fmtR$(p.previsao30d)}`).join('\n')}`
        : '',
    ].join('\n')

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: ctx }] },
            contents: [
              ...chatMsgs.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
              { role: 'user', parts: [{ text: pergunta }] }
            ]
          })
        }
      )
      const data = await resp.json()
      const aiText = resp.ok
        ? (data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta.')
        : `❌ ${data.error?.message?.slice(0, 200)}`
      setChatMsgs(prev => [...prev, { role: 'ai', text: aiText, ts: new Date() }])
    } catch (e) {
      setChatMsgs(prev => [...prev, { role: 'ai', text: '❌ Erro de conexão com Gemini.', ts: new Date() }])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Pesquisa de Mercado ──────────────────────────────────────
  const [pesqApiKey,    setPesqApiKey]    = useState(() => localStorage.getItem('goog_api_key') || '')
  const [pesqCseId,     setPesqCseId]     = useState(() => localStorage.getItem('goog_cse_id')  || '')
  const [showApiCfg,    setShowApiCfg]    = useState(false)
  const [pesqResultados, setPesqResultados] = useState<Record<string, GResult[]>>({})
  const [pesqLoadings,  setPesqLoadings]  = useState<Record<string, boolean>>({})
  const [pesqErros,     setPesqErros]     = useState<Record<string, string>>({})
  const [pesqSalvos,    setPesqSalvos]    = useState<ComprasPesquisaMercado[]>([])
  const [pesqBusca,     setPesqBusca]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const lojaParam = loja === 'Todas as Lojas' ? undefined : loja
    const timer = setTimeout(() => setLoading(false), 8000)
    try {
      const [h, a, j, ps] = await Promise.all([
        fetchComprasHistoricoPreco(lojaParam).catch(() => [] as ComprasHistoricoPreco[]),
        fetchComprasAuditoria(lojaParam).catch(() => [] as ComprasAuditoria[]),
        fetchComprasJustificativas().catch(() => [] as ComprasJustificativa[]),
        fetchComprasPesquisaMercado(lojaParam).catch(() => [] as ComprasPesquisaMercado[]),
      ])
      clearTimeout(timer)
      setHistorico(h)
      setAuditorias(a)
      setJustificativas(j)
      setPesqSalvos(ps)
    } catch { /* silent */ } finally {
      clearTimeout(timer)
      setLoading(false)
    }
  }, [loja])

  // ── Handlers: Pesquisa de Mercado ─────────────────────────────

  const salvarApiConfig = () => {
    localStorage.setItem('goog_api_key', pesqApiKey.trim())
    localStorage.setItem('goog_cse_id',  pesqCseId.trim())
    setShowApiCfg(false)
  }

  const pesquisarProduto = async (produtoNome: string) => {
    if (!pesqApiKey || !pesqCseId) { setShowApiCfg(true); return }
    setPesqLoadings(p => ({ ...p, [produtoNome]: true }))
    setPesqErros(p => ({ ...p, [produtoNome]: '' }))
    try {
      const resultados = await buscarNoGoogle(produtoNome, pesqApiKey, pesqCseId)
      setPesqResultados(p => ({ ...p, [produtoNome]: resultados }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      setPesqErros(p => ({ ...p, [produtoNome]: msg }))
    } finally {
      setPesqLoadings(p => ({ ...p, [produtoNome]: false }))
    }
  }

  const pesquisarTodos = async () => {
    if (!pesqApiKey || !pesqCseId) { setShowApiCfg(true); return }
    const produtos = produtosHistorico.slice(0, 10) // limite seguro na API free
    for (const p of produtos) {
      await pesquisarProduto(p.nome)
    }
  }

  const salvarReferencia = async (produto: string, r: GResult) => {
    const lojaParam = loja === 'Todas as Lojas' ? 'Geral' : loja
    const preco = extrairPreco(r.title + ' ' + r.snippet)
    const fornecedor = extrairFornecedor(r.title, r.link)
    try {
      const salvo = await insertComprasPesquisaMercado({
        produto_nome:          produto,
        query_usada:           `preço ${produto} atacado distribuidora`,
        titulo_resultado:      r.title,
        url_resultado:         r.link,
        snippet:               r.snippet,
        preco_extraido:        preco,
        fornecedor_encontrado: fornecedor,
        data_pesquisa:         new Date().toISOString().slice(0, 10),
        loja:                  lojaParam,
      })
      setPesqSalvos(prev => [salvo, ...prev])
    } catch (e) { console.error(e) }
  }

  const excluirReferencia = async (id: string) => {
    try {
      await deleteComprasPesquisaMercado(id)
      setPesqSalvos(prev => prev.filter(p => p.id !== id))
    } catch (e) { console.error(e) }
  }

  useEffect(() => { load() }, [load])

  // ── Sync: process all existing compras_lista_item ─────────────

  const sincronizar = async () => {
    setSyncing(true)
    setSyncMsg('Buscando listas de compras...')
    try {
      const lojaParam = loja === 'Todas as Lojas' ? undefined : loja
      const listas = await fetchComprasListas(lojaParam)
      const concluidasOuAndamento = listas.filter(l => l.status === 'concluido' || l.status === 'em_andamento')
      let processados = 0
      let alertasGerados = 0

      for (const lista of concluidasOuAndamento) {
        setSyncMsg(`Processando: ${lista.titulo}…`)
        const itens = await fetchComprasListaItens(lista.id)
        const comprados = itens.filter(i => i.status === 'comprado' && i.preco_real != null && i.preco_real > 0)

        for (const item of comprados) {
          // Skip if already in historico (by item_id)
          const jaExiste = historico.some(h => h.item_id === item.id)
          if (jaExiste) continue

          const res = await registrarEAnalisarCompra({
            produto_nome:    item.produto_nome,
            categoria:       item.categoria,
            fornecedor_nome: item.fornecedor_nome,
            comprador_nome:  null,
            quantidade:      item.quantidade,
            unidade:         item.unidade,
            preco_atual:     item.preco_real!,
            loja:            lista.loja,
            data_compra:     lista.data_compra ?? lista.created_at.slice(0, 10),
            lista_id:        lista.id,
            item_id:         item.id,
          }).catch(() => null)

          processados++
          if (res?.auditoria) alertasGerados++
        }
      }

      setSyncMsg(`✅ Sincronizado! ${processados} itens processados · ${alertasGerados} alertas gerados`)
      await load()
    } catch (e) {
      setSyncMsg('❌ Erro ao sincronizar — verifique o console')
      console.error(e)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 6000)
    }
  }

  // ── Derived analytics ────────────────────────────────────────

  const alertasAlto  = auditorias.filter(a => a.nivel_alerta === 'alto')
  const alertasMedio = auditorias.filter(a => a.nivel_alerta === 'medio')
  const pendJust     = auditorias.filter(a => a.status === 'pendente_justificativa')
  const economiaPotencial = auditorias.reduce((s, a) => {
    if (!a.preco_anterior || !a.quantidade) return s
    const economiaUnit = a.preco_anterior - a.preco_atual
    return economiaUnit < 0 ? s + Math.abs(economiaUnit) * a.quantidade : s
  }, 0)

  // Buyer performance from auditorias
  const buyerMap: Record<string, { nome: string; total: number; alertas: number; economia: number; somaVar: number }> = {}
  for (const a of auditorias) {
    const nome = a.comprador_nome || 'Desconhecido'
    if (!buyerMap[nome]) buyerMap[nome] = { nome, total: 0, alertas: 0, economia: 0, somaVar: 0 }
    buyerMap[nome].total++
    if (a.nivel_alerta !== 'normal') buyerMap[nome].alertas++
    if (a.variacao_pct != null) buyerMap[nome].somaVar += a.variacao_pct
    if (a.preco_anterior && a.quantidade && a.preco_atual < a.preco_anterior) {
      buyerMap[nome].economia += (a.preco_anterior - a.preco_atual) * a.quantidade
    }
  }
  const buyerRanking = Object.values(buyerMap)
    .map(b => ({ ...b, varMedia: b.total > 0 ? b.somaVar / b.total : 0 }))
    .sort((a, b) => a.varMedia - b.varMedia)

  // Price history by product
  const produtoMap: Record<string, ComprasHistoricoPreco[]> = {}
  for (const h of historico) {
    if (!produtoMap[h.produto_nome]) produtoMap[h.produto_nome] = []
    produtoMap[h.produto_nome].push(h)
  }
  const produtosHistorico = Object.entries(produtoMap)
    .map(([nome, items]) => {
      const sorted = [...items].sort((a, b) => a.data_compra.localeCompare(b.data_compra))
      const precos = sorted.map(i => i.preco_unitario)
      const ultimo = precos[precos.length - 1]
      const primeiro = precos[0]
      const variacao = primeiro > 0 ? ((ultimo - primeiro) / primeiro) * 100 : 0
      return {
        nome,
        items: sorted,
        preco_atual: ultimo,
        preco_inicial: primeiro,
        preco_medio: precos.reduce((s, p) => s + p, 0) / precos.length,
        preco_min: Math.min(...precos),
        preco_max: Math.max(...precos),
        variacao_total: variacao,
        ocorrencias: items.length,
      }
    })
    .sort((a, b) => Math.abs(b.variacao_total) - Math.abs(a.variacao_total))

  // Predictions: linear extrapolation over last 5 purchases per product
  const predicoes = produtosHistorico
    .filter(p => p.items.length >= 3)
    .map(p => {
      const last5 = p.items.slice(-5)
      const n = last5.length
      const meanX = (n - 1) / 2
      const meanY = last5.reduce((s, i) => s + i.preco_unitario, 0) / n
      let num = 0, den = 0
      last5.forEach((item, idx) => {
        num += (idx - meanX) * (item.preco_unitario - meanY)
        den += (idx - meanX) ** 2
      })
      const slope = den !== 0 ? num / den : 0
      const previsao30d = p.preco_atual + slope * 4  // ~4 compras/mês
      const tendencia = slope > 0.01 ? 'alta' : slope < -0.01 ? 'baixa' : 'estável'
      return { ...p, slope, previsao30d, tendencia }
    })
    .sort((a, b) => Math.abs(b.slope) - Math.abs(a.slope))
    .slice(0, 20)

  // Filtered auditorias
  const auditsFiltradas = auditorias.filter(a => {
    if (filtroNivel !== 'todos' && a.nivel_alerta !== filtroNivel) return false
    if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false
    if (busca && !a.produto_nome.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  })

  // ── Export CSV ───────────────────────────────────────────────

  const exportarCSV = () => {
    const toS = (v: string | number | null | undefined) =>
      v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v).replace(/"/g, '""')}"`
    const header = 'Produto;Fornecedor;Comprador;Preço Atual;Preço Anterior;Variação%;Nível;Status;Data'
    const rows = auditorias.map(a => [
      toS(a.produto_nome), toS(a.fornecedor_nome), toS(a.comprador_nome),
      toS(a.preco_atual), toS(a.preco_anterior), toS(a.variacao_pct),
      a.nivel_alerta, a.status, a.data_compra,
    ].join(';'))
    const csv = '﻿' + [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href = url; a.download = `auditoria-compras-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // ── WhatsApp Report ──────────────────────────────────────────

  const enviarWhatsApp = () => {
    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    const linhas = [
      `🤖 *AGENTE ANALÍTICO DE COMPRAS*`,
      `📅 ${hoje} · ${loja}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🚨 *ALERTAS*`,
      `• Nível Alto: *${alertasAlto.length}*`,
      `• Nível Médio: *${alertasMedio.length}*`,
      `• Pendentes de justificativa: *${pendJust.length}*`,
      `• Total auditado: *${auditorias.length}*`,
      ``,
      `💰 *ECONOMIA POTENCIAL*`,
      `• ${fmtR$(economiaPotencial)}`,
      ``,
      `📦 *TOP ALERTAS ALTOS*`,
      ...alertasAlto.slice(0, 3).map(a =>
        `  ↳ ${a.produto_nome}: ${fmtPct(a.variacao_pct)} (${fmtR$(a.preco_anterior)} → ${fmtR$(a.preco_atual)})`
      ),
      ``,
      `🏆 *MELHOR COMPRADOR*`,
      buyerRanking[0] ? `  ↳ ${buyerRanking[0].nome} · média ${fmtPct(buyerRanking[0].varMedia)}` : '  ↳ Sem dados',
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `_Gerado pelo Amore Gestão V6.0_`,
    ].join('\n')
    window.open('https://wa.me/?text=' + encodeURIComponent(linhas), '_blank')
  }

  // ── Justificativa submit ──────────────────────────────────────

  const submitJustificativa = async () => {
    if (!justModal || !justForm.descricao.trim()) return
    setSavingJust(true)
    try {
      const j = await insertComprasJustificativa({
        auditoria_id:     justModal.auditoria.id,
        motivo:           justForm.motivo,
        descricao:        justForm.descricao,
        houve_cotacao:    justForm.houve_cotacao,
        comprador_nome:   user?.name ?? null,
        aprovador_nome:   null,
        status_aprovacao: 'pendente',
        obs_aprovacao:    null,
      })
      await updateComprasAuditoria(justModal.auditoria.id, { status: 'justificado' })
      setJustificativas(prev => [j, ...prev])
      setAuditorias(prev => prev.map(a => a.id === justModal.auditoria.id ? { ...a, status: 'justificado' } : a))
      setJustModal(null)
      setJustForm({ motivo: 'reajuste_mercado', descricao: '', houve_cotacao: false })
    } catch (e) { console.error(e) }
    setSavingJust(false)
  }

  // ── Approval ──────────────────────────────────────────────────

  const handleAprovar = async (status: 'aprovado' | 'reprovado') => {
    if (!approveModal) return
    try {
      await updateComprasJustificativa(approveModal.just.id, {
        status_aprovacao: status,
        aprovador_nome:   user?.name ?? undefined,
        obs_aprovacao:    approveObs || undefined,
      })
      await updateComprasAuditoria(approveModal.auditoria.id, {
        status: status === 'aprovado' ? 'aprovado' : 'escalado',
      })
      setJustificativas(prev => prev.map(j => j.id === approveModal.just.id
        ? { ...j, status_aprovacao: status, aprovador_nome: user?.name ?? null, obs_aprovacao: approveObs }
        : j
      ))
      setAuditorias(prev => prev.map(a => a.id === approveModal.auditoria.id
        ? { ...a, status: status === 'aprovado' ? 'aprovado' : 'escalado' }
        : a
      ))
      setApproveModal(null)
      setApproveObs('')
    } catch (e) { console.error(e) }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 16,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px' }}>Agente Analítico de Compras</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 1 }}>Auditoria automática · Rastreamento de preços · Performance de compradores</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {syncMsg && (
            <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 12px' }}>
              {syncMsg}
            </span>
          )}
          <button
            className="btn"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', fontSize: 12 }}
            onClick={exportarCSV}
            title="Exportar auditoria em CSV"
          >
            <Download size={12} /> CSV
          </button>
          <button
            className="btn"
            style={{ background: 'rgba(37,211,102,0.25)', color: '#fff', border: '1px solid rgba(37,211,102,0.4)', fontSize: 12 }}
            onClick={enviarWhatsApp}
            title="Enviar relatório via WhatsApp"
          >
            <MessageSquare size={12} /> WhatsApp
          </button>
          <button
            className="btn"
            style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: 12 }}
            onClick={sincronizar}
            disabled={syncing}
          >
            <RefreshCw size={12} className={syncing ? 'spin' : ''} />
            {syncing ? 'Sincronizando…' : 'Sincronizar Compras'}
          </button>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <KpiCard label="Alertas Altos" value={loading ? '…' : alertasAlto.length}
          sub={`${alertasMedio.length} alertas médios`}
          color={alertasAlto.length > 0 ? 'var(--danger)' : 'var(--success)'}
          icon={<AlertTriangle size={16} />} loading={loading} />
        <KpiCard label="Pendentes de Justificativa" value={loading ? '…' : pendJust.length}
          sub="Aguardando resposta do comprador"
          color={pendJust.length > 0 ? '#B45309' : 'var(--success)'}
          icon={<MessageSquare size={16} />} loading={loading} />
        <KpiCard label="Total Auditado" value={loading ? '…' : auditorias.length}
          sub={`${historico.length} preços registrados`}
          color="var(--blue)" icon={<Shield size={16} />} loading={loading} />
        <KpiCard label="Economia Potencial" value={loading ? '…' : fmtR$(economiaPotencial)}
          sub="Retorno a preços anteriores"
          color="var(--success)" icon={<DollarSign size={16} />} loading={loading} />
        <KpiCard label="Compradores Monitorados" value={loading ? '…' : Object.keys(buyerMap).length}
          sub={`${buyerRanking.filter(b => b.alertas === 0).length} sem alertas`}
          color="var(--teal)" icon={<Users size={16} />} loading={loading} />
        <KpiCard label="Produtos Rastreados" value={loading ? '…' : Object.keys(produtoMap).length}
          sub={`${predicoes.filter(p => p.tendencia === 'alta').length} com tendência de alta`}
          color="var(--warning)" icon={<Package size={16} />} loading={loading} />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid var(--bordo)' : '2px solid transparent',
              color: tab === t.id ? 'var(--bordo)' : 'var(--muted)',
              marginBottom: -2,
            }}
          >
            {t.icon}{t.label}
            {t.id === 'justificativas' && pendJust.length > 0 && (
              <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 20, fontSize: 9, fontWeight: 800, padding: '1px 5px' }}>
                {pendJust.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB: PAINEL                                              */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === 'painel' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input className="inp" style={{ paddingLeft: 28, fontSize: 12 }}
                placeholder="Buscar produto…" value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <select className="sel" style={{ fontSize: 12, minWidth: 130 }} value={filtroNivel}
              onChange={e => setFiltroNivel(e.target.value as typeof filtroNivel)}>
              <option value="todos">Todos os níveis</option>
              <option value="alto">🔴 Alto</option>
              <option value="medio">🟠 Médio</option>
              <option value="baixo">🟡 Baixo</option>
            </select>
            <select className="sel" style={{ fontSize: 12, minWidth: 160 }} value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)}>
              <option value="todos">Todos os status</option>
              <option value="pendente_justificativa">⏳ Pendente justificativa</option>
              <option value="justificado">📋 Justificado</option>
              <option value="aprovado">✅ Aprovado</option>
              <option value="escalado">⚠️ Escalado</option>
            </select>
            <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {auditsFiltradas.length} de {auditorias.length} registros
            </span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3, 4].map(i => <Skeleton key={i} h={60} />)}
            </div>
          ) : auditsFiltradas.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 0' }}>
              <Bot size={36} style={{ color: 'var(--muted)', marginBottom: 10, opacity: 0.4 }} />
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>Nenhum registro de auditoria encontrado</div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                Clique em "Sincronizar Compras" para processar o histórico existente
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    {['Produto', 'Fornecedor', 'Preço Atual', 'Preço Ant.', 'Variação', 'Nível', 'Status', 'Data', 'Ação'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditsFiltradas.map(a => {
                    const just = justificativas.find(j => j.auditoria_id === a.id)
                    return (
                      <>
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => setExpandedAudit(expandedAudit === a.id ? null : a.id)}>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {expandedAudit === a.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              {a.produto_nome}
                            </div>
                            {a.comprador_nome && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.comprador_nome}</div>}
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{a.fornecedor_nome || '—'}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--bordo)' }}>{fmtR$(a.preco_atual)}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{fmtR$(a.preco_anterior)}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: (a.variacao_pct ?? 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {fmtPct(a.variacao_pct)}
                          </td>
                          <td style={{ padding: '8px 10px' }}><AlertBadge nivel={a.nivel_alerta} /></td>
                          <td style={{ padding: '8px 10px', fontSize: 11 }}>
                            {a.status === 'ok' && <span style={{ color: 'var(--success)' }}>✅ OK</span>}
                            {a.status === 'pendente_justificativa' && <span style={{ color: '#B45309' }}>⏳ Pendente</span>}
                            {a.status === 'justificado' && <span style={{ color: 'var(--blue)' }}>📋 Justificado</span>}
                            {a.status === 'aprovado' && <span style={{ color: 'var(--success)' }}>✅ Aprovado</span>}
                            {a.status === 'escalado' && <span style={{ color: 'var(--danger)' }}>🔴 Escalado</span>}
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--muted)' }}>{fmtData(a.data_compra)}</td>
                          <td style={{ padding: '8px 10px' }}>
                            {a.status === 'pendente_justificativa' && (
                              <button className="btn bo bsm"
                                onClick={e => { e.stopPropagation(); setJustModal({ auditoria: a }) }}
                                style={{ fontSize: 10, padding: '3px 8px' }}>
                                Justificar
                              </button>
                            )}
                            {just && a.status === 'justificado' && (
                              <button className="btn bo bsm"
                                onClick={e => { e.stopPropagation(); setApproveModal({ just, auditoria: a }) }}
                                style={{ fontSize: 10, padding: '3px 8px', color: 'var(--success)' }}>
                                Aprovar
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedAudit === a.id && (
                          <tr key={`${a.id}-detail`} style={{ background: 'var(--bordo-bg)' }}>
                            <td colSpan={9} style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                                {[
                                  { lbl: 'Preço médio 90d', val: fmtR$(a.preco_medio) },
                                  { lbl: 'Mínimo histórico', val: fmtR$(a.preco_menor) },
                                  { lbl: 'Máximo histórico', val: fmtR$(a.preco_maior) },
                                  { lbl: 'Qtd comprada', val: a.quantidade ? `${a.quantidade} ${a.unidade ?? ''}` : '—' },
                                  { lbl: 'Impacto total', val: a.quantidade && a.preco_anterior ? fmtR$((a.preco_atual - a.preco_anterior) * a.quantidade) : '—' },
                                  { lbl: 'Comprador', val: a.comprador_nome || '—' },
                                ].map(m => (
                                  <div key={m.lbl} style={{ background: 'var(--surface)', borderRadius: 8, padding: '6px 10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.lbl}</div>
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>{m.val}</div>
                                  </div>
                                ))}
                              </div>
                              {just && (
                                <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, fontSize: 11 }}>
                                  <strong>Justificativa:</strong> {MOTIVO_LABEL[just.motivo]} — {just.descricao}
                                  {just.houve_cotacao && <span style={{ marginLeft: 8, color: 'var(--success)', fontWeight: 700 }}> · Cotação realizada ✓</span>}
                                  <span style={{ marginLeft: 8, color: STATUS_JUST_CFG[just.status_aprovacao].color }}>
                                    [{just.status_aprovacao}]
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB: COMPRADORES                                         */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === 'compradores' && (
        <div>
          <div className="g2" style={{ marginBottom: 14 }}>
            {/* Ranking card */}
            <div className="card">
              <div className="card-hd">
                <span className="card-tt">🏆 Ranking de Compradores</span>
                <span className="badge">{buyerRanking.length} compradores</span>
              </div>
              <div className="card-bd" style={{ padding: 0 }}>
                {buyerRanking.length === 0 ? (
                  <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                    Nenhum dado disponível — sincronize as compras primeiro
                  </div>
                ) : buyerRanking.map((b, idx) => {
                  const isGood = b.varMedia <= 2
                  const color = isGood ? 'var(--success)' : b.varMedia <= 8 ? '#B45309' : 'var(--danger)'
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
                  return (
                    <div key={b.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 14, minWidth: 28, textAlign: 'center' }}>{medal}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{b.nome}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {b.total} compras auditadas · {b.alertas} alertas · economia: {fmtR$(b.economia)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <MiniBar value={Math.abs(b.varMedia)} max={20} color={color} />
                          <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 60 }}>
                            {fmtPct(b.varMedia)} avg
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 16, color }}>
                          {isGood ? '😊' : b.varMedia <= 8 ? '😐' : '😟'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {isGood ? 'Excelente' : b.varMedia <= 8 ? 'Regular' : 'Atenção'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Details cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Top alertas por produto */}
              <div className="card">
                <div className="card-hd">
                  <span className="card-tt">📦 Produtos com Mais Alertas</span>
                </div>
                <div className="card-bd">
                  {(() => {
                    const prodAlerta: Record<string, number> = {}
                    for (const a of auditorias) {
                      if (a.nivel_alerta !== 'normal') prodAlerta[a.produto_nome] = (prodAlerta[a.produto_nome] ?? 0) + 1
                    }
                    const entries = Object.entries(prodAlerta).sort((a, b) => b[1] - a[1]).slice(0, 6)
                    const max = entries[0]?.[1] ?? 1
                    return entries.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: '16px 0' }}>Nenhum alerta ainda</div>
                    ) : (
                      <div className="bc">
                        {entries.map(([nome, cnt]) => (
                          <div key={nome} className="bc-row">
                            <span className="bc-lbl" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
                            <div className="bc-out">
                              <div className="bc-in" style={{ width: `${(cnt / max) * 100}%`, background: 'var(--danger)' }} />
                            </div>
                            <span className="bc-val">{cnt}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Fornecedores mais caros */}
              <div className="card">
                <div className="card-hd">
                  <span className="card-tt">🏭 Fornecedores com Mais Alertas</span>
                </div>
                <div className="card-bd">
                  {(() => {
                    const fornAlerta: Record<string, number> = {}
                    for (const a of auditorias) {
                      if (a.nivel_alerta !== 'normal' && a.fornecedor_nome) {
                        fornAlerta[a.fornecedor_nome] = (fornAlerta[a.fornecedor_nome] ?? 0) + 1
                      }
                    }
                    const entries = Object.entries(fornAlerta).sort((a, b) => b[1] - a[1]).slice(0, 5)
                    const max = entries[0]?.[1] ?? 1
                    return entries.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: '16px 0' }}>Nenhum dado</div>
                    ) : (
                      <div className="bc">
                        {entries.map(([nome, cnt]) => (
                          <div key={nome} className="bc-row">
                            <span className="bc-lbl" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
                            <div className="bc-out">
                              <div className="bc-in" style={{ width: `${(cnt / max) * 100}%`, background: '#B45309' }} />
                            </div>
                            <span className="bc-val">{cnt}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB: HISTÓRICO DE PREÇOS                                 */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === 'historico' && (
        <div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[1,2,3].map(i => <Skeleton key={i} h={80} />)}</div>
          ) : produtosHistorico.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 0' }}>
              <History size={36} style={{ color: 'var(--muted)', marginBottom: 10, opacity: 0.4 }} />
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>Nenhum histórico de preços</div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>Sincronize as compras para popular o histórico</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {produtosHistorico.map(p => {
                const trendColor = p.variacao_total > 10 ? 'var(--danger)' : p.variacao_total < -5 ? 'var(--success)' : '#B45309'
                return (
                  <div key={p.nome} className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nome}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{p.ocorrencias} compras registradas</div>
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {[
                          { lbl: 'Atual', val: fmtR$(p.preco_atual), color: 'var(--bordo)' },
                          { lbl: 'Médio', val: fmtR$(p.preco_medio), color: 'var(--text)' },
                          { lbl: 'Mín', val: fmtR$(p.preco_min), color: 'var(--success)' },
                          { lbl: 'Máx', val: fmtR$(p.preco_max), color: 'var(--danger)' },
                        ].map(m => (
                          <div key={m.lbl} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.lbl}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{m.val}</div>
                          </div>
                        ))}
                        <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>Variação Total</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: trendColor, display: 'flex', alignItems: 'center', gap: 3 }}>
                            {p.variacao_total > 0 ? <TrendingUp size={12} /> : p.variacao_total < 0 ? <TrendingDown size={12} /> : null}
                            {fmtPct(p.variacao_total)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mini price chart */}
                    {p.items.length > 1 && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
                        {p.items.map((item, idx) => {
                          const h = p.preco_max > p.preco_min
                            ? ((item.preco_unitario - p.preco_min) / (p.preco_max - p.preco_min)) * 28 + 4
                            : 20
                          const col = idx === p.items.length - 1 ? 'var(--bordo)' : item.preco_unitario > p.preco_medio ? 'var(--danger)' : 'var(--success)'
                          return (
                            <div key={idx} title={`${fmtData(item.data_compra)}: ${fmtR$(item.preco_unitario)}`}
                              style={{ flex: 1, height: h, background: col, borderRadius: '3px 3px 0 0', opacity: 0.8, minWidth: 4 }} />
                          )
                        })}
                      </div>
                    )}
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                      {fmtData(p.items[0].data_compra)} → {fmtData(p.items[p.items.length - 1].data_compra)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB: JUSTIFICATIVAS                                      */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === 'justificativas' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            {(['pendentes', 'aprovadas', 'reprovadas', 'todas'] as const).map(f => {
              const counts = {
                pendentes: justificativas.filter(j => j.status_aprovacao === 'pendente').length,
                aprovadas: justificativas.filter(j => j.status_aprovacao === 'aprovado').length,
                reprovadas: justificativas.filter(j => j.status_aprovacao === 'reprovado').length,
                todas: justificativas.length,
              }
              return (
                <button key={f} className="btn bo bsm"
                  style={{ fontSize: 11 }}
                  onClick={() => {}}>
                  {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
                </button>
              )
            })}
          </div>

          {/* Pending auditorias without justification */}
          {pendJust.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={12} /> {pendJust.length} COMPRA(S) AGUARDANDO JUSTIFICATIVA
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pendJust.map(a => (
                  <div key={a.id} style={{
                    padding: '10px 14px', background: '#FEF3C7', borderRadius: 8,
                    border: '1px solid #FCD34D', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{a.produto_nome}</div>
                      <div style={{ fontSize: 11, color: '#92400E' }}>
                        Variação: {fmtPct(a.variacao_pct)} · {fmtR$(a.preco_anterior)} → {fmtR$(a.preco_atual)}
                        {a.fornecedor_nome && ` · ${a.fornecedor_nome}`}
                        {a.data_compra && ` · ${fmtData(a.data_compra)}`}
                      </div>
                    </div>
                    <button className="btn" style={{ background: '#B45309', color: '#fff', fontSize: 11 }}
                      onClick={() => setJustModal({ auditoria: a })}>
                      <MessageSquare size={11} /> Justificar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submitted justifications */}
          {justificativas.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '30px 0' }}>
              <FileText size={32} style={{ color: 'var(--muted)', marginBottom: 8, opacity: 0.4 }} />
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhuma justificativa enviada ainda</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {justificativas.map(j => {
                const audit = auditorias.find(a => a.id === j.auditoria_id)
                const stt = STATUS_JUST_CFG[j.status_aprovacao]
                return (
                  <div key={j.id} className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: stt.bg, color: stt.color,
                          }}>
                            {stt.icon}{stt.label}
                          </span>
                          {audit && <AlertBadge nivel={audit.nivel_alerta} />}
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtData(j.created_at)}</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{audit?.produto_nome ?? '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          <strong>Motivo:</strong> {MOTIVO_LABEL[j.motivo]}
                          {j.houve_cotacao && <span style={{ color: 'var(--success)', marginLeft: 6 }}>· Cotação realizada ✓</span>}
                        </div>
                        {j.descricao && <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text)' }}>"{j.descricao}"</div>}
                        {j.comprador_nome && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Por: {j.comprador_nome}</div>}
                        {j.obs_aprovacao && <div style={{ fontSize: 11, marginTop: 4, color: j.status_aprovacao === 'reprovado' ? 'var(--danger)' : 'var(--success)' }}>
                          Avaliação: {j.obs_aprovacao}
                        </div>}
                      </div>
                      {j.status_aprovacao === 'pendente' && audit && (
                        <button className="btn bo bsm" style={{ fontSize: 10, color: 'var(--success)' }}
                          onClick={() => setApproveModal({ just: j, auditoria: audit })}>
                          <Eye size={10} /> Avaliar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB: PREVISÕES                                           */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === 'previsoes' && (
        <div>
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(124,58,237,0.07)', borderRadius: 8, border: '1px solid rgba(124,58,237,0.15)', fontSize: 12 }}>
            <strong>🔮 Análise Preditiva</strong> — Tendências calculadas com regressão linear sobre as últimas 5 compras de cada produto.
            Produtos com menos de 3 registros são excluídos da análise.
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[1,2,3,4].map(i => <Skeleton key={i} h={70} />)}</div>
          ) : predicoes.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 0' }}>
              <Zap size={36} style={{ color: 'var(--muted)', marginBottom: 10, opacity: 0.4 }} />
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>Dados insuficientes para previsão</div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>São necessárias pelo menos 3 compras por produto</div>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="g3" style={{ marginBottom: 12 }}>
                {[
                  { lbl: '📈 Alta prevista', cnt: predicoes.filter(p => p.tendencia === 'alta').length, color: 'var(--danger)' },
                  { lbl: '📉 Baixa prevista', cnt: predicoes.filter(p => p.tendencia === 'baixa').length, color: 'var(--success)' },
                  { lbl: '➡️ Estável', cnt: predicoes.filter(p => p.tendencia === 'estável').length, color: 'var(--muted)' },
                ].map(m => (
                  <div key={m.lbl} className="card" style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.lbl}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.cnt}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {predicoes.map(p => {
                  const isAlta = p.tendencia === 'alta'
                  const isBaixa = p.tendencia === 'baixa'
                  const color = isAlta ? 'var(--danger)' : isBaixa ? 'var(--success)' : 'var(--muted)'
                  const alertaPrevisao = p.previsao30d > p.preco_atual * 1.1 ? 'alto' : p.previsao30d > p.preco_atual * 1.05 ? 'medio' : 'normal'
                  return (
                    <div key={p.nome} className="card" style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>
                              {isAlta ? '📈' : isBaixa ? '📉' : '➡️'}
                            </span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nome}</div>
                              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.ocorrencias} compras · {p.items[0]?.categoria ?? 'Sem categoria'}</div>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Atual</div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtR$(p.preco_atual)}</div>
                          </div>
                          <div style={{ fontSize: 14, color }}>→</div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Previsão 30d</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color }}>{fmtR$(p.previsao30d)}</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Variação</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color }}>
                              {fmtPct(p.preco_atual > 0 ? ((p.previsao30d - p.preco_atual) / p.preco_atual) * 100 : 0)}
                            </div>
                          </div>
                          {alertaPrevisao !== 'normal' && <AlertBadge nivel={alertaPrevisao as NivelAlertaCompra} />}
                        </div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', padding: '6px 10px', background: 'var(--bg)', borderRadius: 6 }}>
                        💡 {isAlta
                          ? `Antecipar compra · considerar estoque estratégico · Economia potencial: ${fmtR$((p.preco_atual - p.previsao30d) * -1 * 10)}`
                          : isBaixa
                          ? `Aguardar próxima cotação · preço tende a cair nos próximos 30 dias`
                          : `Preço estável — comprar conforme necessidade operacional`}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB: IA ANALÍTICA                                        */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === 'ia' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #DB2777 100%)',
            borderRadius: 12, padding: '14px 18px', color: '#fff',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>IA Analítica — Gemini</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>Análise inteligente de compras · Recomendações · Previsões em linguagem natural</div>
              </div>
            </div>
            <button className="btn" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: 11 }}
              onClick={() => setShowKeyCfg(c => !c)}>
              <Key size={11} /> {showKeyCfg ? 'Fechar' : 'Configurar Chave'}
            </button>
          </div>

          {/* Config chave */}
          {showKeyCfg && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Key size={13} /> Chave da API Gemini (Google AI Studio)
              </div>
              <div style={{ padding: '8px 12px', background: 'rgba(79,70,229,0.07)', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
                Crie gratuitamente em <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: '#4F46E5', fontWeight: 700 }}>aistudio.google.com/app/apikey</a>
                {' '}→ "Criar chave de API" → "Criar em novo projeto" · <strong>1.500 req/dia grátis</strong>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="inp" style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }}
                  placeholder="AIzaSy..." value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)} />
                <button className="btn bp" style={{ fontSize: 11, whiteSpace: 'nowrap' }} onClick={salvarGeminiKey}
                  disabled={!geminiKey.trim()}>
                  <CheckCircle size={11} /> Salvar
                </button>
              </div>
            </div>
          )}

          {/* Aviso sem chave */}
          {!geminiKey && !showKeyCfg && (
            <div style={{ padding: '14px 18px', background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.2)', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
              <Sparkles size={18} style={{ color: '#4F46E5', flexShrink: 0 }} />
              <div style={{ fontSize: 13 }}>
                <strong style={{ color: '#4F46E5' }}>Configure a chave Gemini</strong> para ativar a IA analítica.
                {' '}<button className="btn bo bsm" style={{ fontSize: 11, color: '#4F46E5', borderColor: '#4F46E5', marginLeft: 8 }} onClick={() => setShowKeyCfg(true)}>
                  Configurar agora
                </button>
              </div>
            </div>
          )}

          {/* Perguntas rápidas */}
          {geminiKey && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>⚡ PERGUNTAS RÁPIDAS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  'Quais produtos tiveram maior aumento de preço?',
                  'Qual comprador está comprando mais caro?',
                  'Quais produtos devo priorizar na próxima compra?',
                  'Há produtos com risco de aumento nos próximos 30 dias?',
                  'Como está a economia potencial e o que fazer?',
                  'Resuma o desempenho geral das compras',
                ].map(q => (
                  <button key={q} className="btn bo bsm"
                    style={{ fontSize: 11, color: '#4F46E5', borderColor: 'rgba(79,70,229,0.3)', background: 'rgba(79,70,229,0.05)' }}
                    onClick={() => enviarMensagem(q)}
                    disabled={chatLoading}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Área do chat */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--surface)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>

            {/* Mensagens */}
            <div style={{ minHeight: 300, maxHeight: 480, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {chatMsgs.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 10, padding: '40px 0' }}>
                  <Sparkles size={36} style={{ opacity: 0.3 }} />
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Olá! Sou o Analista IA de Compras</div>
                  <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 320 }}>
                    Faça perguntas sobre suas compras, fornecedores, preços e desempenho dos compradores.
                    {!geminiKey && <><br/><strong>Configure a chave Gemini para começar.</strong></>}
                  </div>
                </div>
              ) : (
                chatMsgs.map((msg, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                    {/* Avatar */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: msg.role === 'user' ? 'var(--bordo)' : 'linear-gradient(135deg,#4F46E5,#DB2777)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {msg.role === 'user'
                        ? <span style={{ fontSize: 10, color: '#fff', fontWeight: 800 }}>{user?.name?.slice(0,2).toUpperCase() || 'EU'}</span>
                        : <Sparkles size={12} color="#fff" />}
                    </div>
                    {/* Balão */}
                    <div style={{
                      maxWidth: '80%', padding: '9px 13px', borderRadius: 10, fontSize: 12, lineHeight: 1.6,
                      background: msg.role === 'user' ? 'var(--bordo)' : 'var(--bg)',
                      color: msg.role === 'user' ? '#fff' : 'var(--text)',
                      border: msg.role === 'ai' ? '1px solid var(--border)' : 'none',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.text}
                      <div style={{ fontSize: 9, opacity: 0.5, marginTop: 4, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                        {msg.ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#4F46E5,#DB2777)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={12} color="#fff" />
                  </div>
                  <div style={{ padding: '9px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#4F46E5', opacity: 0.6, animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <input className="inp" style={{ flex: 1, fontSize: 12 }}
                placeholder={geminiKey ? 'Pergunte sobre suas compras, preços, fornecedores…' : 'Configure a chave Gemini para usar a IA'}
                value={chatInput}
                disabled={!geminiKey || chatLoading}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem() } }} />
              <button className="btn"
                style={{ background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', color: '#fff', border: 'none', padding: '0 16px', flexShrink: 0 }}
                onClick={() => enviarMensagem()}
                disabled={!geminiKey || !chatInput.trim() || chatLoading}>
                <Send size={13} />
              </button>
            </div>
          </div>

          {/* Limpar chat */}
          {chatMsgs.length > 0 && (
            <div style={{ textAlign: 'right' }}>
              <button className="btn bo bsm" style={{ fontSize: 10, color: 'var(--muted)' }}
                onClick={() => setChatMsgs([])}>
                <Trash2 size={9} /> Limpar conversa
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB: PESQUISA DE MERCADO                                 */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === 'pesquisa' && (
        <div>

          {/* ── Cabeçalho explicativo ─────────────────────────── */}
          <div style={{
            background: 'linear-gradient(135deg, #0F4C81 0%, #1a6fb5 100%)',
            borderRadius: 10, padding: '14px 18px', marginBottom: 14,
            color: '#fff', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Pesquisa de Preços no Mercado</div>
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 1 }}>
                  Busca automática via Google · Distribuidoras · Atacados · Fornecedores
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: 11 }}
                onClick={() => setShowApiCfg(c => !c)}>
                <Settings2 size={11} /> {showApiCfg ? 'Fechar Config' : 'Configurar API'}
              </button>
              <button className="btn" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: 11 }}
                onClick={pesquisarTodos}
                disabled={!pesqApiKey || !pesqCseId || produtosHistorico.length === 0}>
                <Search size={11} /> Pesquisar Todos
              </button>
            </div>
          </div>

          {/* ── Painel de configuração da API ─────────────────── */}
          {showApiCfg && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Settings2 size={13} /> Configurar Google Custom Search API
              </div>

              {/* Instruções */}
              <div style={{ padding: '10px 14px', background: 'rgba(15,76,129,0.07)', borderRadius: 8, marginBottom: 14, fontSize: 12, lineHeight: 1.7 }}>
                <strong>Como configurar (gratuito — 100 buscas/dia):</strong>
                <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li>Acesse <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: '#0F4C81' }}>console.cloud.google.com</a> → Ative a <strong>Custom Search JSON API</strong></li>
                  <li>Crie uma <strong>Chave de API</strong> (API key) e cole abaixo</li>
                  <li>Acesse <a href="https://programmablesearchengine.google.com" target="_blank" rel="noreferrer" style={{ color: '#0F4C81' }}>programmablesearchengine.google.com</a> → crie um mecanismo pesquisando em <strong>toda a web</strong></li>
                  <li>Copie o <strong>ID do mecanismo (cx)</strong> e cole abaixo</li>
                </ol>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div className="fg">
                  <label className="fl">Chave de API (API Key)</label>
                  <input className="inp" style={{ fontSize: 12, fontFamily: 'monospace' }}
                    placeholder="AIzaSy..." value={pesqApiKey}
                    onChange={e => setPesqApiKey(e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl">ID do Mecanismo (cx)</label>
                  <input className="inp" style={{ fontSize: 12, fontFamily: 'monospace' }}
                    placeholder="a1b2c3d4e5f..." value={pesqCseId}
                    onChange={e => setPesqCseId(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn bo" style={{ fontSize: 11 }} onClick={() => setShowApiCfg(false)}>Cancelar</button>
                <button className="btn bp" style={{ fontSize: 11 }} onClick={salvarApiConfig}
                  disabled={!pesqApiKey.trim() || !pesqCseId.trim()}>
                  <CheckCircle size={11} /> Salvar Configuração
                </button>
              </div>
            </div>
          )}

          {/* ── Aviso se API não configurada ─────────────────── */}
          {(!pesqApiKey || !pesqCseId) && !showApiCfg && (
            <div style={{ padding: '14px 18px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 10, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <AlertTriangle size={18} style={{ color: '#B45309', flexShrink: 0 }} />
              <div style={{ fontSize: 13 }}>
                <strong style={{ color: '#92400E' }}>API do Google não configurada.</strong>
                {' '}<span style={{ color: '#92400E' }}>Clique em <strong>"Configurar API"</strong> acima para habilitar a pesquisa automática de preços em distribuidoras e atacados.</span>
              </div>
            </div>
          )}

          {/* ── Layout 2 colunas: produtos | salvos ─────────── */}
          <div className="g2" style={{ alignItems: 'flex-start' }}>

            {/* Coluna esquerda: produtos para pesquisar */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📦 PRODUTOS RASTREADOS ({produtosHistorico.length})</span>
                <div style={{ position: 'relative' }}>
                  <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                  <input className="inp" style={{ paddingLeft: 24, fontSize: 11, width: 160 }}
                    placeholder="Filtrar produto…" value={pesqBusca}
                    onChange={e => setPesqBusca(e.target.value)} />
                </div>
              </div>

              {produtosHistorico.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '30px 0' }}>
                  <Package size={28} style={{ color: 'var(--muted)', opacity: 0.4, marginBottom: 8 }} />
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum produto no histórico</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>Sincronize as compras primeiro</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {produtosHistorico
                    .filter(p => !pesqBusca || p.nome.toLowerCase().includes(pesqBusca.toLowerCase()))
                    .slice(0, 20)
                    .map(prod => {
                      const resultados = pesqResultados[prod.nome] || []
                      const loading    = pesqLoadings[prod.nome]
                      const erro       = pesqErros[prod.nome]
                      const jaTemRef   = pesqSalvos.some(s => s.produto_nome.toLowerCase() === prod.nome.toLowerCase())
                      return (
                        <div key={prod.nome} className="card" style={{ padding: '10px 14px' }}>
                          {/* Header do produto */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: resultados.length > 0 ? 10 : 0 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                                {prod.nome}
                                {jaTemRef && <span title="Referência salva"><Star size={10} style={{ color: '#F59E0B', fill: '#F59E0B' }} /></span>}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                                Interno: {fmtR$(prod.preco_atual)} · {prod.ocorrencias} compras
                              </div>
                            </div>
                            <button className="btn bo bsm"
                              style={{ fontSize: 10, color: '#0F4C81', borderColor: '#0F4C81' }}
                              onClick={() => pesquisarProduto(prod.nome)}
                              disabled={loading || !pesqApiKey || !pesqCseId}>
                              {loading
                                ? <><RefreshCw size={10} className="spin" /> Buscando…</>
                                : <><Search size={10} /> Pesquisar</>}
                            </button>
                          </div>

                          {/* Erro */}
                          {erro && (
                            <div style={{ fontSize: 11, color: 'var(--danger)', padding: '5px 8px', background: '#FEE2E2', borderRadius: 6, marginTop: 6 }}>
                              ❌ {erro}
                            </div>
                          )}

                          {/* Resultados do Google */}
                          {resultados.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {resultados.map((r, idx) => {
                                const preco = extrairPreco(r.title + ' ' + r.snippet)
                                const forn  = extrairFornecedor(r.title, r.link)
                                return (
                                  <div key={idx} style={{
                                    padding: '8px 10px', borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: preco ? 'rgba(16,185,129,0.04)' : 'var(--bg)',
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 11, color: '#0F4C81', display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{r.title}</span>
                                          <a href={r.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                            <ExternalLink size={9} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                                          </a>
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
                                          {forn} · {r.snippet.slice(0, 120)}{r.snippet.length > 120 ? '…' : ''}
                                        </div>
                                      </div>
                                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        {preco ? (
                                          <div style={{ fontSize: 13, fontWeight: 800, color: preco < prod.preco_atual ? 'var(--success)' : 'var(--danger)' }}>
                                            {fmtR$(preco)}
                                            {preco < prod.preco_atual && (
                                              <div style={{ fontSize: 9, color: 'var(--success)', fontWeight: 600 }}>
                                                -{((1 - preco / prod.preco_atual) * 100).toFixed(0)}% vs interno
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>preço não<br/>identificado</div>
                                        )}
                                        <button className="btn bo bsm"
                                          style={{ fontSize: 9, marginTop: 4, padding: '2px 7px', color: 'var(--success)', borderColor: 'var(--success)' }}
                                          onClick={() => salvarReferencia(prod.nome, r)}>
                                          <Star size={9} /> Salvar
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>

            {/* Coluna direita: referências salvas */}
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                ⭐ REFERÊNCIAS SALVAS ({pesqSalvos.length})
              </div>
              {pesqSalvos.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '30px 0' }}>
                  <Star size={28} style={{ color: 'var(--muted)', opacity: 0.4, marginBottom: 8 }} />
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhuma referência salva ainda</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                    Pesquise um produto e clique em "Salvar" no resultado
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pesqSalvos.map(s => {
                    const prodInterno = produtosHistorico.find(p =>
                      p.nome.toLowerCase() === s.produto_nome.toLowerCase()
                    )
                    const diff = prodInterno && s.preco_extraido
                      ? ((s.preco_extraido - prodInterno.preco_atual) / prodInterno.preco_atual) * 100
                      : null
                    return (
                      <div key={s.id} className="card" style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 12 }}>{s.produto_nome}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                              {s.fornecedor_encontrado} · {fmtData(s.data_pesquisa)}
                            </div>
                            {s.titulo_resultado && (
                              <div style={{ fontSize: 10, color: '#0F4C81', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{s.titulo_resultado}</span>
                                {s.url_resultado && (
                                  <a href={s.url_resultado} target="_blank" rel="noreferrer">
                                    <ExternalLink size={8} />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {s.preco_extraido ? (
                              <>
                                <div style={{ fontSize: 14, fontWeight: 800, color: diff !== null && diff < 0 ? 'var(--success)' : diff !== null && diff > 5 ? 'var(--danger)' : 'var(--text)' }}>
                                  {fmtR$(s.preco_extraido)}
                                </div>
                                {diff !== null && (
                                  <div style={{ fontSize: 9, fontWeight: 700, color: diff < 0 ? 'var(--success)' : 'var(--danger)' }}>
                                    {diff > 0 ? '+' : ''}{diff.toFixed(1)}% vs interno
                                  </div>
                                )}
                                {prodInterno && (
                                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>Interno: {fmtR$(prodInterno.preco_atual)}</div>
                                )}
                              </>
                            ) : (
                              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Sem preço</div>
                            )}
                            <button className="btn" style={{ fontSize: 9, padding: '2px 6px', marginTop: 5, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}
                              onClick={() => excluirReferencia(s.id)}
                              title="Remover referência">
                              <Trash2 size={9} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* MODAL: Justificativa                                     */}
      {/* ════════════════════════════════════════════════════════ */}
      {justModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 16,
        }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 22, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>📋 Justificar Variação de Preço</div>
              <button className="ib" onClick={() => setJustModal(null)}><XCircle size={14} /></button>
            </div>

            {/* Product info */}
            <div style={{ padding: '10px 14px', background: '#FEF3C7', borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{justModal.auditoria.produto_nome}</div>
              <div style={{ color: '#92400E' }}>
                Variação: <strong>{fmtPct(justModal.auditoria.variacao_pct)}</strong>
                {' · '}Anterior: <strong>{fmtR$(justModal.auditoria.preco_anterior)}</strong>
                {' → '}Atual: <strong style={{ color: 'var(--danger)' }}>{fmtR$(justModal.auditoria.preco_atual)}</strong>
              </div>
              <div style={{ marginTop: 4, color: '#B45309', fontSize: 11 }}>
                Nível: <AlertBadge nivel={justModal.auditoria.nivel_alerta} />
              </div>
            </div>

            {/* Questions */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>
                QUESTIONAMENTO AUTOMÁTICO
              </div>
              {[
                'Houve falta do fornecedor anterior?',
                'Existia opção mais barata disponível?',
                'Foi realizado processo de cotação?',
                'Houve urgência operacional?',
                'O produto sofreu reajuste de mercado documentado?',
              ].map((q, i) => (
                <div key={i} style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                  • {q}
                </div>
              ))}
            </div>

            <div className="fg" style={{ marginBottom: 12 }}>
              <label className="fl">Motivo Principal *</label>
              <select className="sel" value={justForm.motivo}
                onChange={e => setJustForm(f => ({ ...f, motivo: e.target.value as MotivoJustificativa }))}>
                {(Object.entries(MOTIVO_LABEL) as [MotivoJustificativa, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="fg" style={{ marginBottom: 12 }}>
              <label className="fl">Descrição detalhada *</label>
              <textarea className="inp" rows={3} style={{ resize: 'vertical' }}
                placeholder="Descreva em detalhes o motivo da variação de preço..."
                value={justForm.descricao}
                onChange={e => setJustForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16, fontSize: 13 }}>
              <input type="checkbox" checked={justForm.houve_cotacao}
                onChange={e => setJustForm(f => ({ ...f, houve_cotacao: e.target.checked }))} />
              Foi realizado processo de cotação com múltiplos fornecedores?
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn bo" onClick={() => setJustModal(null)}>Cancelar</button>
              <button className="btn bp" onClick={submitJustificativa} disabled={savingJust || !justForm.descricao.trim()}>
                {savingJust ? <><RefreshCw size={11} className="spin" /> Enviando…</> : <><CheckCircle size={11} /> Enviar Justificativa</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* MODAL: Aprovação                                         */}
      {/* ════════════════════════════════════════════════════════ */}
      {approveModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 16,
        }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 22, width: '100%', maxWidth: 480 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>✅ Avaliar Justificativa</div>

            <div style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
              <div style={{ fontWeight: 700 }}>{approveModal.auditoria.produto_nome}</div>
              <div style={{ color: 'var(--muted)', marginTop: 3 }}>Motivo: {MOTIVO_LABEL[approveModal.just.motivo]}</div>
              <div style={{ marginTop: 3 }}>"{approveModal.just.descricao}"</div>
              {approveModal.just.houve_cotacao && <div style={{ color: 'var(--success)', marginTop: 3 }}>✓ Cotação realizada</div>}
            </div>

            <div className="fg" style={{ marginBottom: 16 }}>
              <label className="fl">Observação do avaliador</label>
              <textarea className="inp" rows={2} style={{ resize: 'vertical' }}
                placeholder="Comentário para o comprador..."
                value={approveObs}
                onChange={e => setApproveObs(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn bo" onClick={() => { setApproveModal(null); setApproveObs('') }}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }}
                onClick={() => handleAprovar('reprovado')}>
                <XCircle size={11} /> Reprovar
              </button>
              <button className="btn" style={{ background: 'var(--success)', color: '#fff' }}
                onClick={() => handleAprovar('aprovado')}>
                <CheckCircle size={11} /> Aprovar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

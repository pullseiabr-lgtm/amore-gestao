import { useState, useEffect, useCallback } from 'react'
import {
  Bot, TrendingUp, TrendingDown, AlertTriangle, BarChart3,
  Users, History, FileText, CheckCircle, XCircle, Clock,
  RefreshCw, Search, ChevronDown, ChevronUp,
  ShieldAlert, Shield, ShieldCheck, Zap, Package,
  DollarSign, Eye, MessageSquare,
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
} from '../../lib/db'
import type {
  ComprasHistoricoPreco,
  ComprasAuditoria,
  ComprasJustificativa,
  MotivoJustificativa,
  NivelAlertaCompra,
} from '../../types/database'

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

type Tab = 'painel' | 'compradores' | 'historico' | 'justificativas' | 'previsoes'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'painel',          label: 'Painel',          icon: <BarChart3 size={12} /> },
  { id: 'compradores',     label: 'Compradores',      icon: <Users size={12} /> },
  { id: 'historico',       label: 'Histórico',        icon: <History size={12} /> },
  { id: 'justificativas',  label: 'Justificativas',   icon: <MessageSquare size={12} /> },
  { id: 'previsoes',       label: 'Previsões',        icon: <Zap size={12} /> },
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

  const load = useCallback(async () => {
    setLoading(true)
    const lojaParam = loja === 'Todas as Lojas' ? undefined : loja
    const timer = setTimeout(() => setLoading(false), 8000)
    try {
      const [h, a, j] = await Promise.all([
        fetchComprasHistoricoPreco(lojaParam).catch(() => [] as ComprasHistoricoPreco[]),
        fetchComprasAuditoria(lojaParam).catch(() => [] as ComprasAuditoria[]),
        fetchComprasJustificativas().catch(() => [] as ComprasJustificativa[]),
      ])
      clearTimeout(timer)
      setHistorico(h)
      setAuditorias(a)
      setJustificativas(j)
    } catch { /* silent */ } finally {
      clearTimeout(timer)
      setLoading(false)
    }
  }, [loja])

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {syncMsg && (
            <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 12px' }}>
              {syncMsg}
            </span>
          )}
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

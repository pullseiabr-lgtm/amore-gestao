import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle, AlertCircle, TrendingUp, TrendingDown, ShoppingCart, Package, Clock, BarChart2, Zap, Bot, Shield, MessageSquare } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchRupturas, fetchRelatoriosCVL, fetchRequisicoes, fetchProdutos,
  fetchComprasAuditoria,
  type Ruptura, type RelatorioCVL,
} from '../../lib/db'
import type { Requisicao, Produto, ComprasAuditoria } from '../../types/database'

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number, prefix = 'R$ ') {
  return prefix + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(v: number) { return v.toFixed(1) + '%' }

// ── sub-components ─────────────────────────────────────────────────────────────

function Skeleton({ h = 18, w = '100%' }: { h?: number; w?: string }) {
  return <div style={{ height: h, width: w, borderRadius: 6, background: 'var(--border)', opacity: 0.5, animation: 'pulse 1.5s ease-in-out infinite' }} />
}

interface KpiCardProps {
  lbl: string; val: string | number; sub: string
  col: string; icon: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'; loading?: boolean
}
function KpiCard({ lbl, val, sub, col, icon, trend, loading }: KpiCardProps) {
  return (
    <div className="kpi" style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="kpi-ac" style={{ background: col }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="kpi-lbl">{lbl}</div>
        <span style={{ color: col, opacity: 0.7 }}>{icon}</span>
      </div>
      {loading ? <Skeleton h={28} w="60%" /> : <div className="kpi-val">{val}</div>}
      <div className="kpi-sub">
        {trend === 'up'   && <><span className="kpi-up">▲</span>{sub}</>}
        {trend === 'down' && <span className="kpi-dn">{sub}</span>}
        {!trend && sub}
      </div>
    </div>
  )
}

// ── main ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { loja } = useLoja()

  // ── real data ────────────────────────────────────────────────
  const [rupturas,     setRupturas]     = useState<Ruptura[]>([])
  const [cvlRels,      setCvlRels]      = useState<RelatorioCVL[]>([])
  const [requisicoes,  setRequisicoes]  = useState<Requisicao[]>([])
  const [produtos,     setProdutos]     = useState<Produto[]>([])
  const [loading,      setLoading]      = useState(true)
  const [auditorias,   setAuditorias]   = useState<ComprasAuditoria[]>([])

  useEffect(() => {
    setLoading(true)
    const lojaParam = loja === 'Todas as Lojas' ? undefined : loja

    // Garantia de resolução em até 6s — evita skeleton infinito quando
    // Supabase está pausado ou a rede é lenta
    const safetyTimer = setTimeout(() => setLoading(false), 6000)

    Promise.allSettled([
      fetchRupturas(loja),
      fetchRelatoriosCVL(loja),
      fetchRequisicoes(loja),
      lojaParam ? fetchProdutos(lojaParam, { ativo: true }) : Promise.resolve([] as Produto[]),
      fetchComprasAuditoria(lojaParam).catch(() => [] as ComprasAuditoria[]),
    ]).then(([r, c, q, p, a]) => {
      clearTimeout(safetyTimer)
      if (r.status === 'fulfilled') setRupturas(r.value)
      if (c.status === 'fulfilled') setCvlRels(c.value)
      if (q.status === 'fulfilled') setRequisicoes(q.value)
      if (p.status === 'fulfilled') setProdutos(p.value)
      if (a.status === 'fulfilled') setAuditorias(a.value)
      setLoading(false)
    })

    return () => clearTimeout(safetyTimer)
  }, [loja])

  // ── derived ────────────────────────────────────────────────────────────────
  const rupturasAbertas  = rupturas.filter(r => r.status === 'aberta')
  const rupturasParciais = rupturas.filter(r => r.status === 'parcial')
  const rupturasCriticas = [...rupturasAbertas, ...rupturasParciais].slice(0, 5)
  const impactoTotal     = rupturas.reduce((s, r) => s + (r.impacto_financeiro ?? 0), 0)

  const ultimoCVL         = cvlRels[0] ?? null
  const assertividade     = ultimoCVL ? ultimoCVL.assertividade : null
  const economia          = ultimoCVL ? ultimoCVL.economia : 0
  const excesso           = ultimoCVL ? ultimoCVL.excesso : 0

  const reqPendentes = requisicoes.filter(r =>
    ['pendente','em_cotacao','cotacao_recebida'].includes(r.status)
  )
  const reqAprovadas = requisicoes.filter(r =>
    ['aprovada','compra_realizada'].includes(r.status)
  )

  const produtosCriticos = produtos
    .filter(p => p.estoque_minimo != null && p.estoque_atual != null && p.estoque_atual <= p.estoque_minimo)
    .sort((a, b) => ((a.estoque_atual ?? 0) / Math.max(a.estoque_minimo ?? 1, 1)) - ((b.estoque_atual ?? 0) / Math.max(b.estoque_minimo ?? 1, 1)))
    .slice(0, 5)

  // bar chart max for rupturas por motivo
  const motivoMap: Record<string, number> = {}
  for (const r of rupturas) {
    const k = r.motivo ?? 'outros'
    motivoMap[k] = (motivoMap[k] ?? 0) + 1
  }
  const motivoEntries = Object.entries(motivoMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const motivoMax     = motivoEntries[0]?.[1] ?? 1

  const MOTIVO_LABEL: Record<string, string> = {
    estoque_zerado: 'Estoque Zerado', fornecedor_indisponivel: 'Fornecedor',
    logistica: 'Logística', qualidade: 'Qualidade', preco: 'Preço', outros: 'Outros',
  }

  // assertividade color
  const assColor = assertividade == null ? 'var(--muted)'
    : assertividade >= 85 ? 'var(--success)'
    : assertividade >= 65 ? 'var(--warning)'
    : 'var(--danger)'

  const gerarRelatorioWhatsApp = () => {
    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    const lojaStr = loja === 'Todas as Lojas' ? 'Todas as Lojas' : loja
    const linhas = [
      `📊 *RELATÓRIO DIÁRIO — AMORE GESTÃO*`,
      `📅 ${hoje}`,
      `🏪 ${lojaStr}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📦 *ESTOQUE*`,
      `• Produtos críticos (abaixo do mínimo): *${produtosCriticos.length}*`,
      produtosCriticos.length > 0
        ? produtosCriticos.slice(0, 3).map(p => `  ↳ ${p.nome}: ${p.estoque_atual ?? 0} ${p.unidade ?? 'un'}`).join('\n')
        : `  ↳ Estoque em dia ✅`,
      ``,
      `🛒 *COMPRAS & REQUISIÇÕES*`,
      `• Requisições pendentes: *${reqPendentes.length}*`,
      `• Requisições aprovadas: *${reqAprovadas.length}*`,
      ``,
      `⚠️ *RUPTURAS*`,
      `• Rupturas abertas: *${rupturasAbertas.length}*`,
      `• Impacto financeiro estimado: *${fmt(impactoTotal)}*`,
      ``,
      `📈 *ASSERTIVIDADE DE COMPRAS*`,
      assertividade != null
        ? `• Índice: *${pct(assertividade)}* ${assertividade >= 85 ? '✅' : assertividade >= 65 ? '⚠️' : '❌'}`
        : `• Sem dados disponíveis`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `_Gerado automaticamente pelo Amore Gestão V5.0_`,
    ].join('\n')
    window.open('https://wa.me/?text=' + encodeURIComponent(linhas), '_blank')
  }

  return (
    <div>
      {/* ── Cabeçalho com ação de relatório ────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn bo bsm" onClick={gerarRelatorioWhatsApp}
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Zap size={11} style={{ color: '#25D366' }} />
          Relatório diário WhatsApp
        </button>
      </div>

      {/* ── KPI Grid ───────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <KpiCard
          lbl="Assertividade de Compras"
          val={assertividade != null ? pct(assertividade) : '—'}
          sub={ultimoCVL ? `Último relatório: ${new Date(ultimoCVL.created_at).toLocaleDateString('pt-BR')}` : 'Nenhum relatório gerado'}
          col={assColor} icon={<BarChart2 size={16} />}
          trend={assertividade != null && assertividade >= 85 ? 'up' : assertividade != null && assertividade < 65 ? 'down' : undefined}
          loading={loading}
        />
        <KpiCard
          lbl="Rupturas Abertas"
          val={loading ? '…' : rupturasAbertas.length}
          sub={loading ? '' : `${rupturasParciais.length} parciais · impacto ${fmt(impactoTotal)}`}
          col={rupturasAbertas.length > 0 ? 'var(--danger)' : 'var(--success)'}
          icon={<AlertTriangle size={16} />}
          trend={rupturasAbertas.length > 0 ? 'down' : undefined}
          loading={loading}
        />
        <KpiCard
          lbl="Req. Pendentes"
          val={loading ? '…' : reqPendentes.length}
          sub={loading ? '' : `${reqAprovadas.length} aprovadas aguardando compra`}
          col="var(--warning)" icon={<Clock size={16} />}
          trend={reqPendentes.length > 3 ? 'down' : undefined}
          loading={loading}
        />
        <KpiCard
          lbl="Produtos Críticos"
          val={loading ? '…' : produtosCriticos.length}
          sub={loading ? '' : produtosCriticos.length === 0 ? 'Estoque OK' : `Abaixo do mínimo`}
          col={produtosCriticos.length > 0 ? 'var(--danger)' : 'var(--success)'}
          icon={<Package size={16} />}
          trend={produtosCriticos.length > 0 ? 'down' : undefined}
          loading={loading}
        />
        <KpiCard
          lbl="Economia (CVL)"
          val={ultimoCVL ? fmt(economia) : '—'}
          sub={ultimoCVL ? `Excesso: ${fmt(excesso)}` : 'Sem dados'}
          col="var(--success)" icon={<TrendingDown size={16} />}
          trend={economia > 0 ? 'up' : undefined}
          loading={loading}
        />
        <KpiCard
          lbl="Total Requisições"
          val={loading ? '…' : requisicoes.length}
          sub={loading ? '' : `${requisicoes.filter(r => r.status === 'concluida').length} concluídas`}
          col="var(--blue)" icon={<ShoppingCart size={16} />}
          loading={loading}
        />
      </div>

      {/* ── 🤖 Agente Analítico de Compras ─────────────────────── */}
      {(() => {
        const alertasAlto  = auditorias.filter(a => a.nivel_alerta === 'alto').length
        const alertasMedio = auditorias.filter(a => a.nivel_alerta === 'medio').length
        const pendJust     = auditorias.filter(a => a.status === 'pendente_justificativa').length
        const economiaPot  = auditorias.reduce((s, a) => {
          if (!a.preco_anterior || !a.quantidade) return s
          return a.preco_anterior > a.preco_atual ? s + (a.preco_anterior - a.preco_atual) * a.quantidade : s
        }, 0)
        return (
          <div style={{
            background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
            borderRadius: 14, padding: '18px 22px', marginBottom: 16,
            color: '#fff', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            {/* Icon + title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Bot size={26} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.3px' }}>
                  🤖 Agente Analítico de Compras
                </div>
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                  Auditoria automática · Rastreamento de preços · Performance de compradores · Previsões
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {[
                { lbl: 'Alertas Altos', val: alertasAlto, icon: <AlertTriangle size={12} />, color: alertasAlto > 0 ? '#FCA5A5' : '#A7F3D0' },
                { lbl: 'Alertas Médios', val: alertasMedio, icon: <Shield size={12} />, color: '#FDE68A' },
                { lbl: 'Pend. Justif.', val: pendJust, icon: <MessageSquare size={12} />, color: pendJust > 0 ? '#FCA5A5' : '#A7F3D0' },
                { lbl: 'Auditados', val: auditorias.length, icon: <BarChart2 size={12} />, color: '#C4B5FD' },
              ].map(m => (
                <div key={m.lbl} style={{ textAlign: 'center', minWidth: 64 }}>
                  <div style={{ fontSize: 10, opacity: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 2 }}>
                    {m.icon}{m.lbl}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: m.color, lineHeight: 1 }}>
                    {loading ? '…' : m.val}
                  </div>
                </div>
              ))}
              {economiaPot > 0 && (
                <div style={{ textAlign: 'center', minWidth: 80 }}>
                  <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 2 }}>💰 Economia Potencial</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#A7F3D0', lineHeight: 1 }}>
                    {loading ? '…' : `R$ ${economiaPot.toFixed(0)}`}
                  </div>
                </div>
              )}
            </div>

            {/* CTA Button — this triggers navigation via window postMessage since we're inside a component */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <button
                id="btn-abrir-agente"
                className="btn"
                onClick={() => document.dispatchEvent(new CustomEvent('amore-nav', { detail: 'compras-agente' }))}
                style={{
                  background: '#fff', color: '#7C3AED',
                  fontWeight: 800, fontSize: 12, padding: '9px 20px', borderRadius: 10,
                  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}>
                <Bot size={13} /> Abrir Agente
              </button>
              {pendJust > 0 && (
                <span style={{ fontSize: 10, opacity: 0.85, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '2px 10px' }}>
                  ⚠️ {pendJust} justificativa(s) pendente(s)
                </span>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Row 2: Assertividade + Alertas ─────────────────────── */}
      <div className="g11" style={{ marginBottom: 14 }}>

        {/* Índice de Assertividade */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">📊 Assertividade de Compras</span>
            {ultimoCVL && (
              <span className={`badge ${assertividade! >= 85 ? 'bg-g' : assertividade! >= 65 ? 'bg-y' : 'bg-r'}`}>
                {pct(ultimoCVL.assertividade)}
              </span>
            )}
          </div>
          <div className="card-bd">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3].map(i => <Skeleton key={i} h={22} />)}
              </div>
            ) : ultimoCVL ? (
              <div>
                {/* big gauge */}
                <div style={{ textAlign: 'center', margin: '8px 0 12px' }}>
                  <div style={{ fontSize: 36, fontWeight: 800, color: assColor, lineHeight: 1 }}>
                    {pct(ultimoCVL.assertividade)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {ultimoCVL.total_itens_comprados} de {ultimoCVL.total_itens_solicitados} itens dentro da margem (±10%)
                  </div>
                  <div className="prog" style={{ marginTop: 8 }}>
                    <div className="pb" style={{ width: `${ultimoCVL.assertividade}%`, background: assColor, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
                {/* metrics row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
                  {[
                    { lbl: 'Previsto', val: fmt(ultimoCVL.valor_previsto), col: 'var(--muted)' },
                    { lbl: 'Realizado', val: fmt(ultimoCVL.valor_realizado), col: 'var(--blue)' },
                    { lbl: 'Não comprado', val: ultimoCVL.total_itens_nao_comprados, col: 'var(--danger)' },
                  ].map(m => (
                    <div key={m.lbl} style={{ textAlign: 'center', padding: '6px 4px', background: 'var(--bg)', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.lbl}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: m.col }}>{m.val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
                  Período: {new Date(ultimoCVL.periodo_inicio).toLocaleDateString('pt-BR')} — {new Date(ultimoCVL.periodo_fim).toLocaleDateString('pt-BR')}
                  {ultimoCVL.gerado_por && ` · por ${ultimoCVL.gerado_por}`}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
                <BarChart2 size={28} style={{ marginBottom: 6, opacity: 0.3 }} />
                <div>Nenhum relatório Compra vs Lista gerado</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Acesse Relatórios → Compra vs Lista para gerar</div>
              </div>
            )}
          </div>
        </div>

        {/* Alertas Críticos */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">🚨 Alertas Críticos</span>
            {!loading && (rupturasAbertas.length + produtosCriticos.length + reqPendentes.length) > 0 && (
              <span className="badge bg-r">{rupturasAbertas.length + produtosCriticos.length} ativos</span>
            )}
          </div>
          <div className="card-bd" style={{ padding: 11 }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3].map(i => <Skeleton key={i} h={44} />)}
              </div>
            ) : (
              <>
                {rupturasCriticas.map(r => (
                  <div key={r.id} className="al al-r" style={{ marginBottom: 8 }}>
                    <AlertTriangle size={13} />
                    <div>
                      <strong>Ruptura: {r.produto_nome}</strong>
                      {r.numero_pedido && <> · #{r.numero_pedido}</>}
                      <br />
                      <span style={{ fontSize: 10.5 }}>
                        {r.motivo ? MOTIVO_LABEL[r.motivo] ?? r.motivo : '—'}
                        {r.impacto_financeiro > 0 && ` · Impacto: ${fmt(r.impacto_financeiro)}`}
                        {' · '}{new Date(r.data_ocorrencia).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))}
                {produtosCriticos.slice(0, 3 - Math.min(rupturasCriticas.length, 3)).map(p => (
                  <div key={p.id} className="al al-y" style={{ marginBottom: 8 }}>
                    <AlertCircle size={13} />
                    <div>
                      <strong>Estoque crítico: {p.nome}</strong>
                      <br />
                      <span style={{ fontSize: 10.5 }}>
                        Atual: {p.estoque_atual ?? 0} {p.unidade ?? ''} · Mínimo: {p.estoque_minimo ?? 0}
                      </span>
                    </div>
                  </div>
                ))}
                {reqAprovadas.length > 0 && (
                  <div className="al al-y" style={{ marginBottom: 8 }}>
                    <Clock size={13} />
                    <div>
                      <strong>{reqAprovadas.length} requisição(ões) aprovada(s)</strong>
                      <br />
                      <span style={{ fontSize: 10.5 }}>Aguardando finalização de compra</span>
                    </div>
                  </div>
                )}
                {rupturasCriticas.length === 0 && produtosCriticos.length === 0 && reqAprovadas.length === 0 && (
                  <div className="al al-g">
                    <CheckCircle size={13} />
                    <div><strong>Nenhum alerta crítico</strong> — tudo em ordem!</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 3: Rupturas por Motivo + Produtos Críticos ─────── */}
      <div className="g11" style={{ marginBottom: 14 }}>

        {/* Rupturas por motivo */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">📉 Rupturas por Motivo</span>
            {!loading && rupturas.length > 0 && (
              <span className="badge bg-r">{rupturas.length} total</span>
            )}
          </div>
          <div className="card-bd">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3,4].map(i => <Skeleton key={i} h={22} />)}
              </div>
            ) : motivoEntries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
                <Zap size={28} style={{ marginBottom: 6, opacity: 0.3 }} />
                <div>Nenhuma ruptura registrada</div>
              </div>
            ) : (
              <div className="bc">
                {motivoEntries.map(([motivo, count]) => (
                  <div className="bc-row" key={motivo}>
                    <span className="bc-lbl">{MOTIVO_LABEL[motivo] ?? motivo}</span>
                    <div className="bc-out">
                      <div className="bc-in" style={{ width: `${(count / motivoMax) * 100}%`, background: 'var(--danger)' }} />
                    </div>
                    <span className="bc-val">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Produtos com Estoque Crítico */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">📦 Estoque Crítico</span>
            {!loading && produtosCriticos.length > 0 && (
              <span className="badge bg-r">{produtosCriticos.length}</span>
            )}
          </div>
          <div className="card-bd" style={{ padding: '7px 11px' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3].map(i => <Skeleton key={i} h={44} />)}
              </div>
            ) : produtosCriticos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
                <CheckCircle size={28} style={{ marginBottom: 6, color: 'var(--success)', opacity: 0.6 }} />
                <div>Todos os produtos estão acima do mínimo</div>
              </div>
            ) : (
              produtosCriticos.map(p => {
                const ratio = p.estoque_minimo && p.estoque_minimo > 0
                  ? Math.min((p.estoque_atual ?? 0) / p.estoque_minimo, 1) * 100
                  : 0
                const col = ratio <= 0 ? 'var(--danger)' : ratio <= 50 ? 'var(--warning)' : 'var(--success)'
                return (
                  <div key={p.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{p.nome}</span>
                      <span style={{ fontSize: 11, color: col, fontWeight: 700 }}>
                        {p.estoque_atual ?? 0}/{p.estoque_minimo ?? 0} {p.unidade ?? ''}
                      </span>
                    </div>
                    <div className="prog">
                      <div className="pb" style={{ width: `${ratio}%`, background: col }} />
                    </div>
                    {p.categoria_nome && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{p.categoria_nome}</div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Row 4: Status das Requisições + Últimas Rupturas ────── */}
      <div className="g11">

        {/* Requisições por status */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">🛒 Requisições por Status</span>
          </div>
          <div className="card-bd">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3,4].map(i => <Skeleton key={i} h={22} />)}
              </div>
            ) : requisicoes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
                <ShoppingCart size={28} style={{ marginBottom: 6, opacity: 0.3 }} />
                <div>Nenhuma requisição encontrada</div>
              </div>
            ) : (() => {
              const STATUS_LABEL: Record<string, string> = {
                pendente: 'Pendente', em_cotacao: 'Em Cotação', cotacao_recebida: 'Cotação Recebida',
                aprovada: 'Aprovada', reprovada: 'Reprovada', compra_realizada: 'Compra Realizada',
                prestacao_pendente: 'Prestação Pend.', em_auditoria: 'Em Auditoria', concluida: 'Concluída',
              }
              const STATUS_COL: Record<string, string> = {
                pendente: 'var(--muted)', em_cotacao: 'var(--blue)', cotacao_recebida: 'var(--blue)',
                aprovada: 'var(--success)', reprovada: 'var(--danger)', compra_realizada: 'var(--teal)',
                prestacao_pendente: 'var(--warning)', em_auditoria: 'var(--warning)', concluida: 'var(--success)',
              }
              const counts: Record<string, number> = {}
              for (const r of requisicoes) counts[r.status] = (counts[r.status] ?? 0) + 1
              const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
              const maxCount = entries[0]?.[1] ?? 1
              return (
                <div className="bc">
                  {entries.map(([status, count]) => (
                    <div className="bc-row" key={status}>
                      <span className="bc-lbl">{STATUS_LABEL[status] ?? status}</span>
                      <div className="bc-out">
                        <div className="bc-in" style={{ width: `${(count / maxCount) * 100}%`, background: STATUS_COL[status] ?? 'var(--bordo)' }} />
                      </div>
                      <span className="bc-val">{count}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Últimas Rupturas */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">⚡ Últimas Rupturas</span>
            {!loading && rupturas.length > 0 && (
              <span className="badge bg-y">
                <TrendingUp size={10} style={{ marginRight: 3 }} />
                {impactoTotal > 0 ? fmt(impactoTotal) : `${rupturas.length} reg.`}
              </span>
            )}
          </div>
          <div className="card-bd" style={{ padding: '7px 11px' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3].map(i => <Skeleton key={i} h={52} />)}
              </div>
            ) : rupturas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
                <CheckCircle size={28} style={{ marginBottom: 6, color: 'var(--success)', opacity: 0.6 }} />
                <div>Nenhuma ruptura registrada</div>
              </div>
            ) : (
              rupturas.slice(0, 5).map(r => {
                const statusCol = r.status === 'aberta' ? 'var(--danger)' : r.status === 'parcial' ? 'var(--warning)' : 'var(--success)'
                const statusLbl = r.status === 'aberta' ? 'Aberta' : r.status === 'parcial' ? 'Parcial' : 'Resolvida'
                return (
                  <div key={r.id} className="rk" style={{ marginBottom: 8 }}>
                    <div className="rk-av" style={{ background: statusCol, fontSize: 11, fontWeight: 800 }}>
                      {r.pct_ruptura?.toFixed(0) ?? 0}%
                    </div>
                    <div className="rk-info">
                      <div className="rk-nm">{r.produto_nome}</div>
                      <div className="rk-rl">
                        {MOTIVO_LABEL[r.motivo ?? ''] ?? r.motivo ?? '—'}
                        {r.numero_pedido && ` · #${r.numero_pedido}`}
                      </div>
                    </div>
                    <div className="rk-pts">
                      <div className="rk-pv" style={{ color: statusCol }}>{statusLbl}</div>
                      <div className="rk-pl">{new Date(r.data_ocorrencia).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

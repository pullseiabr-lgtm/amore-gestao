import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, ArrowRight, Package, AlertTriangle, Settings2, Check, X } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { fetchRequisicoes, updateRequisicao, fetchAprovacaoConfig, upsertAprovacaoConfig, insertReqTimeline } from '../../lib/db'
import type { Requisicao, ReqStatus, ReqPrioridade, AprovacaoConfig, NivelAprovacao } from '../../types/database'

// ── Etapas macro do fluxo de suprimentos ─────────────────────
type EtapaId = 'solicitacao' | 'cotacao' | 'aprovacao' | 'pedido' | 'recebimento' | 'finalizado'

const ETAPAS: { id: EtapaId; label: string; cor: string; bg: string; status: ReqStatus[] }[] = [
  { id: 'solicitacao', label: '1 · Solicitação',        cor: '#64748b', bg: '#f1f5f9', status: ['rascunho'] },
  { id: 'cotacao',     label: '2 · Cotação',            cor: '#7c3aed', bg: '#ede9fe', status: ['em_cotacao', 'em_analise'] },
  { id: 'aprovacao',   label: '3 · Aprovação',          cor: '#ca8a04', bg: '#fef9c3', status: ['enviada', 'parcialmente_aprovada', 'aprovada', 'reprovada'] },
  { id: 'pedido',      label: '4 · Pedido / Compra',    cor: '#0891b2', bg: '#cffafe', status: ['em_separacao', 'compra_realizada'] },
  { id: 'recebimento', label: '5 · Recebim. / Fiscal',  cor: '#ea580c', bg: '#ffedd5', status: ['prestacao_pendente', 'em_auditoria'] },
  { id: 'finalizado',  label: '6 · Finalizado',         cor: '#16a34a', bg: '#dcfce7', status: ['concluida'] },
]

// Níveis de aprovação exigidos conforme o valor ultrapassa cada limite
const NIVEL_LABEL: Record<NivelAprovacao, string> = { gestor: 'Gestor', financeiro: 'Financeiro', diretoria: 'Diretoria' }

function niveisExigidos(total: number, cfg: AprovacaoConfig): NivelAprovacao[] {
  const req: NivelAprovacao[] = []
  if (total > cfg.limite_gestor) req.push('gestor')
  if (total > cfg.limite_financeiro) req.push('financeiro')
  if (total > cfg.limite_diretoria) req.push('diretoria')
  return req
}
function nivelAprovado(r: Requisicao, n: NivelAprovacao): boolean {
  return n === 'gestor' ? !!r.aprov_gestor_em : n === 'financeiro' ? !!r.aprov_financeiro_em : !!r.aprov_diretoria_em
}
function nivelAprovadoPor(r: Requisicao, n: NivelAprovacao): string | null | undefined {
  return n === 'gestor' ? r.aprov_gestor_por : n === 'financeiro' ? r.aprov_financeiro_por : r.aprov_diretoria_por
}

const STATUS_LABEL: Record<ReqStatus, string> = {
  rascunho: 'Rascunho', enviada: 'Aguard. aprovação', em_analise: 'Em análise', em_cotacao: 'Em cotação',
  parcialmente_aprovada: 'Aprov. parcial', aprovada: 'Aprovada', reprovada: 'Reprovada',
  em_separacao: 'Em separação', compra_realizada: 'Compra realizada', prestacao_pendente: 'Prestação pendente',
  em_auditoria: 'Em auditoria', concluida: 'Finalizada', cancelada: 'Cancelada',
}

const PRIO: Record<ReqPrioridade, { label: string; cor: string }> = {
  baixa: { label: 'Baixa', cor: '#15803d' }, media: { label: 'Média', cor: '#b45309' },
  alta: { label: 'Alta', cor: '#ea580c' }, urgente: { label: 'Urgente', cor: '#dc2626' },
}

const fmtR$ = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = (d: string | null) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—'
const vencido = (d: string | null) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) < new Date(new Date().toDateString()) : false

function etapaDoStatus(s: ReqStatus): EtapaId | null {
  const e = ETAPAS.find(et => et.status.includes(s))
  return e ? e.id : null
}

function irParaRequisicoes() {
  document.dispatchEvent(new CustomEvent('amore-nav', { detail: 'requisicoes' }))
}

export default function FluxoSuprimentosPage() {
  const { loja } = useLoja()
  const { user } = useAuth()
  const [reqs, setReqs] = useState<Requisicao[]>([])
  const [loading, setLoading] = useState(true)
  const [cfg, setCfg] = useState<AprovacaoConfig | null>(null)
  const [saving, setSaving] = useState(false)
  // Modal de limites
  const [showLimites, setShowLimites] = useState(false)
  const [limForm, setLimForm] = useState({ limite_gestor: '', limite_financeiro: '', limite_diretoria: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, conf] = await Promise.all([fetchRequisicoes(loja), fetchAprovacaoConfig(loja)])
      setReqs(data)
      setCfg(conf)
    } finally { setLoading(false) }
  }, [loja])

  useEffect(() => { load() }, [load])

  // ── Aprovar um nível ──────────────────────────────────────
  const aprovarNivel = async (r: Requisicao, nivel: NivelAprovacao) => {
    if (!cfg) return
    setSaving(true)
    try {
      const agora = new Date().toISOString()
      const nome = user?.name || 'Gestor'
      const upd: Partial<Requisicao> = {}
      if (nivel === 'gestor') { upd.aprov_gestor_por = nome; upd.aprov_gestor_em = agora }
      if (nivel === 'financeiro') { upd.aprov_financeiro_por = nome; upd.aprov_financeiro_em = agora }
      if (nivel === 'diretoria') { upd.aprov_diretoria_por = nome; upd.aprov_diretoria_em = agora }

      // Verifica se, após este nível, todos os exigidos estão aprovados
      const exigidos = niveisExigidos(r.total_final || r.total_estimado || 0, cfg)
      const aprovadoAgora = (n: NivelAprovacao) => n === nivel || nivelAprovado(r, n)
      const tudoAprovado = exigidos.every(aprovadoAgora)
      if (tudoAprovado) { upd.status = 'aprovada'; upd.aprovador_nome = nome; upd.aprovador_at = agora }
      else { upd.status = 'parcialmente_aprovada' }

      await updateRequisicao(r.id, upd)
      try { await insertReqTimeline({ requisicao_id: r.id, tipo: 'aprovacao', descricao: `Aprovação ${NIVEL_LABEL[nivel]} por ${nome}${tudoAprovado ? ' — totalmente aprovada' : ''}`, usuario: nome, dados: null }) } catch { /* timeline opcional */ }
      await load()
    } finally { setSaving(false) }
  }

  // ── Aprovação direta (comprador, sem níveis extras exigidos) ──
  const aprovarComprador = async (r: Requisicao) => {
    setSaving(true)
    try {
      const nome = user?.name || 'Comprador'
      await updateRequisicao(r.id, { status: 'aprovada', aprovador_nome: nome, aprovador_at: new Date().toISOString() })
      try { await insertReqTimeline({ requisicao_id: r.id, tipo: 'aprovacao', descricao: `Aprovada por ${nome} (comprador)`, usuario: nome, dados: null }) } catch { /* opcional */ }
      await load()
    } finally { setSaving(false) }
  }

  // ── Reprovar ──────────────────────────────────────────────
  const reprovar = async (r: Requisicao) => {
    const motivo = window.prompt('Motivo da reprovação:')
    if (motivo === null) return
    setSaving(true)
    try {
      const nome = user?.name || 'Gestor'
      await updateRequisicao(r.id, { status: 'reprovada', aprov_reprovado_por: nome, aprov_reprovado_motivo: motivo || null })
      try { await insertReqTimeline({ requisicao_id: r.id, tipo: 'reprovacao', descricao: `Reprovada por ${nome}${motivo ? `: ${motivo}` : ''}`, usuario: nome, dados: null }) } catch { /* opcional */ }
      await load()
    } finally { setSaving(false) }
  }

  // ── Salvar limites ────────────────────────────────────────
  const abrirLimites = () => {
    if (!cfg) return
    setLimForm({ limite_gestor: String(cfg.limite_gestor), limite_financeiro: String(cfg.limite_financeiro), limite_diretoria: String(cfg.limite_diretoria) })
    setShowLimites(true)
  }
  const salvarLimites = async () => {
    setSaving(true)
    try {
      await upsertAprovacaoConfig({
        loja,
        limite_gestor: Number(limForm.limite_gestor) || 0,
        limite_financeiro: Number(limForm.limite_financeiro) || 0,
        limite_diretoria: Number(limForm.limite_diretoria) || 0,
      })
      setShowLimites(false)
      await load()
    } finally { setSaving(false) }
  }

  // Apenas requisições ativas no pipeline (exclui canceladas)
  const ativas = reqs.filter(r => r.status !== 'cancelada')
  const porEtapa = (id: EtapaId) => ativas.filter(r => etapaDoStatus(r.status) === id)

  const totalAberto = ativas
    .filter(r => r.status !== 'concluida')
    .reduce((a, r) => a + (r.total_final || r.total_estimado || 0), 0)
  const atrasadas = ativas.filter(r => r.status !== 'concluida' && vencido(r.prazo_entrega)).length
  const emFluxo = ativas.filter(r => r.status !== 'concluida').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Pipeline de Suprimentos</h2>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            Fluxo das requisições da loja <strong>{loja}</strong> — solicitação → cotação → aprovação → pedido → recebimento → estoque
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={abrirLimites} disabled={!cfg}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings2 size={14} /> Limites
          </button>
          <button onClick={load}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* Régua de limites (resumo) */}
      {cfg && !loading && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <span>Régua de aprovação:</span>
          <span>Comprador <strong>qualquer valor</strong></span>
          <span>· +Gestor acima de <strong>{fmtR$(cfg.limite_gestor)}</strong></span>
          <span>· +Financeiro acima de <strong>{fmtR$(cfg.limite_financeiro)}</strong></span>
          <span>· +Diretoria acima de <strong>{fmtR$(cfg.limite_diretoria)}</strong></span>
        </div>
      )}

      {/* Métricas */}
      {!loading && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { lbl: 'Em fluxo', val: emFluxo, cor: '#2563eb' },
            { lbl: 'Atrasadas', val: atrasadas, cor: '#dc2626' },
            { lbl: 'Finalizadas', val: porEtapa('finalizado').length, cor: '#16a34a' },
            { lbl: 'Valor em aberto', val: fmtR$(totalAberto), cor: '#9333ea' },
          ].map(m => (
            <div key={m.lbl} style={{ flex: '1 1 130px', minWidth: 130, background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${m.cor}`, borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: m.cor, lineHeight: 1.1 }}>{m.val}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', opacity: 0.4 }} />
        </div>
      )}

      {/* Pipeline Kanban */}
      {!loading && (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', flex: 1, minHeight: 0, paddingBottom: 8 }}>
          {ETAPAS.map((etapa, idx) => {
            const cards = porEtapa(etapa.id)
            const totalEtapa = cards.reduce((a, r) => a + (r.total_final || r.total_estimado || 0), 0)
            return (
              <div key={etapa.id} style={{ minWidth: 250, maxWidth: 290, flex: '0 0 270px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Cabeçalho etapa */}
                <div style={{ padding: '10px 12px', borderRadius: 10, background: etapa.bg, borderTop: `3px solid ${etapa.cor}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: etapa.cor }}>{etapa.label}</span>
                    <span style={{ background: etapa.cor, color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{cards.length}</span>
                  </div>
                  {totalEtapa > 0 && <div style={{ fontSize: 11, color: etapa.cor, marginTop: 3, opacity: 0.85 }}>{fmtR$(totalEtapa)}</div>}
                  {idx < ETAPAS.length - 1 && (
                    <ArrowRight size={12} style={{ position: 'relative', float: 'right', color: etapa.cor, opacity: 0.4, marginTop: -14 }} />
                  )}
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
                  {cards.map(r => {
                    const prio = PRIO[r.prioridade]
                    const atrasou = r.status !== 'concluida' && vencido(r.prazo_entrega)
                    return (
                      <div key={r.id} onClick={irParaRequisicoes} title="Abrir em Requisições"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, cursor: 'pointer', position: 'relative' }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', borderRadius: '10px 0 0 10px', background: prio.cor }} />
                        <div style={{ paddingLeft: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bordo)' }}>REQ-{String(r.numero).padStart(4, '0')}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: prio.cor }}>{prio.label}</span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 6 }}>{r.titulo}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                            <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--muted)' }}>{STATUS_LABEL[r.status]}</span>
                            {r.setor && <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--muted)' }}>{r.setor}</span>}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
                            <span>{fmtR$(r.total_final || r.total_estimado || 0)}</span>
                            {r.prazo_entrega && (
                              <span style={{ color: atrasou ? '#dc2626' : 'var(--muted)', fontWeight: atrasou ? 600 : 400 }}>
                                {atrasou && '⚠ '}{fmtDt(r.prazo_entrega)}
                              </span>
                            )}
                          </div>
                          {r.responsavel_nome && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{r.responsavel_nome}</div>}

                          {/* Régua de aprovação multinível (somente etapa Aprovação) */}
                          {etapa.id === 'aprovacao' && cfg && (
                            <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                              {r.status === 'aprovada' ? (
                                <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Aprovada{r.aprovador_nome ? ` · ${r.aprovador_nome}` : ''}</div>
                              ) : r.status === 'reprovada' ? (
                                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>✕ Reprovada{r.aprov_reprovado_motivo ? ` · ${r.aprov_reprovado_motivo}` : ''}</div>
                              ) : (() => {
                                const total = r.total_final || r.total_estimado || 0
                                const exig = niveisExigidos(total, cfg)
                                if (exig.length === 0) {
                                  return (
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button onClick={() => aprovarComprador(r)} disabled={saving}
                                        style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✓ Aprovar</button>
                                      <button onClick={() => reprovar(r)} disabled={saving}
                                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕</button>
                                    </div>
                                  )
                                }
                                const proximo = exig.find(n => !nivelAprovado(r, n))
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>✓ Comprador</span>
                                      {exig.map(n => {
                                        const ok = nivelAprovado(r, n)
                                        return (
                                          <span key={n} title={ok ? `${NIVEL_LABEL[n]} · ${nivelAprovadoPor(r, n)}` : `Aguardando ${NIVEL_LABEL[n]}`}
                                            style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 600,
                                              background: ok ? '#dcfce7' : '#f3f4f6', color: ok ? '#15803d' : '#6b7280' }}>
                                            {ok ? '✓' : '○'} {NIVEL_LABEL[n]}
                                          </span>
                                        )
                                      })}
                                    </div>
                                    {proximo && (
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => aprovarNivel(r, proximo)} disabled={saving}
                                          style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✓ Aprovar como {NIVEL_LABEL[proximo]}</button>
                                        <button onClick={() => reprovar(r)} disabled={saving}
                                          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕</button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {cards.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 8px', color: 'var(--muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
                      —
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && ativas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 50, color: 'var(--muted)' }}>
          <Package size={36} style={{ opacity: 0.3, marginBottom: 10 }} />
          <div style={{ fontSize: 14 }}>Nenhuma requisição no fluxo.</div>
          <button onClick={irParaRequisicoes}
            style={{ marginTop: 14, padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Criar requisição
          </button>
        </div>
      )}

      {!loading && atrasadas > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
          <AlertTriangle size={14} /> {atrasadas} requisição{atrasadas > 1 ? 'ões' : ''} com prazo de entrega vencido — priorize.
        </div>
      )}

      {/* Modal de limites orçamentários */}
      {showLimites && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Limites de Aprovação</h3>
              <button onClick={() => setShowLimites(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              Acima de cada valor, o nível correspondente passa a ser exigido na aprovação.
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {([
                { k: 'limite_gestor', lbl: 'Exigir Gestor acima de (R$)' },
                { k: 'limite_financeiro', lbl: 'Exigir Financeiro acima de (R$)' },
                { k: 'limite_diretoria', lbl: 'Exigir Diretoria acima de (R$)' },
              ] as const).map(f => (
                <div key={f.k}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{f.lbl}</label>
                  <input type="number" step="0.01" min="0" value={limForm[f.k]}
                    onChange={e => setLimForm(s => ({ ...s, [f.k]: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLimites(false)}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={salvarLimites} disabled={saving}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving ? 'var(--border)' : 'var(--bordo)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, ArrowRight, Package, AlertTriangle } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { fetchRequisicoes } from '../../lib/db'
import type { Requisicao, ReqStatus, ReqPrioridade } from '../../types/database'

// ── Etapas macro do fluxo de suprimentos ─────────────────────
type EtapaId = 'solicitacao' | 'cotacao' | 'aprovacao' | 'pedido' | 'recebimento' | 'finalizado'

const ETAPAS: { id: EtapaId; label: string; cor: string; bg: string; status: ReqStatus[] }[] = [
  { id: 'solicitacao', label: '1 · Solicitação',        cor: '#64748b', bg: '#f1f5f9', status: ['rascunho', 'enviada'] },
  { id: 'cotacao',     label: '2 · Cotação',            cor: '#7c3aed', bg: '#ede9fe', status: ['em_analise', 'em_cotacao'] },
  { id: 'aprovacao',   label: '3 · Aprovação',          cor: '#ca8a04', bg: '#fef9c3', status: ['parcialmente_aprovada', 'aprovada', 'reprovada'] },
  { id: 'pedido',      label: '4 · Pedido / Compra',    cor: '#0891b2', bg: '#cffafe', status: ['em_separacao', 'compra_realizada'] },
  { id: 'recebimento', label: '5 · Recebim. / Fiscal',  cor: '#ea580c', bg: '#ffedd5', status: ['prestacao_pendente', 'em_auditoria'] },
  { id: 'finalizado',  label: '6 · Finalizado',         cor: '#16a34a', bg: '#dcfce7', status: ['concluida'] },
]

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
  const [reqs, setReqs] = useState<Requisicao[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchRequisicoes(loja)
      setReqs(data)
    } finally { setLoading(false) }
  }, [loja])

  useEffect(() => { load() }, [load])

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
        <button onClick={load}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

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

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, ShoppingCart, Package, FileCheck2, TrendingDown, Clock, AlertTriangle, Truck } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { fetchRequisicoes, fetchEstoqueProdutos, fetchEstoquePerdas, fetchRupturas } from '../../lib/db'
import type { Requisicao, EstoqueProduto, EstoquePerda } from '../../types/database'

const fmtR$ = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const diasEntre = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000))

function venceEm(prod: EstoqueProduto): number | null {
  if (!prod.data_validade) return null
  return Math.round((new Date(prod.data_validade + 'T00:00:00').getTime() - Date.now()) / 86400000)
}

export default function DashboardSuprimentosPage() {
  const { loja } = useLoja()
  const [reqs, setReqs] = useState<Requisicao[]>([])
  const [prods, setProds] = useState<EstoqueProduto[]>([])
  const [perdas, setPerdas] = useState<EstoquePerda[]>([])
  const [rupturas, setRupturas] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, p, pe, ru] = await Promise.all([
        fetchRequisicoes(loja),
        fetchEstoqueProdutos(loja),
        fetchEstoquePerdas(loja).catch(() => []),
        fetchRupturas(loja).catch(() => []),
      ])
      setReqs(r); setProds(p); setPerdas(pe); setRupturas(ru)
    } finally { setLoading(false) }
  }, [loja])

  useEffect(() => { load() }, [load])

  // ── Indicadores de Compras ───────────────────────────────
  const concluidas = reqs.filter(r => r.status === 'concluida')
  const tempoMedio = concluidas.length
    ? Math.round(concluidas.reduce((a, r) => a + diasEntre(r.created_at, r.updated_at), 0) / concluidas.length)
    : 0
  const economia = concluidas.reduce((a, r) => {
    const dif = (r.total_estimado || 0) - (r.total_final || 0)
    return a + (dif > 0 ? dif : 0)
  }, 0)
  const emFluxo = reqs.filter(r => r.status !== 'concluida' && r.status !== 'cancelada').length
  const emergenciais = reqs.filter(r => r.prioridade === 'urgente' && r.status !== 'cancelada').length

  // ── Indicadores de Recebimento ───────────────────────────
  const conferidas = reqs.filter(r => r.fiscal_status && r.fiscal_status !== 'pendente')
  const divergencias = reqs.filter(r => r.fiscal_status === 'divergencia').length
  const aguardCorrecao = reqs.filter(r => r.fiscal_status === 'aguardando_correcao').length
  const idxErro = conferidas.length ? Math.round((divergencias / conferidas.length) * 100) : 0

  // ── Indicadores de Estoque ───────────────────────────────
  const emRuptura = prods.filter(p => p.nivel_atual <= 0).length
  const criticos = prods.filter(p => p.nivel_atual > 0 && p.nivel_atual <= p.nivel_minimo).length
  const vencendo = prods.filter(p => { const d = venceEm(p); return d != null && d >= 0 && d <= (p.dias_alerta || 7) }).length
  const valorEstoque = prods.reduce((a, p) => a + (p.nivel_atual * (p.preco_unitario || 0)), 0)
  const valorPerdas = perdas.reduce((a, p) => a + (p.valor_estimado || 0), 0)
  const rupturasMes = rupturas.length

  const Card = ({ icon, lbl, val, sub, cor }: { icon: React.ReactNode; lbl: string; val: string | number; sub?: string; cor: string }) => (
    <div style={{ flex: '1 1 180px', minWidth: 170, background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${cor}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: cor, marginBottom: 6 }}>{icon}<span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{lbl}</span></div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: 'var(--text)' }}>{val}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )

  const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Dashboard de Suprimentos</h2>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Indicadores de compras, estoque e recebimento — loja <strong>{loja}</strong></div>
        </div>
        <button onClick={load}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', opacity: 0.4 }} />
        </div>
      ) : (
        <>
          <Secao titulo="📦 Compras">
            <Card icon={<Clock size={15} />} lbl="Tempo médio de compra" val={`${tempoMedio} d`} sub={`${concluidas.length} requisições concluídas`} cor="#2563eb" />
            <Card icon={<TrendingDown size={15} />} lbl="Economia em cotação" val={fmtR$(economia)} sub="estimado − final (acumulado)" cor="#16a34a" />
            <Card icon={<ShoppingCart size={15} />} lbl="Em fluxo" val={emFluxo} sub="requisições em andamento" cor="#7c3aed" />
            <Card icon={<AlertTriangle size={15} />} lbl="Compras emergenciais" val={emergenciais} sub="prioridade urgente" cor="#dc2626" />
          </Secao>

          <Secao titulo="🏬 Estoque">
            <Card icon={<AlertTriangle size={15} />} lbl="Em ruptura" val={emRuptura} sub={`${rupturasMes} ocorrências registradas`} cor="#dc2626" />
            <Card icon={<Package size={15} />} lbl="Críticos" val={criticos} sub="abaixo do mínimo" cor="#d97706" />
            <Card icon={<Clock size={15} />} lbl="Vencendo" val={vencendo} sub="dentro do alerta de validade" cor="#ea580c" />
            <Card icon={<Package size={15} />} lbl="Valor em estoque" val={fmtR$(valorEstoque)} sub={`perdas: ${fmtR$(valorPerdas)}`} cor="#0891b2" />
          </Secao>

          <Secao titulo="🚚 Recebimento & Fiscal">
            <Card icon={<FileCheck2 size={15} />} lbl="Conferências fiscais" val={conferidas.length} sub="NF validadas no pipeline" cor="#16a34a" />
            <Card icon={<AlertTriangle size={15} />} lbl="Divergências" val={divergencias} sub={`${aguardCorrecao} aguardando correção`} cor="#dc2626" />
            <Card icon={<Truck size={15} />} lbl="Índice de erro" val={`${idxErro}%`} sub="divergência / conferidas" cor="#d97706" />
          </Secao>

          {(emRuptura > 0 || divergencias > 0 || vencendo > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {emRuptura > 0 && <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>⚠ {emRuptura} produto(s) em ruptura — priorize reposição.</div>}
              {vencendo > 0 && <div style={{ fontSize: 12.5, color: '#ea580c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px' }}>⏳ {vencendo} produto(s) próximos do vencimento.</div>}
              {divergencias > 0 && <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>🧾 {divergencias} nota(s) fiscal(is) com divergência pendente.</div>}
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  )
}

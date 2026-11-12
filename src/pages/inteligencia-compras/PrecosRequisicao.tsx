import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { brl, pctF, dBR, titulo } from './engine'

const sb = supabase as any

export interface ItemAnalise {
  item_id: string; produto: string; qtd: number; unidade: string; un_base?: string; status: 'ok' | 'sem_referencia'; n_compras?: number
  ultimo?: { preco: number; data: string; fornecedor: string; loja: string }; anterior_preco?: number | null; variacao_pct?: number | null; media?: number
  menor_hist?: { preco: number; fornecedor: string; data: string }; fornecedores?: { nome: string; ultimo_preco: number; data: string; menor: number }[]
  custo_estimado?: number; custo_media?: number; alerta?: string | null; origem?: string[]
}
export interface AnaliseReq { itens: ItemAnalise[]; custo_total: number; itens_com_referencia: number; itens_sem_referencia: number; gerado_em: string; regra: string }

/** Grava o snapshot da análise vinculado à requisição (momento: 'envio' | 'aprovacao'). Falha silenciosa: nunca bloqueia o fluxo. */
export async function snapshotRequisicao(reqId: string, momento: 'envio' | 'aprovacao', usuario?: string) {
  try { await sb.rpc('ic_analise_requisicao', { p_req: reqId, p_momento: momento, p_usuario: usuario || null }) } catch { /* ignora */ }
}

const ALERTA: Record<string, { t: string; c: string }> = {
  aumento_critico: { t: '🔴 Aumento crítico', c: '#DC2626' }, aumento_alerta: { t: '🟠 Aumento (alerta)', c: '#EA580C' }, aumento: { t: '🟡 Aumento', c: '#D97706' },
  reducao: { t: '🟢 Redução', c: '#1D9E75' }, suspeito: { t: '❓ Salto suspeito (unidade/embalagem?)', c: '#6B7280' },
}

export default function PrecosRequisicao({ reqId, refreshKey }: { reqId: string; refreshKey?: number }) {
  const [a, setA] = useState<AnaliseReq | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let vivo = true; setA(null); setErro('')
    sb.rpc('ic_analise_requisicao', { p_req: reqId }).then(({ data, error }: any) => { if (!vivo) return; if (error) setErro(error.message); else setA(data) })
    return () => { vivo = false }
  }, [reqId, refreshKey])
  if (erro) return <div style={{ fontSize: 12, color: '#DC2626' }}>Não foi possível carregar a inteligência de preços: {erro}</div>
  if (!a) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Calculando inteligência de preços…</div>
  const th: React.CSSProperties = { textAlign: 'left', padding: '5px 7px', fontSize: 10, color: 'var(--muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '5px 7px', fontSize: 11.5, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
  const alertas = a.itens.filter(i => i.alerta && i.alerta !== 'reducao')
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, margin: '0 0 14px', background: 'var(--card)' }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--bordo)' }}>🧠 Inteligência de preços</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 8px' }}>Custo estimado = <b>último preço pago</b> (média das últimas compras é só indicador). Itens sem histórico ficam “sem referência”, não R$ 0.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginBottom: 8 }}>
        <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>CUSTO ESTIMADO (itens com referência)</div><b style={{ fontSize: 17 }}>{brl(a.custo_total)}</b></div>
        <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>COM REFERÊNCIA / SEM</div><b style={{ fontSize: 17 }}>{a.itens_com_referencia} / {a.itens_sem_referencia}</b></div>
        <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>ALERTAS</div><b style={{ fontSize: 17, color: alertas.length ? '#DC2626' : 'inherit' }}>{alertas.length}</b></div>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Produto', 'Qtd', 'Último preço', 'Última compra', 'Média', 'Menor / fornecedores', 'Variação', 'Custo item'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{a.itens.map(i => i.status !== 'ok' ? (
            <tr key={i.item_id}><td style={td}>{i.produto}</td><td style={td}>{i.qtd} {i.unidade}</td><td style={{ ...td, color: 'var(--muted)' }} colSpan={6}>⚪ sem referência de preço no histórico</td></tr>
          ) : (
            <tr key={i.item_id} style={{ background: i.alerta && i.alerta !== 'reducao' && i.alerta !== 'suspeito' ? '#FEF2F2' : undefined }}>
              <td style={td}><b>{i.produto}</b></td><td style={td}>{i.qtd} {i.unidade}</td>
              <td style={td}><b>{brl(i.ultimo!.preco)}</b>/{i.un_base}</td>
              <td style={td}>{dBR(i.ultimo!.data)}<br /><span style={{ color: 'var(--muted)' }}>{titulo(i.ultimo!.fornecedor)}</span></td>
              <td style={td}>{brl(i.media)}</td>
              <td style={td}>{i.menor_hist ? <>{brl(i.menor_hist.preco)}<br /><span style={{ color: 'var(--muted)' }}>{titulo(i.menor_hist.fornecedor)}</span></> : '—'}{(i.fornecedores?.length || 0) > 1 && <div style={{ color: 'var(--muted)', fontSize: 10 }}>{i.fornecedores!.map(f => `${titulo(f.nome)} ${brl(f.ultimo_preco)}`).join(' · ')}</div>}</td>
              <td style={td}>{i.variacao_pct == null ? <span style={{ color: 'var(--muted)' }}>1ª referência</span> : <span style={{ color: i.alerta ? ALERTA[i.alerta]?.c : 'inherit', fontWeight: 700 }}>{pctF(i.variacao_pct)}{i.alerta && ALERTA[i.alerta] ? ' ' + ALERTA[i.alerta].t : ''}</span>}</td>
              <td style={td}><b>{brl(i.custo_estimado)}</b>{i.custo_media != null && <div style={{ color: 'var(--muted)', fontSize: 10 }}>pela média {brl(i.custo_media)}</div>}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  )
}

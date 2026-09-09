import { useState, useEffect, useCallback } from 'react'
import { Loader, RefreshCw, Download, Package } from 'lucide-react'
import { fetchRequisicaoItens } from '../../lib/db'
import type { Requisicao } from '../../types/database'

const today = () => new Date()
function inicioSemana(base = today()) { const d = new Date(base); const dow = (d.getDay()+6)%7; d.setDate(d.getDate()-dow); return d.toISOString().slice(0,10) } // segunda
function fimSemana(iniISO: string) { const d = new Date(iniISO+'T00:00:00'); d.setDate(d.getDate()+6); return d.toISOString().slice(0,10) }
const fmtDt = (d?: string|null) => d ? new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('pt-BR') : '—'

type Agg = { nome: string; un: string; qtd: number; reqs: Set<number>; forns: Set<string>; comPedido: number; totalReqs: number }

export default function PedidoSemanaView({ reqs, loja }: { reqs: Requisicao[]; loja: string }) {
  const [ini, setIni] = useState(inicioSemana())
  const [fim, setFim] = useState(fimSemana(inicioSemana()))
  const [loading, setLoading] = useState(false)
  const [linhas, setLinhas] = useState<{ nome: string; un: string; qtd: number; nReqs: number; forns: string[]; comPedido: number; totalReqs: number }[]>([])
  const [nReq, setNReq] = useState(0)

  const noLoja = (l?: string) => loja==='Todas as Lojas' || !loja || l===loja

  const consolidar = useCallback(async () => {
    setLoading(true)
    try {
      // requisições do período (exclui canceladas para não duplicar/poluir)
      const doPeriodo = reqs.filter(r => noLoja(r.loja) && r.status!=='cancelada' && (r.created_at||'').slice(0,10) >= ini && (r.created_at||'').slice(0,10) <= fim)
      setNReq(doPeriodo.length)
      const map = new Map<string, Agg>()
      await Promise.all(doPeriodo.map(async r => {
        const itens = await fetchRequisicaoItens(r.id).catch(()=>[])
        const temPedido = !!r.pedido_numero
        itens.filter(it => it.status!=='cancelado').forEach(it => {
          const k = (it.produto_nome||'').trim().toLowerCase()
          if (!k) return
          if (!map.has(k)) map.set(k, { nome: it.produto_nome, un: it.unidade||'', qtd:0, reqs:new Set(), forns:new Set(), comPedido:0, totalReqs:0 })
          const a = map.get(k)!
          a.qtd += (it.quantidade_aprovada ?? it.quantidade) || 0
          a.reqs.add(r.numero)
          if (it.fornecedor_nome) a.forns.add(it.fornecedor_nome)
        })
        // marca, por produto que apareceu nesta req, se a req já tem pedido
        const produtosDaReq = new Set(itens.filter(it=>it.status!=='cancelado').map(it=>(it.produto_nome||'').trim().toLowerCase()))
        produtosDaReq.forEach(k => { const a = map.get(k); if (a) { a.totalReqs++; if (temPedido) a.comPedido++ } })
      }))
      setLinhas(Array.from(map.values())
        .map(a => ({ nome:a.nome, un:a.un, qtd:Math.round(a.qtd*1000)/1000, nReqs:a.reqs.size, forns:Array.from(a.forns), comPedido:a.comPedido, totalReqs:a.totalReqs }))
        .sort((x,y)=> y.nReqs - x.nReqs || y.qtd - x.qtd))
    } finally { setLoading(false) }
  }, [reqs, loja, ini, fim]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { consolidar() }, [consolidar])

  const semAnterior = () => { const d = new Date(ini+'T00:00:00'); d.setDate(d.getDate()-7); const n = d.toISOString().slice(0,10); setIni(n); setFim(fimSemana(n)) }
  const semProxima  = () => { const d = new Date(ini+'T00:00:00'); d.setDate(d.getDate()+7); const n = d.toISOString().slice(0,10); setIni(n); setFim(fimSemana(n)) }

  const compraLabel = (l: typeof linhas[number]) => l.comPedido===0 ? 'Pendente' : l.comPedido>=l.totalReqs ? 'Pedido' : `Parcial (${l.comPedido}/${l.totalReqs})`
  const compraCor   = (l: typeof linhas[number]) => l.comPedido===0 ? '#B91C1C' : l.comPedido>=l.totalReqs ? '#15803D' : '#B45309'

  const exportarCSV = () => {
    const head = ['Produto','Qtd total','Unidade','Requisições','Fornecedores','Compra']
    const rows = linhas.map(l => [l.nome, String(l.qtd), l.un, String(l.nReqs), l.forns.join(' / '), compraLabel(l)])
    const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pedido_semana_${ini}_${fim}.csv`; a.click()
  }

  const card: React.CSSProperties = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', marginBottom:14 }
  const th: React.CSSProperties = { padding:'7px 9px', textAlign:'left', fontWeight:700, fontSize:10, color:'var(--muted)', borderBottom:'2px solid var(--border)', whiteSpace:'nowrap' }
  const td: React.CSSProperties = { padding:'7px 9px', fontSize:12.5, borderBottom:'1px solid var(--border)' }

  return (
    <div>
      <div style={{ ...card, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <button className="btn" style={{ padding:'6px 12px', background:'var(--bg)', color:'var(--text)', border:'1px solid var(--border)' }} onClick={semAnterior}>◀</button>
        <div style={{ flex:1, textAlign:'center', fontWeight:700, fontSize:14 }}>Semana {fmtDt(ini)} — {fmtDt(fim)} <span style={{ fontWeight:400, color:'var(--muted)', fontSize:12 }}>· {nReq} requisição(ões) · {linhas.length} produto(s)</span></div>
        <button className="btn" style={{ padding:'6px 12px', background:'var(--bg)', color:'var(--text)', border:'1px solid var(--border)' }} onClick={semProxima}>▶</button>
        <input className="form-input" type="date" style={{ width:140 }} value={ini} onChange={e=>{setIni(e.target.value); if(fim<e.target.value) setFim(e.target.value)}} />
        <input className="form-input" type="date" style={{ width:140 }} value={fim} onChange={e=>setFim(e.target.value)} />
        <button className="btn" onClick={consolidar} disabled={loading}>{loading?<Loader size={13} className="spin"/>:<RefreshCw size={13}/>} Consolidar</button>
        <button className="ib" onClick={exportarCSV} disabled={loading||!linhas.length}><Download size={13}/> CSV</button>
      </div>

      <div style={{ fontSize:12, color:'var(--muted)', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', marginBottom:14 }}>
        📦 Lista MACRO consolidando <strong>todas as requisições da semana por produto</strong> (evita duplicidade). Mostra a quantidade total, em quantas requisições o produto aparece, os fornecedores e o andamento da compra.
      </div>

      {loading && <div style={{ padding:28, textAlign:'center' }}><Loader size={22} className="spin"/></div>}
      {!loading && linhas.length===0 && <div style={{ ...card, textAlign:'center', color:'var(--muted)' }}><Package size={30} style={{ opacity:.2, display:'block', margin:'0 auto 8px' }}/>Nenhuma requisição com itens nesta semana.</div>}
      {!loading && linhas.length>0 && (
        <div style={{ ...card, overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Produto','Qtd total','Requisições','Fornecedores','Compra'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{linhas.map((l,i)=>(
              <tr key={i}>
                <td style={{ ...td, fontWeight:700 }}>{l.nome}</td>
                <td style={td}>{l.qtd} {l.un}</td>
                <td style={td}><span style={{ fontWeight:700 }}>{l.nReqs}</span></td>
                <td style={{ ...td, color:'var(--muted)' }}>{l.forns.length ? l.forns.join(', ') : '—'}</td>
                <td style={td}><span style={{ fontSize:11, fontWeight:700, color:compraCor(l) }}>{compraLabel(l)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

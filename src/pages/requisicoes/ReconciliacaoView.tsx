import { useState, useEffect, useCallback } from 'react'
import { Loader, RefreshCw, Link2, AlertTriangle, CheckCircle2, Download, X, ExternalLink } from 'lucide-react'
import {
  fetchPedidosCompra, fetchPedidosLegado, fetchRequisicaoCotacoes,
  updatePedidoCompra, insertPedidoCompra, insertPedidoCompraItens, saveAppConfig, logReqAuditoria,
} from '../../lib/db'
import type { Requisicao } from '../../types/database'

const fmtR$ = (v: number) => (Number(v)||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const fmtDt = (d?: string | null) => d ? new Date(String(d).slice(0,10) + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const reqLabel = (r: Requisicao) => `REQ-${String(r.numero).padStart(4,'0')} · ${r.titulo}`

// Um pedido "órfão" pode ser relacional (avulso) ou legado (blob app_config)
type Orfao = {
  tipo: 'relacional' | 'legado'
  id?: string            // id de pedidos_compra (relacional)
  chave?: string         // chave app_config (legado)
  valor?: Record<string, unknown>
  loja: string; fornecedor: string; total: number; data: string
}

export default function ReconciliacaoView({ reqs, loja, userName, onAbrir }: {
  reqs: Requisicao[]; loja: string; userName: string; onAbrir: (r: Requisicao) => void
}) {
  const [dtIni, setDtIni] = useState('2026-09-05')
  const [loading, setLoading] = useState(false)
  const [orfaos, setOrfaos] = useState<Orfao[]>([])
  const [semPedido, setSemPedido] = useState<Requisicao[]>([])
  const [semCotacao, setSemCotacao] = useState<Requisicao[]>([])
  const [duplicados, setDuplicados] = useState<{ chave: string; itens: Orfao[] }[]>([])
  const [vinc, setVinc] = useState<Orfao | null>(null)
  const [vincReq, setVincReq] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  const noLoja = (l?: string) => loja==='Todas as Lojas' || !loja || l===loja
  const reqsPeriodo = reqs.filter(r => noLoja(r.loja) && (r.created_at||'').slice(0,10) >= dtIni)

  const analisar = useCallback(async () => {
    setLoading(true)
    try {
      const [peds, legado] = await Promise.all([fetchPedidosCompra(loja==='Todas as Lojas'?undefined:loja), fetchPedidosLegado()])
      const chavesRelacionais = new Set(peds.map(p => p.app_config_chave).filter(Boolean))

      // 1) Pedidos SEM requisição
      const orf: Orfao[] = []
      peds.filter(p => !p.requisicao_id && (p.created_at||'').slice(0,10) >= dtIni)
        .forEach(p => orf.push({ tipo:'relacional', id:p.id, loja:p.loja, fornecedor:p.fornecedor||'—', total:Number(p.total)||0, data:(p.created_at||'').slice(0,10) }))
      legado.filter(({ chave, valor }) => !chavesRelacionais.has(chave) && !valor.requisicao_id && String(valor.em||valor.data||'').slice(0,10) >= dtIni)
        .forEach(({ chave, valor }) => orf.push({ tipo:'legado', chave, valor, loja:String(valor.loja||''), fornecedor:String(valor.fornecedor||'—'), total:Number(valor.total)||0, data:String(valor.em||valor.data||'').slice(0,10) }))
      const orfNaLoja = orf.filter(o => noLoja(o.loja))
      setOrfaos(orfNaLoja)

      // 2) Requisições que já deviam ter pedido, mas não têm
      const comprou = ['aprovada','parcialmente_aprovada','compra_realizada','recebimento_parcial','recebimento_concluido','baixa_realizada']
      const reqComPedido = new Set(peds.filter(p=>p.requisicao_id).map(p=>p.requisicao_id))
      setSemPedido(reqsPeriodo.filter(r => comprou.includes(r.status) && !r.pedido_numero && !reqComPedido.has(r.id)))

      // 3) Requisições em cotação, mas sem nenhuma cotação registrada
      const emCot = reqsPeriodo.filter(r => ['aguardando_cotacao','em_cotacao','cotacao_recebida'].includes(r.status))
      const semCot: Requisicao[] = []
      await Promise.all(emCot.map(async r => {
        const cs = await fetchRequisicaoCotacoes(r.id).catch(()=>[])
        if (!cs.length) semCot.push(r)
      }))
      setSemCotacao(semCot)

      // 4) Possíveis duplicados (mesma loja+fornecedor+total+dia)
      const grupos: Record<string, Orfao[]> = {}
      const todos: Orfao[] = peds.filter(p => noLoja(p.loja) && (p.created_at||'').slice(0,10) >= dtIni)
        .map(p => ({ tipo:'relacional' as const, id:p.id, loja:p.loja, fornecedor:p.fornecedor||'—', total:Number(p.total)||0, data:(p.created_at||'').slice(0,10) }))
      todos.forEach(o => { const k = `${o.loja}|${o.fornecedor.toLowerCase()}|${o.total.toFixed(2)}|${o.data}`; (grupos[k] ||= []).push(o) })
      setDuplicados(Object.entries(grupos).filter(([,v])=>v.length>1).map(([chave,itens])=>({ chave, itens })))
    } finally { setLoading(false) }
  }, [loja, dtIni]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { analisar() }, [analisar])

  const confirmarVinculo = async () => {
    if (!vinc || !vincReq) return
    const r = reqs.find(x => x.id === vincReq)
    if (!r) return
    setSalvando(true)
    try {
      if (vinc.tipo === 'relacional' && vinc.id) {
        await updatePedidoCompra(vinc.id, { requisicao_id: r.id, origem: 'requisicao' })
      } else if (vinc.tipo === 'legado' && vinc.chave && vinc.valor) {
        // cria o registro relacional a partir do blob e marca o blob com a requisição
        const pc = await insertPedidoCompra({
          numero: (vinc.valor.numero as string) || null, requisicao_id: r.id, loja: vinc.loja,
          fornecedor: vinc.fornecedor, status:'aberto', origem:'requisicao', total: vinc.total,
          recebido_total:0, baixa_feita:false, app_config_chave: vinc.chave,
          observacoes:'Vinculado na reconciliação', criado_por: userName,
        })
        const itens = Array.isArray(vinc.valor.itens) ? vinc.valor.itens as Record<string, unknown>[] : []
        if (itens.length) await insertPedidoCompraItens(itens.map(it => ({
          pedido_id: pc.id, requisicao_item_id: null, produto_nome: String(it.produto||''),
          unidade: String(it.un||'Unidade'), qtd_pedida: Number(it.qtd)||0, qtd_recebida:0, preco: Number(it.preco)||null,
        })))
        await saveAppConfig(vinc.chave, { ...vinc.valor, requisicao_id: r.id })
      }
      await logReqAuditoria([{ requisicao_id: r.id, entidade:'pedido', entidade_id: vinc.id||null, campo:'vinculo_reconciliacao', valor_anterior:'(sem requisição)', valor_novo:`${vinc.fornecedor} · ${fmtR$(vinc.total)}`, acao:'vinculo', usuario:userName }])
      setMsg(`Pedido vinculado a ${reqLabel(r)} ✅`)
      setVinc(null); setVincReq(''); await analisar()
    } finally { setSalvando(false) }
  }

  const exportarCSV = () => {
    const linhas = [['Categoria','Loja','Fornecedor/Título','Total/Status','Data']]
    orfaos.forEach(o => linhas.push(['Pedido sem requisição', o.loja, o.fornecedor, fmtR$(o.total), fmtDt(o.data)]))
    semPedido.forEach(r => linhas.push(['Requisição sem pedido', r.loja, reqLabel(r), r.status, fmtDt(r.created_at)]))
    semCotacao.forEach(r => linhas.push(['Em cotação sem cotação', r.loja, reqLabel(r), r.status, fmtDt(r.created_at)]))
    duplicados.forEach(g => g.itens.forEach(o => linhas.push(['Possível duplicado', o.loja, o.fornecedor, fmtR$(o.total), fmtDt(o.data)])))
    const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `reconciliacao_${dtIni}.csv`; a.click()
  }

  const card: React.CSSProperties = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', marginBottom:14 }
  const th: React.CSSProperties = { padding:'6px 9px', textAlign:'left', fontWeight:700, fontSize:10, color:'var(--muted)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }
  const td: React.CSSProperties = { padding:'6px 9px', fontSize:12, borderBottom:'1px solid var(--border)' }
  const tudoOk = !loading && !orfaos.length && !semPedido.length && !semCotacao.length && !duplicados.length

  return (
    <div>
      {msg && <div style={{ position:'fixed', bottom:24, right:24, background:'#166534', color:'white', padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:9999 }} onAnimationEnd={()=>setMsg('')}>{msg}</div>}

      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14 }}>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Reconciliação a partir de</div>
        <input className="form-input" type="date" style={{ width:150 }} value={dtIni} onChange={e=>setDtIni(e.target.value)} />
        <button className="btn" onClick={analisar} disabled={loading}>{loading?<Loader size={13} className="spin"/>:<RefreshCw size={13}/>} Reanalisar</button>
        <button className="ib" onClick={exportarCSV} disabled={loading||tudoOk}><Download size={13}/> Exportar CSV</button>
      </div>

      <div style={{ fontSize:12, color:'var(--muted)', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', marginBottom:16 }}>
        🩺 Diagnóstico das inconsistências desde a data escolhida. O religamento é <strong>assistido</strong>: nada é alterado sem você clicar em <strong>Vincular</strong> e confirmar a requisição de origem. Nenhum dado é apagado.
      </div>

      {loading && <div style={{ padding:28, textAlign:'center' }}><Loader size={22} className="spin"/></div>}

      {tudoOk && (
        <div style={{ ...card, textAlign:'center', color:'#166534' }}>
          <CheckCircle2 size={30} style={{ display:'block', margin:'0 auto 8px' }} />
          <div style={{ fontWeight:700 }}>Tudo reconciliado no período — nenhuma inconsistência encontrada.</div>
        </div>
      )}

      {!loading && orfaos.length>0 && (
        <div style={card}>
          <div style={{ fontWeight:800, fontSize:13, marginBottom:8, color:'#B45309' }}><AlertTriangle size={14} style={{ display:'inline', marginRight:5 }}/>Pedidos sem requisição ({orfaos.length})</div>
          <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Loja','Fornecedor','Total','Data','Origem',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{orfaos.map((o,idx)=>(
              <tr key={idx}>
                <td style={td}>{o.loja}</td><td style={td}>{o.fornecedor}</td><td style={td}>{fmtR$(o.total)}</td><td style={td}>{fmtDt(o.data)}</td>
                <td style={td}><span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:10, background:'var(--bg2)', color:'var(--muted)' }}>{o.tipo==='legado'?'LEGADO':'AVULSO'}</span></td>
                <td style={td}><button className="btn" style={{ padding:'4px 10px', fontSize:11 }} onClick={()=>{setVinc(o);setVincReq('')}}><Link2 size={12}/> Vincular</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {!loading && semPedido.length>0 && (
        <div style={card}>
          <div style={{ fontWeight:800, fontSize:13, marginBottom:8, color:'#DC2626' }}><AlertTriangle size={14} style={{ display:'inline', marginRight:5 }}/>Requisições aprovadas/compradas sem pedido ({semPedido.length})</div>
          <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Nº / Título','Loja','Status','Data',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{semPedido.map(r=>(
              <tr key={r.id}><td style={td}>{reqLabel(r)}</td><td style={td}>{r.loja}</td><td style={td}>{r.status}</td><td style={td}>{fmtDt(r.created_at)}</td>
                <td style={td}><button className="ib" style={{ padding:'4px 8px', fontSize:11 }} onClick={()=>onAbrir(r)}><ExternalLink size={12}/> Abrir</button></td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {!loading && semCotacao.length>0 && (
        <div style={card}>
          <div style={{ fontWeight:800, fontSize:13, marginBottom:8, color:'#7C3AED' }}><AlertTriangle size={14} style={{ display:'inline', marginRight:5 }}/>Em cotação sem nenhuma cotação registrada ({semCotacao.length})</div>
          <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Nº / Título','Loja','Status','Data',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{semCotacao.map(r=>(
              <tr key={r.id}><td style={td}>{reqLabel(r)}</td><td style={td}>{r.loja}</td><td style={td}>{r.status}</td><td style={td}>{fmtDt(r.created_at)}</td>
                <td style={td}><button className="ib" style={{ padding:'4px 8px', fontSize:11 }} onClick={()=>onAbrir(r)}><ExternalLink size={12}/> Abrir</button></td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {!loading && duplicados.length>0 && (
        <div style={card}>
          <div style={{ fontWeight:800, fontSize:13, marginBottom:8, color:'#B45309' }}><AlertTriangle size={14} style={{ display:'inline', marginRight:5 }}/>Possíveis pedidos duplicados ({duplicados.length} grupo(s))</div>
          {duplicados.map(g=>(
            <div key={g.chave} style={{ fontSize:12, padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
              <strong>{g.itens[0].fornecedor}</strong> · {g.itens[0].loja} · {fmtR$(g.itens[0].total)} · {fmtDt(g.itens[0].data)} — <span style={{ color:'#DC2626', fontWeight:700 }}>{g.itens.length}× iguais</span>
            </div>
          ))}
        </div>
      )}

      {vinc && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--card)', borderRadius:14, padding:22, width:460, maxWidth:'92vw', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:15 }}>Vincular pedido à requisição</div>
              <button className="ib rd" onClick={()=>setVinc(null)}><X size={15}/></button>
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12 }}>
              Pedido: <strong>{vinc.fornecedor}</strong> · {vinc.loja} · {fmtR$(vinc.total)} · {fmtDt(vinc.data)}
            </div>
            <label className="form-label">Requisição de origem</label>
            <select className="form-input" value={vincReq} onChange={e=>setVincReq(e.target.value)}>
              <option value="">Selecione...</option>
              {reqs.filter(r=>noLoja(r.loja)).slice(0,300).map(r=><option key={r.id} value={r.id}>{reqLabel(r)}</option>)}
            </select>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button className="ib" onClick={()=>setVinc(null)}>Cancelar</button>
              <button className="btn" disabled={!vincReq||salvando} onClick={confirmarVinculo}>{salvando?<Loader size={13} className="spin"/>:<Link2 size={13}/>} Confirmar vínculo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

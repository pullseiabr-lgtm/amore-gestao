import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const sb = supabase as any
const fmtR$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtD = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const norm = (s?: string | null) => (s || '').trim().toLowerCase()

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }
const th: React.CSSProperties = { textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 12 }

/** Relatórios gerenciais da Cotação Inteligente (§16). */
export default function RelatoriosGerenciais({ loja, toast }: { loja: string; toast: (m: string) => void }) {
  const [reqs, setReqs] = useState<any[]>([])
  const [cots, setCots] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [ci, setCi] = useState<any[]>([])
  const [campeoesCfg, setCampeoesCfg] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(90)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let rq = sb.from('requisicoes').select('id,numero,titulo,loja,responsavel_nome,created_at')
      if (loja && loja !== 'Todas as Lojas') rq = rq.eq('loja', loja)
      const { data: rs } = await rq.order('numero', { ascending: false }).limit(500)
      const reqIds = (rs || []).map((r: any) => r.id)
      let cotsD: any[] = [], itemsD: any[] = [], ciD: any[] = []
      if (reqIds.length) {
        const [{ data: c }, { data: it }] = await Promise.all([
          sb.from('requisicao_cotacoes').select('id,requisicao_id,fornecedor_nome,status,total,prazo_entrega').in('requisicao_id', reqIds),
          sb.from('requisicao_itens').select('id,requisicao_id,produto_nome,quantidade,unidade').in('requisicao_id', reqIds),
        ])
        cotsD = c || []; itemsD = it || []
        const cotIds = cotsD.map((x: any) => x.id)
        if (cotIds.length) ciD = (await sb.from('requisicao_cotacao_itens').select('cotacao_id,item_id,preco_unitario,disponivel').in('cotacao_id', cotIds)).data || []
      }
      const cfg = (await sb.from('app_config').select('chave,valor').like('chave', 'cot_campeoes:%')).data || []
      const cfgMap: Record<string, any> = {}; cfg.forEach((r: any) => cfgMap[r.chave.replace('cot_campeoes:', '')] = r.valor || {})
      setReqs(rs || []); setCots(cotsD); setItems(itemsD); setCi(ciD); setCampeoesCfg(cfgMap)
    } catch (e) { toast('Erro ao carregar relatórios: ' + (e as Error).message) }
    finally { setLoading(false) }
  }, [loja, toast])
  useEffect(() => { load() }, [load])

  const dados = useMemo(() => {
    const lim = Date.now() - dias * 864e5
    const reqOk = reqs.filter(r => new Date(r.created_at).getTime() >= lim)
    const reqIds = new Set(reqOk.map(r => r.id))
    const reqById: Record<string, any> = {}; reqOk.forEach(r => reqById[r.id] = r)
    const cotById: Record<string, any> = {}; cots.forEach(c => { if (reqIds.has(c.requisicao_id)) cotById[c.id] = c })
    const itById: Record<string, any> = {}; const itByReq: Record<string, any[]> = {}
    items.forEach(i => { if (reqIds.has(i.requisicao_id)) { itById[i.id] = i; (itByReq[i.requisicao_id] = itByReq[i.requisicao_id] || []).push(i) } })
    // preços por item
    const priceByItem: Record<string, { cotId: string; p: number }[]> = {}
    ci.forEach(r => { const p = Number(r.preco_unitario) || 0; if (r.disponivel === false || p <= 0) return; if (!cotById[r.cotacao_id]) return; (priceByItem[r.item_id] = priceByItem[r.item_id] || []).push({ cotId: r.cotacao_id, p }) })

    // por item: min, max, economia, variação, sem concorrência
    const perItem = Object.entries(priceByItem).map(([iid, arr]) => {
      const it = itById[iid]; if (!it) return null
      const ps = arr.map(x => x.p); const min = Math.min(...ps), max = Math.max(...ps)
      const bestCot = arr.reduce((m, x) => x.p < m.p ? x : m)
      return { iid, nome: it.produto_nome, req: reqById[it.requisicao_id], qtd: it.quantidade, un: it.unidade, min, max, nForn: ps.length, economia: (max - min) * it.quantidade, varPct: min > 0 ? (max - min) / min * 100 : 0, bestCot: bestCot.cotId }
    }).filter(Boolean) as any[]
    const bestByItem: Record<string, number> = {}; perItem.forEach(x => bestByItem[x.iid] = x.min)

    const economiaTotal = perItem.reduce((s, x) => s + x.economia, 0)
    const valorMenores = perItem.reduce((s, x) => s + x.min * x.qtd, 0)
    const semConc = perItem.filter(x => x.nForn === 1)

    // por fornecedor
    const forn: Record<string, any> = {}
    Object.values(cotById).forEach((c: any) => {
      const k = norm(c.fornecedor_nome); if (!forn[k]) forn[k] = { nome: c.fornecedor_nome, recebidas: 0, respondidas: 0, atendSoma: 0, campeoes: 0, valorVenc: 0 }
      forn[k].recebidas++
      const its = itByReq[c.requisicao_id] || []
      const cotadosDaCot = ci.filter(r => r.cotacao_id === c.id && r.disponivel !== false && Number(r.preco_unitario) > 0)
      if (cotadosDaCot.length) forn[k].respondidas++
      forn[k].atendSoma += its.length ? cotadosDaCot.length / its.length : 0
    })
    ci.forEach(r => { const p = Number(r.preco_unitario) || 0; if (r.disponivel === false || p <= 0) return; const c = cotById[r.cotacao_id]; if (!c) return; if (bestByItem[r.item_id] != null && p === bestByItem[r.item_id]) { const k = norm(c.fornecedor_nome); if (forn[k]) { forn[k].campeoes++; const it = itById[r.item_id]; forn[k].valorVenc += p * (it?.quantidade || 0) } } })
    const fornArr = Object.values(forn).map((f: any) => ({ ...f, pctResp: f.recebidas ? Math.round(f.respondidas / f.recebidas * 100) : 0, atendMedio: f.recebidas ? Math.round(f.atendSoma / f.recebidas * 100) : 0 }))

    // por requisição (economia por período)
    const perReq = reqOk.map(r => {
      const its = perItem.filter(x => x.req?.id === r.id)
      const fornSet = new Set<string>(); (cots.filter(c => c.requisicao_id === r.id)).forEach(c => fornSet.add(norm(c.fornecedor_nome)))
      return { req: r, itens: its.length, economia: its.reduce((s, x) => s + x.economia, 0), valor: its.reduce((s, x) => s + x.min * x.qtd, 0), forns: fornSet.size }
    }).filter(x => x.itens > 0)

    // justificativas de escolha manual
    const justif: any[] = []
    Object.entries(campeoesCfg).forEach(([reqId, mp]) => {
      if (!reqIds.has(reqId)) return
      Object.entries(mp as Record<string, any>).forEach(([iid, sel]: any) => {
        if (!sel?.motivo) return
        const it = itById[iid]; const c = cotById[sel.cotId]
        if (!it || !c) return
        const arr = priceByItem[iid] || []; const min = arr.length ? Math.min(...arr.map(x => x.p)) : 0
        const escolhido = arr.find(x => x.cotId === sel.cotId)?.p ?? null
        justif.push({ produto: it.produto_nome, fornecedor: c.fornecedor_nome, motivo: sel.motivo, req: reqById[reqId], acima: escolhido != null && escolhido > min })
      })
    })

    return {
      economiaTotal, valorMenores, nReq: perReq.length, nForn: fornArr.length, nProdutos: perItem.length,
      fornArr: fornArr.sort((a, b) => b.campeoes - a.campeoes || b.pctResp - a.pctResp),
      variacao: perItem.slice().filter(x => x.nForn > 1).sort((a, b) => b.varPct - a.varPct).slice(0, 15),
      semConc, perReq: perReq.sort((a, b) => b.economia - a.economia), justif,
    }
  }, [reqs, cots, items, ci, campeoesCfg, dias])

  const kpi = (l: string, v: string, cor?: string, sub?: string) => (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{l}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: cor || 'var(--text)' }}>{v}</div>
      {sub && <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )

  return <div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
      <select value={dias} onChange={e => setDias(Number(e.target.value))} style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5 }}>
        <option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={180}>Últimos 6 meses</option><option value={3650}>Tudo</option>
      </select>
      <button className="btn" onClick={load} style={{ padding: '7px 11px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}><RefreshCw size={14} /></button>
    </div>

    {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={26} /></div> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 9, marginBottom: 14 }}>
        {kpi('Economia estimada', fmtR$(dados.economiaTotal), '#15803D', 'menor vs maior preço por item')}
        {kpi('Valor pelos menores', fmtR$(dados.valorMenores), undefined, 'se comprar tudo no menor')}
        {kpi('Cotações no período', String(dados.nReq))}
        {kpi('Fornecedores', String(dados.nForn), undefined, 'participantes')}
        {kpi('Produtos cotados', String(dados.nProdutos))}
        {kpi('Sem concorrência', String(dados.semConc.length), dados.semConc.length ? '#B45309' : '#15803D', 'só 1 fornecedor')}
      </div>

      {/* Fornecedores com mais campeões / índice de resposta */}
      <div style={card}>
        <b style={{ fontSize: 13.5 }}>🏆 Fornecedores — campeões, resposta e atendimento</b>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead><tr><th style={th}>Fornecedor</th><th style={{ ...th, textAlign: 'right' }}>Cotações</th><th style={{ ...th, textAlign: 'right' }}>Respondeu</th><th style={{ ...th, textAlign: 'right' }}>% resposta</th><th style={{ ...th, textAlign: 'right' }}>Atend. médio</th><th style={{ ...th, textAlign: 'right' }}>Campeões</th><th style={{ ...th, textAlign: 'right' }}>Valor vencido</th></tr></thead>
            <tbody>
              {dados.fornArr.length === 0 ? <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>Sem dados no período.</td></tr> :
                dados.fornArr.map((f: any) => <tr key={f.nome}>
                  <td style={{ ...td, fontWeight: 600 }}>{f.nome}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{f.recebidas}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{f.respondidas}</td>
                  <td style={{ ...td, textAlign: 'right', color: f.pctResp >= 70 ? '#15803D' : f.pctResp >= 40 ? '#B45309' : '#B91C1C', fontWeight: 700 }}>{f.pctResp}%</td>
                  <td style={{ ...td, textAlign: 'right' }}>{f.atendMedio}%</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#15803D' }}>{f.campeoes}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtR$(f.valorVenc)}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Produtos com maior variação */}
      <div style={card}>
        <b style={{ fontSize: 13.5 }}>📈 Produtos com maior variação de preço <span style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--muted)' }}>— onde negociar rende mais</span></b>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead><tr><th style={th}>Produto</th><th style={th}>REQ</th><th style={{ ...th, textAlign: 'right' }}>Menor</th><th style={{ ...th, textAlign: 'right' }}>Maior</th><th style={{ ...th, textAlign: 'right' }}>Variação</th><th style={{ ...th, textAlign: 'right' }}>Fornec.</th></tr></thead>
            <tbody>
              {dados.variacao.length === 0 ? <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>Sem itens com 2+ cotações.</td></tr> :
                dados.variacao.map((x: any) => <tr key={x.iid}>
                  <td style={{ ...td, fontWeight: 600 }}>{x.nome}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{x.req ? 'REQ-' + String(x.req.numero).padStart(4, '0') : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#15803D' }}>{fmtR$(x.min)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#B91C1C' }}>{fmtR$(x.max)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#B45309' }}>+{x.varPct.toFixed(0)}%</td>
                  <td style={{ ...td, textAlign: 'right' }}>{x.nForn}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Economia por cotação */}
      <div style={card}>
        <b style={{ fontSize: 13.5 }}>💰 Economia por cotação</b>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead><tr><th style={th}>Cotação</th><th style={th}>Data</th><th style={{ ...th, textAlign: 'right' }}>Itens</th><th style={{ ...th, textAlign: 'right' }}>Fornec.</th><th style={{ ...th, textAlign: 'right' }}>Valor (menores)</th><th style={{ ...th, textAlign: 'right' }}>Economia</th></tr></thead>
            <tbody>
              {dados.perReq.length === 0 ? <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>Sem cotações no período.</td></tr> :
                dados.perReq.map((x: any) => <tr key={x.req.id}>
                  <td style={{ ...td, fontWeight: 600 }}>REQ-{String(x.req.numero).padStart(4, '0')} · {x.req.titulo}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{fmtD(x.req.created_at)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{x.itens}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{x.forns}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtR$(x.valor)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#15803D' }}>{fmtR$(x.economia)}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Produtos sem concorrência */}
      {dados.semConc.length > 0 && <div style={card}>
        <b style={{ fontSize: 13.5 }}>⚠ Produtos sem concorrência ({dados.semConc.length}) <span style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--muted)' }}>— buscar mais fornecedores</span></b>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {dados.semConc.map((x: any) => <span key={x.iid} style={{ fontSize: 11.5, background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', borderRadius: 20, padding: '3px 10px' }}>{x.nome} · {fmtR$(x.min)}</span>)}
        </div>
      </div>}

      {/* Justificativas de escolha manual */}
      {dados.justif.length > 0 && <div style={card}>
        <b style={{ fontSize: 13.5 }}>📝 Compras fora do menor preço — justificativas ({dados.justif.length})</b>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead><tr><th style={th}>Produto</th><th style={th}>Fornecedor escolhido</th><th style={th}>REQ</th><th style={th}>Motivo</th></tr></thead>
            <tbody>
              {dados.justif.map((j: any, i: number) => <tr key={i}>
                <td style={{ ...td, fontWeight: 600 }}>{j.produto}</td>
                <td style={td}>{j.fornecedor}{j.acima && <span style={{ color: '#B45309', fontSize: 10.5 }}> (acima do menor)</span>}</td>
                <td style={{ ...td, color: 'var(--muted)' }}>{j.req ? 'REQ-' + String(j.req.numero).padStart(4, '0') : '—'}</td>
                <td style={td}>{j.motivo}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
    </>}
  </div>
}

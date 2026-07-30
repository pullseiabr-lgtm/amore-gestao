import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Search, X, RefreshCw, MapPin, Phone, Star, Trophy } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const sb = supabase as any
const fmtR$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtD = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const norm = (s?: string | null) => (s || '').trim().toLowerCase()
const parseObs = (o?: string | null): Record<string, any> => { if (!o) return {}; try { const v = JSON.parse(o); return (v && typeof v === 'object') ? v : {} } catch { return {} } }
const soDig = (s?: string | null) => (s || '').replace(/\D/g, '')

type Ordem = 'campeao' | 'cotacoes' | 'prazo' | 'avaliacao' | 'nome'
const ORDENS: { k: Ordem; l: string }[] = [
  { k: 'campeao', l: 'Mais preços campeões' },
  { k: 'cotacoes', l: 'Mais cotações' },
  { k: 'prazo', l: 'Melhor prazo' },
  { k: 'avaliacao', l: 'Melhor avaliação' },
  { k: 'nome', l: 'A–Z' },
]

/** Painel de Fornecedores (§2) + histórico de preços por produto (§5). */
export default function PainelFornecedores({ loja, toast }: { loja: string; toast: (m: string) => void }) {
  const [forns, setForns] = useState<any[]>([])
  const [cots, setCots] = useState<any[]>([])
  const [items, setItems] = useState<Record<string, any>>({})
  const [ci, setCi] = useState<any[]>([])
  const [best, setBest] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('campeao')
  const [sel, setSel] = useState<string | null>(null) // fornecedor nome

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let fq = sb.from('fornecedores').select('*')
      if (loja && loja !== 'Todas as Lojas') fq = fq.eq('loja', loja)
      let rq = sb.from('requisicoes').select('id,numero,loja')
      if (loja && loja !== 'Todas as Lojas') rq = rq.eq('loja', loja)
      const [{ data: fs }, { data: reqs }] = await Promise.all([fq, rq.order('numero', { ascending: false }).limit(400)])
      const reqIds = (reqs || []).map((r: any) => r.id)
      let cotsD: any[] = [], itemsD: any[] = [], ciD: any[] = []
      if (reqIds.length) {
        const [{ data: c }, { data: it }] = await Promise.all([
          sb.from('requisicao_cotacoes').select('*').in('requisicao_id', reqIds),
          sb.from('requisicao_itens').select('id,requisicao_id,produto_nome,quantidade,unidade').in('requisicao_id', reqIds),
        ])
        cotsD = c || []; itemsD = it || []
        const cotIds = cotsD.map((x: any) => x.id)
        if (cotIds.length) ciD = (await sb.from('requisicao_cotacao_itens').select('cotacao_id,item_id,preco_unitario,disponivel,observacoes').in('cotacao_id', cotIds)).data || []
      }
      const itMap: Record<string, any> = {}; itemsD.forEach((i: any) => itMap[i.id] = i)
      const pricesByItem: Record<string, number[]> = {}
      ciD.forEach((r: any) => { const p = Number(r.preco_unitario) || 0; if (r.disponivel !== false && p > 0) (pricesByItem[r.item_id] = pricesByItem[r.item_id] || []).push(p) })
      const bestByItem: Record<string, number> = {}; Object.entries(pricesByItem).forEach(([k, arr]) => bestByItem[k] = Math.min(...arr))
      setForns(fs || []); setCots(cotsD); setItems(itMap); setCi(ciD); setBest(bestByItem)
    } catch (e) { toast('Erro ao carregar fornecedores: ' + (e as Error).message) }
    finally { setLoading(false) }
  }, [loja, toast])
  useEffect(() => { load() }, [load])

  // agrega por nome de fornecedor (cotações usam fornecedor_nome)
  const stats = useMemo(() => {
    const ciByCot: Record<string, any[]> = {}; ci.forEach(r => { (ciByCot[r.cotacao_id] = ciByCot[r.cotacao_id] || []).push(r) })
    const tableByNome: Record<string, any> = {}; forns.forEach(f => { tableByNome[norm(f.nome)] = f })
    const nomes = new Set<string>([...forns.map(f => norm(f.nome)), ...cots.map(c => norm(c.fornecedor_nome))])
    const out: any[] = []
    nomes.forEach(nn => {
      if (!nn) return
      const tf = tableByNome[nn]
      const nome = tf?.nome || cots.find(c => norm(c.fornecedor_nome) === nn)?.fornecedor_nome || nn
      const myCots = cots.filter(c => norm(c.fornecedor_nome) === nn)
      const respondidas = myCots.filter(c => (ciByCot[c.id] || []).some((r: any) => r.disponivel !== false && Number(r.preco_unitario) > 0))
      let campeao = 0
      const hist: Record<string, { nome: string; precos: number[]; ultimo: number | null; ultimoEm: string; campeao: number }> = {}
      myCots.forEach(c => (ciByCot[c.id] || []).forEach((r: any) => {
        const p = Number(r.preco_unitario) || 0; if (r.disponivel === false || p <= 0) return
        const it = items[r.item_id]; if (!it) return
        const k = norm(it.produto_nome)
        if (!hist[k]) hist[k] = { nome: it.produto_nome, precos: [], ultimo: null, ultimoEm: '', campeao: 0 }
        hist[k].precos.push(p)
        const em = c.updated_at || c.created_at || ''
        if (em >= hist[k].ultimoEm) { hist[k].ultimoEm = em; hist[k].ultimo = p }
        const isCamp = best[r.item_id] != null && p === best[r.item_id]
        if (isCamp) { campeao++; hist[k].campeao++ }
      }))
      const ultima = respondidas.slice().sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))[0]
      const prazos = myCots.map(c => c.prazo_entrega).filter((x: any) => x != null) as number[]
      const prazoMedio = prazos.length ? Math.round(prazos.reduce((s, x) => s + x, 0) / prazos.length) : (tf?.prazo_entrega_dias ?? null)
      const conds: Record<string, number> = {}
      myCots.forEach(c => { const cd = parseObs(c.observacoes).condicao_pagamento; if (cd) conds[cd] = (conds[cd] || 0) + 1 })
      const condicao = Object.entries(conds).sort((a, b) => b[1] - a[1])[0]?.[0] || tf?.forma_pagamento || '—'
      out.push({
        nome, tf, cidade: tf?.cidade, estado: tf?.estado, categorias: tf?.categorias, contato: tf?.contato_nome,
        zap: soDig(tf?.whatsapp || tf?.telefone), nota: tf?.nota_avaliacao, ativo: tf ? tf.ativo !== false : true,
        recebidas: myCots.length, respondidas: respondidas.length, campeao, prazoMedio, condicao,
        ultimaEm: ultima?.updated_at || ultima?.created_at || null, ultimaValor: ultima?.total || 0,
        hist: Object.values(hist).sort((a, b) => b.campeao - a.campeao || b.precos.length - a.precos.length),
      })
    })
    return out
  }, [forns, cots, ci, items, best])

  const filtrados = useMemo(() => {
    let arr = stats
    if (busca) { const t = busca.toLowerCase(); arr = arr.filter(f => f.nome.toLowerCase().includes(t) || (f.categorias || '').toLowerCase().includes(t) || (f.cidade || '').toLowerCase().includes(t)) }
    const by: Record<Ordem, (a: any, b: any) => number> = {
      campeao: (a, b) => b.campeao - a.campeao || b.respondidas - a.respondidas,
      cotacoes: (a, b) => b.recebidas - a.recebidas,
      prazo: (a, b) => (a.prazoMedio ?? 9999) - (b.prazoMedio ?? 9999),
      avaliacao: (a, b) => (b.nota ?? 0) - (a.nota ?? 0),
      nome: (a, b) => a.nome.localeCompare(b.nome),
    }
    return arr.slice().sort(by[ordem])
  }, [stats, busca, ordem])

  const detalhe = sel ? stats.find(f => f.nome === sel) : null
  const inp: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5, boxSizing: 'border-box' }

  return <div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Fornecedor, categoria ou cidade…" style={{ ...inp, width: '100%', paddingLeft: 30 }} />
      </div>
      <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} style={inp}>{ORDENS.map(o => <option key={o.k} value={o.k}>Ordenar: {o.l}</option>)}</select>
      <button className="btn" onClick={load} style={{ padding: '7px 11px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}><RefreshCw size={14} /></button>
    </div>
    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{filtrados.length} fornecedor(es) · o mapa geográfico é complementar e pode ser adicionado depois.</div>

    {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={26} /></div>
      : filtrados.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>Nenhum fornecedor encontrado.</div>
      : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
          {filtrados.map(f => (
            <div key={f.nome} onClick={() => setSel(f.nome)} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: f.campeao ? '3px solid #15803D' : '3px solid var(--border)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14, flex: 1 }}>{f.nome}</strong>
                {!f.ativo && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: '#FEE2E2', color: '#B91C1C' }}>inativo</span>}
                {f.nota != null && <span style={{ fontSize: 11, color: '#B45309', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Star size={11} /> {Number(f.nota).toFixed(1)}</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                {f.cidade && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={10} /> {f.cidade}{f.estado ? `/${f.estado}` : ''}</span>}
                {f.contato && <span>· {f.contato}</span>}
                {f.zap && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Phone size={10} /> {f.zap}</span>}
              </div>
              {f.categorias && <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>{f.categorias}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11.5 }}>
                <div><Trophy size={11} style={{ color: '#15803D', verticalAlign: '-1px' }} /> <b>{f.campeao}</b> campeão(ões)</div>
                <div><span style={{ color: 'var(--muted)' }}>Cotações:</span> <b>{f.respondidas}/{f.recebidas}</b></div>
                <div><span style={{ color: 'var(--muted)' }}>Prazo:</span> <b>{f.prazoMedio != null ? `${f.prazoMedio}d` : '—'}</b></div>
                <div><span style={{ color: 'var(--muted)' }}>Últ.:</span> <b>{f.ultimaEm ? fmtD(f.ultimaEm) : '—'}</b></div>
                <div style={{ gridColumn: '1 / 3' }}><span style={{ color: 'var(--muted)' }}>Pagto:</span> <b>{f.condicao}</b></div>
              </div>
            </div>
          ))}
        </div>}

    {/* Detalhe: histórico de preços por produto */}
    {detalhe && (
      <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }} onClick={() => setSel(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 760, margin: '24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <strong style={{ fontSize: 16 }}>🏷️ {detalhe.nome}</strong>
            <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            {detalhe.cidade ? `${detalhe.cidade}${detalhe.estado ? '/' + detalhe.estado : ''} · ` : ''}{detalhe.contato ? `${detalhe.contato} · ` : ''}{detalhe.zap ? `📲 ${detalhe.zap} · ` : ''}{detalhe.recebidas} cotação(ões) · {detalhe.campeao} campeão(ões) · pagto {detalhe.condicao}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Histórico de preços por produto</div>
          {detalhe.hist.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Este fornecedor ainda não respondeu preços.</div>
            : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
                  <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}>
                    <th style={{ padding: 6 }}>Produto</th><th style={{ textAlign: 'right' }}>Último</th><th style={{ textAlign: 'right' }}>Menor</th><th style={{ textAlign: 'right' }}>Maior</th><th style={{ textAlign: 'right' }}>Médio</th><th style={{ textAlign: 'right' }}>Variação</th><th style={{ textAlign: 'right' }}>Cotado</th><th style={{ textAlign: 'right' }}>Campeão</th>
                  </tr></thead>
                  <tbody>
                    {detalhe.hist.map((h: any) => {
                      const min = Math.min(...h.precos), max = Math.max(...h.precos), avg = h.precos.reduce((s: number, x: number) => s + x, 0) / h.precos.length
                      const varPct = min > 0 ? ((max - min) / min) * 100 : 0
                      return <tr key={h.nome} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 6 }}>{h.nome}</td>
                        <td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>{h.ultimo != null ? fmtR$(h.ultimo) : '—'}</td>
                        <td style={{ padding: 6, textAlign: 'right', color: '#15803D' }}>{fmtR$(min)}</td>
                        <td style={{ padding: 6, textAlign: 'right', color: '#B91C1C' }}>{fmtR$(max)}</td>
                        <td style={{ padding: 6, textAlign: 'right', color: 'var(--muted)' }}>{fmtR$(avg)}</td>
                        <td style={{ padding: 6, textAlign: 'right', color: varPct > 0 ? '#B45309' : 'var(--muted)' }}>{varPct > 0 ? '+' + varPct.toFixed(0) + '%' : '—'}</td>
                        <td style={{ padding: 6, textAlign: 'right', color: 'var(--muted)' }}>{h.precos.length}×</td>
                        <td style={{ padding: 6, textAlign: 'right', fontWeight: 700, color: h.campeao ? '#15803D' : 'var(--muted)' }}>{h.campeao}×</td>
                      </tr>
                    })}
                  </tbody>
                </table>
              </div>}
        </div>
      </div>
    )}
  </div>
}

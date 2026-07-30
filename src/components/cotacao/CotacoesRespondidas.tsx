import { useState, useEffect, useCallback } from 'react'
import { Loader2, Search, Eye, X, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const sb = supabase as any
const fmtR$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDT = (d?: string | null) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const parseObs = (o?: string | null): Record<string, any> => { if (!o) return {}; try { const v = JSON.parse(o); return (v && typeof v === 'object') ? v : { obs: o } } catch { return { obs: o } } }
const parseMarca = (o?: string | null): string => { try { return JSON.parse(o || '{}').marca || '' } catch { return '' } }

const ST: Record<string, { l: string; c: string; bg: string }> = {
  aguardando: { l: 'Aguardando', c: '#B45309', bg: '#FEF3C7' },
  respondida: { l: 'Respondida', c: '#0369A1', bg: '#E0F2FE' },
  aprovada: { l: 'Aprovada', c: '#15803D', bg: '#DCFCE7' },
  rejeitada: { l: 'Rejeitada', c: '#6B7280', bg: '#F3F4F6' },
}

/** Central de Cotações Respondidas — cada resposta de fornecedor em card, com filtros e "ver cotação preenchida". */
export default function CotacoesRespondidas({ loja, toast, onAbrir }: {
  loja: string
  toast: (m: string) => void
  onAbrir?: (reqId: string) => void
}) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fDe, setFDe] = useState('')
  const [fAte, setFAte] = useState('')
  const [soCampeao, setSoCampeao] = useState(false)
  const [soRespondida, setSoRespondida] = useState(true)
  const [ver, setVer] = useState<any | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = sb.from('requisicoes').select('id,numero,titulo,loja,responsavel_nome,setor,created_at')
      if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
      const { data: reqs } = await q.order('numero', { ascending: false }).limit(300)
      const reqIds = (reqs || []).map((r: any) => r.id)
      if (!reqIds.length) { setRows([]); setLoading(false); return }
      const [{ data: cots }, { data: items }] = await Promise.all([
        sb.from('requisicao_cotacoes').select('*').in('requisicao_id', reqIds),
        sb.from('requisicao_itens').select('id,requisicao_id,produto_nome,quantidade,unidade').in('requisicao_id', reqIds),
      ])
      const cotIds = (cots || []).map((c: any) => c.id)
      const ci = cotIds.length ? (await sb.from('requisicao_cotacao_itens').select('cotacao_id,item_id,preco_unitario,disponivel,observacoes').in('cotacao_id', cotIds)).data || [] : []
      const reqById: Record<string, any> = {}; (reqs || []).forEach((r: any) => reqById[r.id] = r)
      const itemsByReq: Record<string, any[]> = {}; (items || []).forEach((i: any) => { (itemsByReq[i.requisicao_id] = itemsByReq[i.requisicao_id] || []).push(i) })
      const ciByCot: Record<string, any[]> = {}; ci.forEach((r: any) => { (ciByCot[r.cotacao_id] = ciByCot[r.cotacao_id] || []).push(r) })
      const pricesByItem: Record<string, number[]> = {}
      ci.forEach((r: any) => { const p = Number(r.preco_unitario) || 0; if (r.disponivel !== false && p > 0) (pricesByItem[r.item_id] = pricesByItem[r.item_id] || []).push(p) })
      const bestByItem: Record<string, number> = {}
      Object.entries(pricesByItem).forEach(([iid, arr]) => { bestByItem[iid] = Math.min(...arr) })
      const out = (cots || []).map((c: any) => {
        const req = reqById[c.requisicao_id]; if (!req) return null
        const its = itemsByReq[c.requisicao_id] || []
        const myCi = ciByCot[c.id] || []
        const cotados = myCi.filter((r: any) => r.disponivel !== false && Number(r.preco_unitario) > 0)
        const total = Number(c.total) || cotados.reduce((s: number, r: any) => { const it = its.find((x: any) => x.id === r.item_id); return s + (Number(r.preco_unitario) || 0) * (it?.quantidade || 0) }, 0)
        let campeao = 0
        cotados.forEach((r: any) => { if (bestByItem[r.item_id] != null && Number(r.preco_unitario) === bestByItem[r.item_id]) campeao++ })
        return { c, req, its, myCi, nItens: its.length, cotados: cotados.length, semPreco: its.length - cotados.length, total, campeao, obs: parseObs(c.observacoes), respondeu: cotados.length > 0 }
      }).filter(Boolean) as any[]
      out.sort((a, b) => (b.c.updated_at || b.c.created_at || '').localeCompare(a.c.updated_at || a.c.created_at || ''))
      setRows(out)
    } catch (e) { toast('Erro ao carregar cotações: ' + (e as Error).message) }
    finally { setLoading(false) }
  }, [loja, toast])
  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    if (soRespondida && !r.respondeu) return false
    if (soCampeao && !r.campeao) return false
    if (fStatus && r.c.status !== fStatus) return false
    const dt = (r.c.updated_at || r.c.created_at || '').slice(0, 10)
    if (fDe && dt < fDe) return false
    if (fAte && dt > fAte) return false
    if (busca) { const t = busca.toLowerCase(); if (!((r.c.fornecedor_nome || '').toLowerCase().includes(t) || String(r.req.numero).includes(t) || (r.req.titulo || '').toLowerCase().includes(t))) return false }
    return true
  })

  const respondidas = rows.filter(r => r.respondeu).length
  const inp: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5, boxSizing: 'border-box' }
  const fld = (l: string, v: string) => <div style={{ fontSize: 11.5 }}><span style={{ color: 'var(--muted)' }}>{l}: </span><b>{v}</b></div>

  return <div>
    {/* filtros */}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Fornecedor, nº ou título…" style={{ ...inp, width: '100%', paddingLeft: 30 }} />
      </div>
      <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inp}>
        <option value="">Todos os status</option>
        {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
      </select>
      <label style={{ fontSize: 11.5, color: 'var(--muted)' }}>Resp. de <input type="date" value={fDe} onChange={e => setFDe(e.target.value)} style={{ ...inp, marginLeft: 4 }} /></label>
      <label style={{ fontSize: 11.5, color: 'var(--muted)' }}>até <input type="date" value={fAte} onChange={e => setFAte(e.target.value)} style={{ ...inp, marginLeft: 4 }} /></label>
      <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={soRespondida} onChange={e => setSoRespondida(e.target.checked)} /> só respondidas</label>
      <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={soCampeao} onChange={e => setSoCampeao(e.target.checked)} /> com melhor preço</label>
      <button className="btn" onClick={load} style={{ padding: '7px 11px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}><RefreshCw size={14} /></button>
    </div>

    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{filtered.length} cotação(ões) · {respondidas} respondida(s) no total</div>

    {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={26} /></div>
      : filtered.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>Nenhuma cotação com esses filtros.</div>
      : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(r => {
            const st = ST[r.c.status] || ST.respondida
            return <div key={r.c.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', borderLeft: r.campeao ? '3px solid #15803D' : '3px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{r.c.fornecedor_nome}</strong>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: st.bg, color: st.c }}>{st.l}</span>
                    {r.campeao > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: '#DCFCE7', color: '#15803D' }}>🏆 {r.campeao} campeão(ões)</span>}
                    {r.semPreco > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: '#FEF3C7', color: '#B45309' }}>{r.semPreco} sem preço</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>REQ-{String(r.req.numero).padStart(4, '0')} · {r.req.titulo} · {r.req.loja} · solic. {r.req.responsavel_nome}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#8B1212' }}>{fmtR$(r.total)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{r.cotados}/{r.nItens} itens</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '4px 14px', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                {fld('Enviada', fmtDT(r.req.created_at))}
                {fld('Respondida', fmtDT(r.c.updated_at || r.c.created_at))}
                {fld('Prazo entrega', r.c.prazo_entrega != null ? `${r.c.prazo_entrega} dias` : (r.obs.prazo_entrega || '—'))}
                {fld('Pagamento', r.obs.condicao_pagamento || '—')}
                {fld('Validade', r.obs.validade_proposta || '—')}
                {fld('Frete', r.obs.frete != null ? fmtR$(r.obs.frete) : '—')}
              </div>
              {r.obs.obs && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>“{r.obs.obs}”</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => setVer(r)} style={{ padding: '7px 13px', fontSize: 12.5 }}><Eye size={14} /> Ver cotação preenchida</button>
                {onAbrir && <button className="btn" onClick={() => onAbrir(r.req.id)} style={{ padding: '7px 13px', fontSize: 12.5, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>Abrir REQ para comparar →</button>}
              </div>
            </div>
          })}
        </div>}

    {/* Modal: ver cotação preenchida pelo fornecedor */}
    {ver && (
      <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }} onClick={() => setVer(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 720, margin: '24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <strong style={{ fontSize: 15 }}>🧾 {ver.c.fornecedor_nome} — REQ-{String(ver.req.numero).padStart(4, '0')}</strong>
            <button onClick={() => setVer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Respondida em {fmtDT(ver.c.updated_at || ver.c.created_at)} · {ver.obs.condicao_pagamento || 'pagamento —'} · {ver.obs.validade_proposta ? `validade ${ver.obs.validade_proposta}` : 'validade —'} · frete {ver.obs.frete != null ? fmtR$(ver.obs.frete) : '—'}</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 500 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: 6 }}>Produto</th><th className="num" style={{ textAlign: 'right' }}>Qtd</th><th>Marca</th><th className="num" style={{ textAlign: 'right' }}>Unit.</th><th className="num" style={{ textAlign: 'right' }}>Total</th>
              </tr></thead>
              <tbody>
                {ver.its.map((it: any) => {
                  const r = ver.myCi.find((x: any) => x.item_id === it.id)
                  const p = r && r.disponivel !== false ? Number(r.preco_unitario) || 0 : null
                  return <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6 }}>{it.produto_nome}</td>
                    <td style={{ padding: 6, textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{it.quantidade} {it.unidade}</td>
                    <td style={{ padding: 6, color: 'var(--muted)' }}>{r ? (parseMarca(r.observacoes) || '—') : '—'}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>{p != null ? fmtR$(p) : <span style={{ color: '#B45309' }}>indisp.</span>}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{p != null ? fmtR$(p * it.quantidade) : '—'}</td>
                  </tr>
                })}
              </tbody>
              <tfoot><tr style={{ borderTop: '2px solid var(--border)' }}><td colSpan={4} style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>Total</td><td style={{ padding: 6, textAlign: 'right', fontWeight: 800, color: '#8B1212' }}>{fmtR$(ver.total)}</td></tr></tfoot>
            </table>
          </div>
        </div>
      </div>
    )}
  </div>
}
